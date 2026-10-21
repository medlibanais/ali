// generate-quests: personalized "Coach pick" quests via Groq.
// Two entry modes:
//   - on-demand: authenticated user generates for their own today
//   - nightly:   cron secret generates tomorrow's quests for all users
// On success it converts up to AI_TARGET uncompleted predefined quests of
// the day into AI ones, keeping the day at ~15 quests with a real mix.
// JSON output is schema-validated; one retry; failures log 'fallback'.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callGroq } from '../_shared/llm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const AI_TARGET = 5;
const PILLARS = ['health', 'family', 'work', 'fun', 'spirituality'] as const;
const DIFFICULTY_XP: Record<string, number> = { easy: 10, medium: 20, hard: 50 };

interface GeneratedQuest {
  pillar: string;
  title: string;
  description: string;
  difficulty: string;
  xp_reward: number;
  time_estimate_minutes: number;
  why_this_matters: string;
}

function validQuests(raw: unknown): GeneratedQuest[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GeneratedQuest[] = [];
  for (const q of raw) {
    if (!q || typeof q !== 'object') return null;
    const o = q as Record<string, unknown>;
    if (
      typeof o.pillar !== 'string' ||
      !PILLARS.includes(o.pillar as (typeof PILLARS)[number]) ||
      typeof o.title !== 'string' ||
      o.title.trim().length < 4 ||
      o.title.length > 80 ||
      typeof o.description !== 'string' ||
      o.description.length > 240 ||
      typeof o.difficulty !== 'string' ||
      !(o.difficulty in DIFFICULTY_XP) ||
      DIFFICULTY_XP[o.difficulty as string] !== o.xp_reward
    ) {
      return null;
    }
    out.push({
      pillar: o.pillar,
      title: (o.title as string).trim(),
      description: (o.description as string).trim(),
      difficulty: o.difficulty,
      xp_reward: o.xp_reward as number,
      time_estimate_minutes:
        typeof o.time_estimate_minutes === 'number'
          ? Math.min(480, Math.max(5, Math.round(o.time_estimate_minutes)))
          : 30,
      why_this_matters:
        typeof o.why_this_matters === 'string'
          ? o.why_this_matters.slice(0, 200)
          : '',
    });
  }
  return out.length >= 4 && out.length <= 7 ? out : null;
}

function extractJson(text: string): unknown | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? 'prayerlock-dev-cron-secret';
  const admin = createClient(supabaseUrl, serviceKey);

  // ---- auth: cron secret (all users) or user JWT (self only) ----
  let targetUserIds: string[] = [];
  let mode = 'on_demand';
  try {
    const body = await req.json().catch(() => ({}));
    mode = body?.mode === 'nightly' ? 'nightly' : 'on_demand';

    if (mode === 'nightly') {
      if (req.headers.get('x-cron-secret') !== cronSecret) {
        return json({ error: 'invalid_cron_secret' }, 401);
      }
      const { data: users } = await admin
        .from('profiles')
        .select('id')
        .eq('onboarding_completed', true);
      targetUserIds = (users ?? []).map((u: { id: string }) => u.id);
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'missing_authorization' }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (!user) return json({ error: 'invalid_session' }, 401);
      targetUserIds = [user.id];
    }
  } catch (e) {
    return json(
      { error: 'bad_request', message: e instanceof Error ? e.message : 'error' },
      400,
    );
  }

  const results: Record<string, string> = {};
  for (const userId of targetUserIds) {
    results[userId] = await generateForUser(admin, userId, mode);
  }

  return json({ ok: true, mode, results }, 200);
});

async function generateForUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  mode: string,
): Promise<string> {
  const started = Date.now();

  // Resolve target date in the user's timezone (tomorrow for nightly runs).
  const { data: tzRow } = await admin
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  const tz = tzRow?.timezone ?? 'UTC';
  const { data: todayRow } = await admin
    .rpc('today_in_tz', { p_tz: tz })
    .maybeSingle();
  const today = (todayRow as unknown as string) ??
    new Date().toISOString().slice(0, 10);
  const target =
    mode === 'nightly'
      ? new Date(Date.parse(`${today}T00:00:00Z`) + 86400000)
          .toISOString()
          .slice(0, 10)
      : today;

  // Idempotent: already generated for this date?
  const { data: existing } = await admin
    .from('quest_generation_log')
    .select('status, generated_count')
    .eq('user_id', userId)
    .eq('target_date', target)
    .maybeSingle();
  if (existing?.status === 'ok' && existing.generated_count > 0) {
    return 'already_done';
  }

  // Context: goals, level, weakest pillar, recent titles (avoid repeats).
  const [goalsRes, gamRes, recentRes, scoresRes] = await Promise.all([
    admin.from('user_goals').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('gamification').select('level').eq('user_id', userId).maybeSingle(),
    admin
      .from('quests')
      .select('title, assigned_date')
      .eq('user_id', userId)
      .gte('assigned_date', new Date(Date.parse(`${target}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10))
      .lt('assigned_date', target),
    admin
      .from('daily_scores')
      .select('*')
      .eq('user_id', userId)
      .order('score_date', { ascending: false })
      .limit(7),
  ]);

  const goals = goalsRes.data ?? {};
  const level = gamRes.data?.level ?? 1;
  const recentTitles = (recentRes.data ?? []).map(
    (q: { title: string }) => q.title,
  );
  const scores = scoresRes.data ?? [];
  const weakest = weakestPillar(scores);

  const prompt = buildPrompt(goals, level, weakest, recentTitles, target);
  let quests: GeneratedQuest[] | null = null;
  let lastError = '';

  for (let attempt = 0; attempt < 2 && !quests; attempt += 1) {
    const llm = await callGroq(
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Generate today's ${AI_TARGET} quests as a JSON array only.${attempt > 0 ? ' Previous output was invalid — return ONLY valid JSON matching the schema.' : ''}`,
        },
      ],
      { maxTokens: 900, temperature: 0.8 },
    );
    if (!llm.ok) {
      lastError = llm.error ?? 'llm_error';
      continue;
    }
    const parsed = extractJson(llm.text);
    quests = parsed ? validQuests(parsed) : null;
    if (!quests) lastError = 'invalid_schema';
  }

  if (!quests) {
    await admin.from('quest_generation_log').upsert({
      user_id: userId,
      target_date: target,
      status: 'fallback',
      generated_count: 0,
      error: lastError,
      duration_ms: Date.now() - started,
    });
    return `fallback:${lastError}`;
  }

  // Insert AI quests (skip titles already on the day).
  const rows = quests.map((q, i) => ({
    user_id: userId,
    predefined_id: null,
    pillar: q.pillar,
    title: q.title,
    description: q.description,
    difficulty: q.difficulty,
    xp_reward: q.xp_reward,
    is_ai_generated: true,
    why_this_matters: q.why_this_matters,
    time_estimate_minutes: q.time_estimate_minutes,
    assigned_date: target,
    priority: 10 + i,
  }));
  const { data: inserted, error: insertError } = await admin
    .from('quests')
    .upsert(rows, { onConflict: 'user_id,title,assigned_date' })
    .select('id');

  if (insertError) {
    await admin.from('quest_generation_log').upsert({
      user_id: userId,
      target_date: target,
      status: 'failed',
      generated_count: 0,
      error: insertError.message,
      duration_ms: Date.now() - started,
    });
    return `failed:${insertError.message}`;
  }

  // Convert the mix: drop the same number of uncompleted predefined quests
  // so the day stays at ~15 with real AI representation.
  const aiCount = inserted?.length ?? 0;
  const { data: predefinedToday } = await admin
    .from('quests')
    .select('id')
    .eq('user_id', userId)
    .eq('assigned_date', target)
    .eq('is_ai_generated', false)
    .order('priority', { ascending: false })
    .limit(aiCount);
  const dropIds = (predefinedToday ?? []).map((q: { id: string }) => q.id);
  if (dropIds.length > 0) {
    await admin.from('quests').delete().in('id', dropIds);
  }

  await admin.from('quest_generation_log').upsert({
    user_id: userId,
    target_date: target,
    status: 'ok',
    generated_count: aiCount,
    duration_ms: Date.now() - started,
  });
  await admin.rpc('recompute_daily_score', {
    p_user: userId,
    p_date: target,
  });
  return `ok:${aiCount}`;
}

function weakestPillar(scores: Record<string, number>[]): string {
  if (scores.length === 0) return 'health';
  const totals: Record<string, number> = {
    health: 0, family: 0, work: 0, fun: 0, spirituality: 0,
  };
  for (const row of scores) {
    for (const p of PILLARS) totals[p] += row[p] ?? 0;
  }
  return PILLARS.reduce((a, b) => (totals[a] <= totals[b] ? a : b));
}

function buildPrompt(
  goals: Record<string, unknown>,
  level: number,
  weakest: string,
  recentTitles: string[],
  target: string,
): string {
  const hobbies = Array.isArray(goals.hobbies)
    ? (goals.hobbies as string[]).join(', ')
    : 'reading, sports';
  return `You generate daily quests for an identity-based habit tracker. Date: ${target}.

USER CONTEXT:
- Level ${level}; goals: ${goals.workouts_per_week ?? 3} workouts/week, ${goals.sleep_target_hours ?? 8}h sleep, deep work ${goals.deep_work_hours_per_week ?? 20}h/week toward "${goals.career_goal ?? 'their career goal'}"${goals.skill_to_develop ? `, learning ${goals.skill_to_develop}` : ''}
- Hobbies: ${hobbies}
- Family: call parents ${goals.call_parents_frequency ?? 'weekly'}
- Spirituality: ${goals.religion ?? 'general'}${goals.prayer_frequency ? `, ${goals.prayer_frequency}` : ''}${goals.spiritual_practice ? `, ${goals.spiritual_practice}` : ''}
- Weakest pillar lately: ${weakest} (include 1-2 quests there, but keep balance)
- DO NOT repeat or rephrase these recent titles: ${recentTitles.slice(0, 25).join('; ') || 'none'}

TASK: output a JSON array of exactly ${AI_TARGET} quests. Each:
{"pillar": "health|family|work|fun|spirituality", "title": "<4-80 chars, action verb first>", "description": "<specific, measurable, max 200 chars>", "difficulty": "easy|medium|hard", "xp_reward": 10 for easy, 20 for medium, 50 for hard, "time_estimate_minutes": 5-240, "why_this_matters": "<one sentence tied to THEIR goals, max 160 chars>"}

RULES: valid JSON only, no markdown, no commentary. At most 2 hard quests. Mix difficulties (~1 easy, 3 medium, 1 hard). Quests must be completable in one day. Personalize to hobbies/religion/career above — never generic.`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
