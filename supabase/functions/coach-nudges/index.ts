// coach-nudges: the Future Self's smart notifications (SRS FR-5.2).
// Runs hourly via pg_cron (cron secret only). For each user it works in
// their own timezone and sends at most one nudge per run:
//   missed_quest      quests still open at 6 PM               1x/day
//   streak_risk       live streak, nothing done today by 7 PM 1x/day
//   low_pillar        a pillar averaged < 30% over 3 days     1x/3 days
//   behavior_pattern  same quest missed 3 days in a row       1x/week
// Level-up messages are written by the database the moment it happens.
// Delivery (center + push, opt-outs, quiet hours, 3/day cap) is shared.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { deliver } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const PILLARS = ['health', 'family', 'work', 'fun', 'spirituality'] as const;
const PILLAR_LABEL: Record<string, string> = {
  health: 'Health',
  family: 'Family',
  work: 'Work',
  fun: 'Fun',
  spirituality: 'Spirituality',
};
const DAY_MS = 86400000;

type Admin = ReturnType<typeof createClient>;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? 'prayerlock-dev-cron-secret';
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'invalid_cron_secret' }, 401);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: users } = await admin
    .from('profiles')
    .select('id, first_name, timezone')
    .eq('onboarding_completed', true);

  const results: Record<string, string> = {};
  for (const u of users ?? []) {
    try {
      results[u.id] = await nudgeUser(admin, u);
    } catch (e) {
      results[u.id] = `error:${e instanceof Error ? e.message : 'unknown'}`;
    }
  }
  return json({ ok: true, results }, 200);
});

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Was a nudge of this type created at or after the given instant? */
async function sentSince(
  admin: Admin,
  userId: string,
  type: string,
  since: string,
): Promise<boolean> {
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', type)
    .gte('created_at', since);
  return (count ?? 0) > 0;
}

async function nudgeUser(
  admin: Admin,
  user: { id: string; first_name: string | null; timezone: string | null },
): Promise<string> {
  const tz = user.timezone ?? 'UTC';
  const name = user.first_name ?? 'friend';
  const [{ data: hourRow }, { data: bounds }] = await Promise.all([
    admin.rpc('hour_in_tz', { p_tz: tz }).maybeSingle(),
    admin.rpc('day_bounds_in_tz', { p_tz: tz }).maybeSingle(),
  ]);
  const hour = (hourRow as unknown as number) ?? new Date().getUTCHours();
  const b = bounds as { day_start: string; d: string } | null;
  if (!b) return 'no_clock';
  const today = b.d;
  const dayStart = b.day_start;

  // Coach speaks only between 8 AM and 10 PM local (FR-5.2 time window).
  if (hour < 8 || hour >= 22) return 'outside_window';

  const [questsRes, gamRes, goalsRes] = await Promise.all([
    admin
      .from('quests')
      .select('id, title, pillar, xp_reward, skipped, assigned_date, quest_completions(id, undone_at)')
      .eq('user_id', user.id)
      .gte('assigned_date', shiftDate(today, -3))
      .lte('assigned_date', today),
    admin
      .from('gamification')
      .select('current_streak, last_active_date')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('user_goals')
      .select('career_goal, skill_to_develop, religion, workouts_per_week')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  type Row = {
    id: string;
    title: string;
    pillar: string;
    xp_reward: number;
    skipped: boolean;
    assigned_date: string;
    quest_completions: { id: string; undone_at: string | null }[];
  };
  const quests = (questsRes.data ?? []) as Row[];
  const done = (q: Row) =>
    (q.quest_completions ?? []).some((c) => c.undone_at === null);
  const todays = quests.filter((q) => q.assigned_date === today);
  const openToday = todays.filter((q) => !q.skipped && !done(q));
  const doneToday = todays.filter(done).length;
  const goals = goalsRes.data ?? {};
  const streak = gamRes.data?.current_streak ?? 0;

  // 1) Missed quest: still open at 6 PM.
  if (
    hour >= 18 &&
    openToday.length > 0 &&
    !(await sentSince(admin, user.id, 'missed_quest', dayStart))
  ) {
    const q = [...openToday].sort((a, b) => b.xp_reward - a.xp_reward)[0];
    const r = await deliver(admin, user.id, {
      type: 'missed_quest',
      title: `${name}, one more for today`,
      body: `I'm waiting for you to complete "${q.title}". ${goalLine(q.pillar, goals)}`,
      data: { quest_id: q.id },
    });
    return `missed_quest:${r.reason ?? 'ok'}`;
  }

  // 2) Streak risk: a live streak and nothing done yet today.
  if (
    hour >= 19 &&
    streak > 0 &&
    doneToday === 0 &&
    gamRes.data?.last_active_date !== today &&
    !(await sentSince(admin, user.id, 'streak_risk', dayStart))
  ) {
    const r = await deliver(admin, user.id, {
      type: 'streak_risk',
      title: 'Our streak is at risk',
      body: `Our ${streak}-day streak is at risk, ${name}. Let's do one quest together.`,
    });
    return `streak_risk:${r.reason ?? 'ok'}`;
  }

  // 3) Low pillar: average under 30% across the last 3 full days.
  const threeDaysAgo = new Date(Date.parse(dayStart) - 3 * DAY_MS).toISOString();
  if (hour >= 12 && !(await sentSince(admin, user.id, 'low_pillar', threeDaysAgo))) {
    const { data: scores } = await admin
      .from('daily_scores')
      .select('*')
      .eq('user_id', user.id)
      .gte('score_date', shiftDate(today, -3))
      .lt('score_date', today);
    const rows = (scores ?? []) as Record<string, number>[];
    if (rows.length >= 3) {
      const avg = PILLARS.map((p) => ({
        p,
        v: rows.reduce((s, r) => s + (r[p] ?? 0), 0) / rows.length,
      })).sort((a, b) => a.v - b.v)[0];
      if (avg.v < 30) {
        const r = await deliver(admin, user.id, {
          type: 'low_pillar',
          title: `${PILLAR_LABEL[avg.p]} needs us`,
          body: `We haven't focused on ${PILLAR_LABEL[avg.p]} lately, ${name}. Pick one quest there today. ${goalLine(avg.p, goals)}`,
          data: { pillar: avg.p },
        });
        return `low_pillar:${r.reason ?? 'ok'}`;
      }
    }
  }

  // 4) Behavioral pattern: the same quest missed on each of the last 3 days.
  const weekAgo = new Date(Date.parse(dayStart) - 7 * DAY_MS).toISOString();
  if (hour >= 9 && !(await sentSince(admin, user.id, 'behavior_pattern', weekAgo))) {
    const days = [-3, -2, -1].map((d) => shiftDate(today, d));
    const missedBy = new Map<string, Set<string>>();
    for (const q of quests) {
      if (!days.includes(q.assigned_date) || done(q)) continue;
      const set = missedBy.get(q.title) ?? new Set<string>();
      set.add(q.assigned_date);
      missedBy.set(q.title, set);
    }
    const repeat = [...missedBy.entries()].find(([, s]) => s.size === 3);
    if (repeat) {
      const r = await deliver(admin, user.id, {
        type: 'behavior_pattern',
        title: 'I noticed a pattern',
        body: `We've let "${repeat[0]}" slide three days in a row. Let's change that today, ${name}.`,
        data: { title: repeat[0] },
      });
      return `behavior_pattern:${r.reason ?? 'ok'}`;
    }
  }

  return 'nothing_due';
}

/** One short line tying the nudge back to the user's own goal. */
function goalLine(pillar: string, goals: Record<string, unknown>): string {
  switch (pillar) {
    case 'work':
      return goals.career_goal
        ? `Every step moves us toward "${goals.career_goal}".`
        : 'Every focused hour compounds.';
    case 'health':
      return `${goals.workouts_per_week ?? 3} workouts a week is who we are.`;
    case 'spirituality':
      return goals.religion
        ? 'Our faith is the anchor of the day.'
        : 'A few quiet minutes keep us grounded.';
    case 'family':
      return 'The people we love are the point.';
    default:
      return 'Joy is part of the plan too.';
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
