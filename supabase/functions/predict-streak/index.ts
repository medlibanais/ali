// predict-streak: hourly (pg_cron, cron secret only). For every onboarded
// user it predicts the chance of completing at least one quest tomorrow
// (their local day), stores it on gamification.streak_probability, and
// sends one 'streak_rescue' push per local day when the chance is below
// 30% and there is a live streak to save.
//
// Data used (last 30 days, the user's timezone): quest_completions that
// were not undone, daily_scores.overall / completed_count, and
// gamification.current_streak. The model is in _shared/streakModel.ts.
// Fewer than 7 full days of history stores NULL ("Not enough data").
//
// Written with the service role: the app itself can never write
// gamification (0012 trigger + 0013 revoke), so the number can't be faked.

import { matchesConfiguredSecret } from '../_shared/configuredSecret.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { deliver } from '../_shared/push.ts';
import {
  localDay,
  predictStreak,
  RESCUE_THRESHOLD,
  shiftDay,
  WINDOW_DAYS,
} from '../_shared/streakModel.ts';

type Admin = ReturnType<typeof createClient>;

const DAY_MS = 86400000;
// Same once-per-day bucket as smart-notify's streak_risk: never both.
const STREAK_PUSH_TYPES = ['streak_rescue', 'streak_risk'];

interface Profile {
  id: string;
  first_name: string | null;
  timezone: string | null;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!matchesConfiguredSecret(req.headers.get('x-cron-secret'), cronSecret)) {
    return json({ error: 'invalid_cron_secret' }, 401);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: users, error } = await admin
    .from('profiles')
    .select('id, first_name, timezone, created_at')
    .eq('onboarding_completed', true);
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, string> = {};
  for (const u of (users ?? []) as Profile[]) {
    try {
      results[u.id] = await predictUser(admin, u);
    } catch (e) {
      results[u.id] = `error:${e instanceof Error ? e.message : 'unknown'}`;
    }
  }
  return json({ ok: true, results }, 200);
});

async function predictUser(admin: Admin, user: Profile): Promise<string> {
  const tz = user.timezone ?? 'UTC';
  const now = new Date();
  const today = localDay(now, tz);
  const from = shiftDay(today, -WINDOW_DAYS);
  // One extra day of completions so every local day in the window is whole.
  const sinceInstant = new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS).toISOString();

  const [gamRes, scoresRes, completionsRes] = await Promise.all([
    admin
      .from('gamification')
      .select('current_streak')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('daily_scores')
      .select('score_date, overall, completed_count')
      .eq('user_id', user.id)
      .gte('score_date', from)
      .lte('score_date', today),
    admin
      .from('quest_completions')
      .select('completed_at')
      .eq('user_id', user.id)
      .is('undone_at', null)
      .gte('completed_at', sinceInstant),
  ]);
  if (gamRes.error) throw gamRes.error;
  if (!gamRes.data) return 'no_gamification_row';

  const scores = (scoresRes.data ?? []) as {
    score_date: string;
    overall: number;
    completed_count: number;
  }[];
  const completions = (completionsRes.data ?? []) as { completed_at: string }[];

  const activeDays = new Set<string>();
  const overallByDay = new Map<string, number>();
  for (const s of scores) {
    overallByDay.set(s.score_date, s.overall);
    if (s.completed_count > 0) activeDays.add(s.score_date);
  }
  for (const c of completions) activeDays.add(localDay(c.completed_at, tz));

  // History starts at signup or the first row we have, whichever is first.
  const known = [localDay(user.created_at, tz), ...scores.map((s) => s.score_date)].sort();
  const streak = (gamRes.data as { current_streak: number }).current_streak ?? 0;

  const prediction = predictStreak({
    today,
    firstDay: known[0] ?? null,
    activeDays,
    overallByDay,
    currentStreak: streak,
  });

  const { error: upErr } = await admin
    .from('gamification')
    .update({
      streak_probability: prediction.probability,
      streak_prediction_for: prediction.forDay,
      streak_prediction_at: now.toISOString(),
      streak_prediction_detail: prediction.detail,
    })
    .eq('user_id', user.id);
  if (upErr) throw upErr;

  const p = prediction.probability;
  if (p === null) return 'not_enough_data';
  if (p >= RESCUE_THRESHOLD || streak <= 0) return `p=${p}`;

  // Rescue push: once per local day, shared with smart-notify's streak_risk.
  const { data: bounds } = await admin
    .rpc('day_bounds_in_tz', { p_tz: tz })
    .maybeSingle();
  const dayStart =
    (bounds as { day_start?: string } | null)?.day_start ?? `${today}T00:00:00Z`;
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('type', STREAK_PUSH_TYPES)
    .gte('created_at', dayStart);
  if ((count ?? 0) > 0) return `p=${p}:rescue_already_sent`;

  // Only in the user's waking hours, so the push lands the same day.
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: safeTz(tz), hour: '2-digit', hourCycle: 'h23' })
      .format(now),
  );
  if (hour < 9 || hour >= 21) return `p=${p}:rescue_outside_window`;

  const name = user.first_name ?? 'friend';
  const r = await deliver(admin, user.id, {
    type: 'streak_rescue',
    title: "Let's rescue our streak",
    body: `Our ${streak}-day streak looks shaky for tomorrow, ${name}. One small quest keeps it alive. Let's pick it now.`,
    data: { screen: 'Today', probability: p },
  });
  return `p=${p}:streak_rescue:${r.reason ?? 'ok'}`;
}

function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
