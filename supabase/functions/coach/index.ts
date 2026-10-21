// coach: the user's Future Self.
// Intent-routed: crisis / acute-medical / professional-advice paths are
// deterministic; everything else goes to Groq with the user's goals, today's
// quests, a 7-day trend and the conversation injected (prompt lives in
// _shared/coachText.ts). 20 messages/day, enforced here — never trust the
// client counter.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  classifyIntent,
  isDeterministic,
  safetyResponse,
} from '../_shared/intents.ts';
import { callGroq, type ChatTurn } from '../_shared/llm.ts';
import {
  buildSystemPrompt,
  type CoachContext,
  type DayScore,
  fallbackReply,
  type Pillar,
  PILLARS,
  postFilter,
  suggestions,
  type TodayQuest,
} from '../_shared/coachText.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const DAILY_LIMIT = 20;
const INPUT_MAX = 500;
const HISTORY_TURNS = 20; // SRS FR-5.1: last 20 messages as context

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
    const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const [
      goalsRes,
      gamRes,
      scoresRes,
      badgesRes,
      historyRes,
      weekRes,
      todayQuestsRes,
    ] = await Promise.all([
      admin.from('user_goals').select('*').eq('user_id', user.id).maybeSingle(),
      admin.from('gamification').select('*').eq('user_id', user.id).maybeSingle(),
      admin
        .from('daily_scores')
        .select('*')
        .eq('user_id', user.id)
        .gte('score_date', weekAgo)
        .lte('score_date', today)
        .order('score_date', { ascending: true }),
      admin
        .from('achievements')
        .select('badge_id, badge_catalog(name)')
        .eq('user_id', user.id)
        .order('unlocked_at', { ascending: false })
        .limit(3),
      admin
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_TURNS),
      admin
        .from('quests')
        .select('skipped, quest_completions(id, undone_at)')
        .eq('user_id', user.id)
        .gte('assigned_date', weekAgo)
        .lt('assigned_date', today),
      admin
        .from('quests')
        .select('title, pillar, xp_reward, skipped, priority, quest_completions(id, undone_at)')
        .eq('user_id', user.id)
        .eq('assigned_date', today)
        .order('priority', { ascending: true }),
    ]);

    type CompletionRow = { id: string; undone_at: string | null };
    const isDone = (c: CompletionRow[] | null) =>
      (c ?? []).some((x) => x.undone_at === null);

    const goals = goalsRes.data ?? {};
    const gam = gamRes.data ?? {};
    const scoreRows = (scoresRes.data ?? []) as Record<string, unknown>[];
    const toDay = (r: Record<string, unknown> | undefined, d: string): DayScore => ({
      date: d,
      overall: (r?.overall as number) ?? 0,
      pillars: Object.fromEntries(
        PILLARS.map((p) => [p, (r?.[p] as number) ?? 0]),
      ) as Record<Pillar, number>,
    });
    const todayScore = toDay(scoreRows.find((r) => r.score_date === today), today);
    const week = scoreRows
      .filter((r) => r.score_date !== today)
      .map((r) => toDay(r, r.score_date as string));

    const level: number = gam.level ?? 1;
    const totalXp: number = gam.total_xp ?? 0;
    const streak: number = gam.current_streak ?? 0;
    // Missed this week: past days' quests neither completed nor skipped.
    const missedThisWeek = (
      (weekRes.data ?? []) as {
        skipped: boolean;
        quest_completions: CompletionRow[];
      }[]
    ).filter((q) => !q.skipped && !isDone(q.quest_completions)).length;

    const quests: TodayQuest[] = (
      (todayQuestsRes.data ?? []) as {
        title: string;
        pillar: Pillar;
        xp_reward: number;
        skipped: boolean;
        quest_completions: CompletionRow[];
      }[]
    ).map((q) => ({
      title: q.title,
      pillar: q.pillar,
      xp: q.xp_reward,
      status: isDone(q.quest_completions)
        ? 'done'
        : q.skipped
          ? 'skipped'
          : 'pending',
    }));

    const ctx: CoachContext = {
      firstName: profile?.first_name || 'friend',
      localTime: localTime(tz),
      goals,
      level,
      totalXp,
      // Cumulative XP to reach level N is 500*(N*(N+1)/2 - 1) (see 0001_init).
      xpToNextLevel:
        level >= 100
          ? null
          : Math.max(0, 500 * (((level + 1) * (level + 2)) / 2 - 1) - totalXp),
      streak,
      bestStreak: gam.best_streak ?? streak,
      streakFreezes: gam.streak_freezes ?? 0,
      today: todayScore,
      week,
      quests,
      missedThisWeek,
      badges: (
        (badgesRes.data ?? []) as {
          badge_id: string;
          badge_catalog: { name: string } | { name: string }[] | null;
        }[]
      ).map((b) => {
        const cat = Array.isArray(b.badge_catalog) ? b.badge_catalog[0] : b.badge_catalog;
        return cat?.name ?? b.badge_id;
      }),
    };

    const contextUsed = {
      user_level: level,
      daily_score: todayScore.overall,
      streak,
    };

    // ---- intent routing: safety first, LLM second ----
    const intent = classifyIntent(message);
    let reply: string;
    let model = 'safety-rules';

    if (isDeterministic(intent)) {
      reply = safetyResponse(intent);
    } else {
      const history: ChatTurn[] = (historyRes.data ?? [])
        .reverse()
        .map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role,
          content: m.content.slice(0, 600),
        }));
      const turns: ChatTurn[] = [
        { role: 'system', content: buildSystemPrompt(ctx) },
        ...history,
      ];
      if (intent === 'wellbeing') {
        turns.push({
          role: 'system',
          content:
            'They seem tired, stressed, unwell or low. Lead with care, offer a lighter day, no diagnosis or medication.',
        });
      }
      turns.push({ role: 'user', content: message });

      const llm = await callGroq(turns, {
        maxTokens: 220,
        temperature: 0.8,
        timeoutMs: 12000,
        retries: 1,
        useFallbackModel: true,
      });
      const filtered = llm.ok ? postFilter(llm.text) : null;
      if (filtered) {
        reply = filtered;
        model = llm.model ?? 'groq';
      } else {
        // Graceful, still-personal fallback when the model is unreachable.
        reply = fallbackReply(ctx);
        model = `fallback(${llm.ok ? 'filtered' : llm.error ?? 'unknown'})`;
        console.error('coach llm fallback', model);
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
        suggestions: suggestions(ctx),
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

function localTime(tz: string): { hour: number; weekday: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hourCycle: 'h23',
      weekday: 'long',
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    return { hour: Number.isFinite(hour) ? hour : 12, weekday };
  } catch {
    return { hour: new Date().getUTCHours(), weekday: '' };
  }
}
