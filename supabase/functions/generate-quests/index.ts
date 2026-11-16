// generate-quests: personalized "Coach pick" quests via Groq.
// Two entry modes:
//   - on-demand: authenticated user generates for their own today
//   - nightly:   cron secret generates tomorrow's quests for all users
// Before calling Groq it asks calculate_user_difficulty (migration 0015)
// for the user's adaptive level and puts it in the system prompt. Groq
// returns 15 quests (3 per pillar) biased to that level; the reply is
// validated against QUEST_SCHEMA plus the level's Easy/Hard caps before
// anything is inserted. One retry with the validation errors; failures
// log 'fallback'. On success the AI quests replace the day's untouched
// predefined quests.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callGroq } from '../_shared/llm.ts';
import {
  type DifficultyProfile,
  difficultyInstruction,
  extractJson,
  type GeneratedQuest,
  PILLARS,
  profileForLevel,
  QUEST_COUNT,
  validateGenerated,
} from './questSchema.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Rough output budget for 15 quests (~150 tokens each) plus JSON overhead.
const MAX_OUTPUT_TOKENS = 3000;

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

  // Adaptive difficulty. If the RPC fails (e.g. migration 0015 not
  // applied yet) generation still runs at Beginner and the log says why.
  const { data: diffRow, error: diffError } = await admin
    .rpc('calculate_user_difficulty', { p_user_id: userId })
    .maybeSingle();
  if (diffError) {
    console.warn('calculate_user_difficulty failed', diffError.message);
  }
  const profile = profileForLevel(
    (diffRow as { level?: number } | null)?.level,
  );

  const prompt = buildPrompt(goals, level, weakest, recentTitles, target, profile);
  let quests: GeneratedQuest[] | null = null;
  let lastError = diffError ? `difficulty_rpc: ${diffError.message}` : '';
  let feedback = '';

  for (let attempt = 0; attempt < 2 && !quests; attempt += 1) {
    const llm = await callGroq(
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Generate the ${QUEST_COUNT} quests now as one JSON object {"quests": [...]}.${feedback}`,
        },
      ],
      {
        maxTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.8,
        timeoutMs: 30000,
        retries: 1,
        useFallbackModel: true,
        jsonObject: true,
      },
    );
    if (!llm.ok) {
      lastError = llm.error ?? 'llm_error';
      continue;
    }
    const parsed = extractJson(llm.text);
    if (parsed === null) {
      lastError = 'invalid_json';
      feedback = ' Your previous reply was not valid JSON. Return ONLY the JSON object.';
      continue;
    }
    const checked = validateGenerated(parsed, profile);
    if (checked.ok) {
      quests = checked.quests;
    } else {
      lastError = `invalid_schema: ${checked.errors.join('; ')}`.slice(0, 500);
      feedback = ` Your previous reply broke these rules, fix them: ${checked.errors.join('; ')}`.slice(0, 800);
    }
  }

  if (!quests) {
    await admin.from('quest_generation_log').upsert({
      user_id: userId,
      target_date: target,
      status: 'fallback',
      generated_count: 0,
      difficulty_level: profile.level,
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
      difficulty_level: profile.level,
      error: insertError.message,
      duration_ms: Date.now() - started,
    });
    return `failed:${insertError.message}`;
  }

  // Convert the mix: drop the same number of untouched predefined quests
  // so the day stays at ~15 with real AI representation. Completed or
  // skipped quests stay (deleting one would erase its completion while
  // its XP remains). Carried-over skips (priority 0) stay too. On nightly
  // runs the day has no predefined quests yet; assign_daily_quests fills
  // around the AI quests when the user opens the app.
  const aiCount = inserted?.length ?? 0;
  const { data: predefinedToday } = await admin
    .from('quests')
    .select('id, skipped, priority, quest_completions(id, undone_at)')
    .eq('user_id', userId)
    .eq('assigned_date', target)
    .eq('is_ai_generated', false)
    .order('priority', { ascending: false });
  const dropIds = (
    (predefinedToday ?? []) as {
      id: string;
      skipped: boolean;
      priority: number;
      quest_completions: { id: string; undone_at: string | null }[];
    }[]
  )
    .filter(
      (q) =>
        !q.skipped &&
        q.priority > 0 &&
        !(q.quest_completions ?? []).some((c) => c.undone_at === null),
    )
    .slice(0, aiCount)
    .map((q) => q.id);
  if (dropIds.length > 0) {
    await admin.from('quests').delete().in('id', dropIds);
  }

  await admin.from('quest_generation_log').upsert({
    user_id: userId,
    target_date: target,
    status: 'ok',
    generated_count: aiCount,
    difficulty_level: profile.level,
    error: diffError ? `difficulty_rpc: ${diffError.message}`.slice(0, 500) : null,
    duration_ms: Date.now() - started,
  });
  await admin.rpc('recompute_daily_score', {
    p_user: userId,
    p_date: target,
  });
  return `ok:${aiCount}:${profile.label}`;
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
  profile: DifficultyProfile,
): string {
  const hobbies = Array.isArray(goals.hobbies)
    ? (goals.hobbies as string[]).join(', ')
    : 'reading, sports';
  return `You generate daily quests for an identity-based habit tracker. Date: ${target}.

DIFFICULTY: ${difficultyInstruction(profile)}

USER CONTEXT:
- Level ${level}; goals: ${goals.workouts_per_week ?? 3} workouts/week, ${goals.sleep_target_hours ?? 8}h sleep, deep work ${goals.deep_work_hours_per_week ?? 20}h/week toward "${goals.career_goal ?? 'their career goal'}"${goals.skill_to_develop ? `, learning ${goals.skill_to_develop}` : ''}
- Hobbies: ${hobbies}
- Family: call parents ${goals.call_parents_frequency ?? 'weekly'}
- Spirituality: ${goals.religion ?? 'general'}${goals.prayer_frequency ? `, ${goals.prayer_frequency}` : ''}${goals.spiritual_practice ? `, ${goals.spiritual_practice}` : ''}
- Weakest pillar lately: ${weakest} (make its quests especially concrete and inviting)
- DO NOT repeat or rephrase these recent titles: ${recentTitles.slice(0, 25).join('; ') || 'none'}

TASK: output ONE JSON object {"quests": [...]} with exactly ${QUEST_COUNT} quests, exactly 3 per pillar (${PILLARS.join(', ')}). Each quest:
{"pillar": "health|family|work|fun|spirituality", "title": "<4-80 chars, action verb first>", "description": "<specific, measurable, max 200 chars>", "difficulty": "easy|medium|hard", "xp_reward": 10 for easy, 20 for medium, 50 for hard, "time_estimate_minutes": integer 5-240, "why_this_matters": "<one sentence tied to THEIR goals, max 160 chars>"}

RULES: valid JSON only, no markdown, no commentary, no extra keys. All titles different. Easy = under 15 minutes, Medium = 15-45 minutes of focus, Hard = a real stretch (45+ minutes or uncomfortable). Quests must be completable in one day. Personalize to hobbies/religion/career above — never generic.`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
