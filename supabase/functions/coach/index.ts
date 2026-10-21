// coach: the user's Future Self.
// Intent-routed: safety paths are deterministic; general conversation goes
// to Groq with the user's real goals/progress injected. 20 messages/day,
// enforced here — never trust the client counter.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { classifyIntent, safetyResponse } from '../_shared/intents.ts';
import { callGroq, type ChatTurn } from '../_shared/llm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const DAILY_LIMIT = 20;
const INPUT_MAX = 500;
const OUTPUT_MAX_CHARS = 300;

const BANNED_RE =
  /(you should|you must|you failed|you are weak|you'?re lazy|shame on you|take \d+\s?(mg|ml)|i diagnose|you have (adhd|depression|covid|flu|diabetes))/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'invalid_session' }, 401);

    let message = '';
    try {
      const body = await req.json();
      message = typeof body?.message === 'string' ? body.message.trim() : '';
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    if (message.length === 0) return json({ error: 'empty_message' }, 400);
    if (message.length > INPUT_MAX) {
      return json({ error: 'message_too_long', max: INPUT_MAX }, 400);
    }

    // Service client for rate limiting + writes (user already authenticated).
    const admin = createClient(supabaseUrl, serviceKey);

    // ---- daily limit (user's timezone, server-side) ----
    const { data: profile } = await admin
      .from('profiles')
      .select('timezone, first_name')
      .eq('id', user.id)
      .maybeSingle();
    const tz = profile?.timezone ?? 'UTC';
    const { data: boundsRow } = await admin
      .rpc('day_bounds_in_tz', { p_tz: tz })
      .maybeSingle();
    const bounds = boundsRow as
      | { day_start: string; day_end: string; d: string }
      | null;
    const today: string =
      bounds?.d ?? new Date().toISOString().slice(0, 10);
    const dayStart = bounds?.day_start ?? `${today}T00:00:00Z`;
    const dayEnd = bounds?.day_end ?? `${today}T23:59:59.999Z`;

    const { data: conversation } = await admin
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId = conversation?.id as string | undefined;
    if (!conversationId) {
      const { data: created } = await admin
        .from('conversations')
        .insert({ user_id: user.id })
        .select('id')
        .single();
      conversationId = created?.id;
    }

    const { count: sentToday } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd);

    if ((sentToday ?? 0) >= DAILY_LIMIT) {
      return json(
        {
          error: 'rate_limit_exceeded',
          message: 'Daily message limit reached. Resets at midnight.',
          remaining_today: 0,
        },
        429,
      );
    }

    // ---- context for the LLM (and for the UI badge) ----
    const [goalsRes, gamRes, scoreRes, badgesRes, historyRes] =
      await Promise.all([
        admin.from('user_goals').select('*').eq('user_id', user.id).maybeSingle(),
        admin.from('gamification').select('*').eq('user_id', user.id).maybeSingle(),
        admin
          .from('daily_scores')
          .select('*')
          .eq('user_id', user.id)
          .eq('score_date', today)
          .maybeSingle(),
        admin
          .from('achievements')
          .select('badge_id')
          .eq('user_id', user.id)
          .order('unlocked_at', { ascending: false })
          .limit(3),
        admin
          .from('messages')
          .select('role, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

    const goals = goalsRes.data ?? {};
    const gam = gamRes.data ?? {};
    const score = scoreRes.data ?? {};
    const level: number = gam.level ?? 1;
    const dailyScore: number = score.overall ?? 0;
    const streak: number = gam.current_streak ?? 0;

    const contextUsed = {
      user_level: level,
      daily_score: dailyScore,
      streak,
    };

    // ---- intent routing: safety first, LLM second ----
    const intent = classifyIntent(message);
    let reply: string;
    let model = 'safety-rules';

    if (intent !== 'general') {
      reply = safetyResponse(intent);
    } else {
      const systemPrompt = buildSystemPrompt(
        profile?.first_name ?? 'friend',
        goals,
        gam,
        score,
        (badgesRes.data ?? []).map((b: { badge_id: string }) => b.badge_id),
      );
      const history: ChatTurn[] = (historyRes.data ?? [])
        .reverse()
        .map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role,
          content: m.content.slice(0, 300),
        }));
      const turns: ChatTurn[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      const llm = await callGroq(turns, { maxTokens: 120, temperature: 0.7 });
      if (llm.ok) {
        reply = postFilter(llm.text) ?? fallbackReply(level, dailyScore, streak, score);
        model = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
      } else {
        // Graceful, still-personal fallback when the model is unreachable.
        reply = fallbackReply(level, dailyScore, streak, score);
        model = `fallback(${llm.error ?? 'unknown'})`;
      }
    }

    // ---- persist both messages ----
    const { data: userRow } = await admin
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'user', content: message })
      .select('id, content, created_at')
      .single();
    const { data: aiRow } = await admin
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: reply })
      .select('id, content, created_at')
      .single();

    return json(
      {
        user_message: userRow,
        ai_message: aiRow,
        remaining_today: DAILY_LIMIT - (sentToday ?? 0) - 1,
        context_used: contextUsed,
        intent,
        model,
      },
      200,
    );
  } catch (e) {
    return json(
      { error: 'internal', message: e instanceof Error ? e.message : 'error' },
      500,
    );
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildSystemPrompt(
  firstName: string,
  goals: Record<string, unknown>,
  gam: Record<string, unknown>,
  score: Record<string, unknown>,
  badges: string[],
): string {
  const pillarLine = `Health ${score.health ?? 0}%, Family ${score.family ?? 0}%, Work ${score.work ?? 0}%, Fun ${score.fun ?? 0}%, Spirituality ${score.spirituality ?? 0}%`;
  return `You are ${firstName}'s Future Self. You already live the life they are building toward: ${goals.workouts_per_week ?? 3} workouts a week, ${goals.sleep_target_hours ?? 8}h sleep, ${goals.deep_work_hours_per_week ?? 20}h deep work toward "${goals.career_goal ?? 'their goal'}", strong family bonds, and a steady spiritual practice${goals.religion ? ` (${goals.religion})` : ''}.

Their reality today: level ${gam.level ?? 1}, daily score ${score.overall ?? 0}%, streak ${gam.current_streak ?? 0} days, pillars: ${pillarLine}. Recent badges: ${badges.length ? badges.join(', ') : 'none yet'}.

RULES:
- Speak as their Future Self: "we", "us", "our" — never "you should".
- Max 3 short sentences. Warm, direct, specific to THEIR numbers above.
- Celebrate wins, treat setbacks as data, never shame or guilt.
- No generic advice ("drink water", "exercise more"). Reference their actual goals and scores.
- No medical, legal, or financial advice — decline and redirect.
- If they ask what to do next, name the weakest pillar from the scores above.`;
}

/** Hard post-filter: reject shaming/prescriptive/medical content from the model. */
function postFilter(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (BANNED_RE.test(trimmed)) return null;
  if (trimmed.length <= OUTPUT_MAX_CHARS) return trimmed;
  // Cut at the last sentence boundary under the cap.
  const cut = trimmed.slice(0, OUTPUT_MAX_CHARS);
  const lastStop = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  );
  return lastStop > 60 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/** Deterministic, still-personal answer when the model is unreachable. */
function fallbackReply(
  level: number,
  dailyScore: number,
  streak: number,
  score: Record<string, unknown>,
): string {
  const pillars: [string, number][] = [
    ['Health', (score.health as number) ?? 0],
    ['Family', (score.family as number) ?? 0],
    ['Work', (score.work as number) ?? 0],
    ['Fun', (score.fun as number) ?? 0],
    ['Spirituality', (score.spirituality as number) ?? 0],
  ];
  pillars.sort((a, b) => a[1] - b[1]);
  const weakest = pillars[0];
  return `We are level ${level} with a ${dailyScore}% today and a ${streak}-day streak — I am proud of that. My thinking is cloudy for a moment, but ${weakest[0]} still has room today. One quest there and we move.`;
}
