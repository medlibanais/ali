// coach: the user's Future Self.
// Intent-routed: crisis / acute-medical / professional-advice paths are
// deterministic; everything else goes to Groq with the user's goals, today's
// quests, yesterday per pillar, the last 5 completed quests, the 2 weakest
// pillars of the last 7 days and the last 10 messages of this conversation
// injected (prompt lives in _shared/coachText.ts). The request is shrunk to a
// token budget before it is sent (_shared/tokenBudget.ts). 20 messages/day, enforced here — never trust the
// client counter, and count it across all of the user's conversations so
// starting a new chat does not reset it.
//
// Request modes (POST JSON):
//   { message, conversation_id?, turn_id?, retry?, stream: true }
//       -> text/event-stream; events: meta, delta, turn, done, error
//          (see streamReply below)
//   { message, conversation_id?, turn_id? }       -> one JSON reply (older apps)
//   { status: true }                              -> today's count + reset time
//   { turn_status: <turn id> }                    -> one turn's state, no AI call
//   { stop_turn: <turn id> }                      -> the person tapped Stop
//
// Durable turns (migration 0046): the app makes a turn id per message and
// keeps it until the turn ends. Sending the same turn id again never saves,
// counts or pays twice: a saved reply is replayed, a running one is waited
// for, and an uncertain one (provider timeout) needs `retry: true`, which the
// app sends only when the person taps "Try again". Requests without a turn id
// (older apps) get one made here.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  classifyIntent,
  isDeterministic,
  safetyResponse,
} from '../_shared/intents.ts';
import { type ChatTurn, hasGroqKey, streamGroq } from '../_shared/llm.ts';
import { sseFrame } from '../_shared/coachStream.ts';
import {
  type Provider,
  runTurn,
  type TurnSink,
  type TurnStore,
  type TurnView,
} from '../_shared/coachTurn.ts';
import {
  buildCompactSystemPrompt,
  buildSystemPrompt,
  type CoachContext,
  type DayScore,
  fallbackReply,
  type Pillar,
  pillarAverages,
  type PillarDay,
  PILLARS,
  type RecentCompletion,
  suggestions,
  type TodayQuest,
} from '../_shared/coachText.ts';
import { fitToBudget, promptBudget } from '../_shared/tokenBudget.ts';
import {
  INPUT_MAX_CHARS,
  sanitizeGoals,
  sanitizeUserInput,
  wrapSystemPrompt,
} from '../_shared/promptGuard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'retry-after',
};

const DAILY_LIMIT = 20;
const INPUT_MAX = INPUT_MAX_CHARS; // 500, see _shared/promptGuard.ts
const HISTORY_TURNS = 10; // last 10 messages of this conversation
const HISTORY_CHARS = 600; // per message, before the token budget applies
const RECENT_COMPLETIONS = 5;
const DAY_MS = 86400000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const requestStarted = Date.now();
    let message = '';
    let requestedConversation: string | null = null;
    let wantsStream = false;
    let wantsStatus = false;
    let clientTurn: string | null = null;
    let explicitRetry = false;
    let turnStatusId: string | null = null;
    let stopTurnId: string | null = null;
    try {
      const body = await req.json();
      message = typeof body?.message === 'string' ? body.message.trim() : '';
      wantsStream = body?.stream === true;
      wantsStatus = body?.status === true;
      explicitRetry = body?.retry === true;
      for (const key of ['turn_id', 'turn_status', 'stop_turn'] as const) {
        const v = body?.[key];
        if (v == null) continue;
        if (typeof v !== 'string' || !UUID_RE.test(v)) {
          return json({ error: 'invalid_turn' }, 400);
        }
      }
      clientTurn = body?.turn_id ?? null;
      turnStatusId = body?.turn_status ?? null;
      stopTurnId = body?.stop_turn ?? null;
      if (body?.conversation_id != null) {
        if (
          typeof body.conversation_id !== 'string' ||
          !UUID_RE.test(body.conversation_id)
        ) {
          return json({ error: 'invalid_conversation' }, 400);
        }
        requestedConversation = body.conversation_id;
      }
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    // Service client for rate limiting + writes (user already authenticated).
    const admin = createClient(supabaseUrl, serviceKey);
    const store = turnStore(admin, user.id);

    // ---- turn status / Stop: no AI call, no quota ----
    if (turnStatusId) {
      const view = await store.get(turnStatusId);
      return view ? json({ turn: view }, 200) : json({ error: 'turn_not_found' }, 404);
    }
    if (stopTurnId) {
      const view = await store.get(stopTurnId);
      if (!view) return json({ error: 'turn_not_found' }, 404);
      if (view.status === 'saved') return json({ turn: view }, 200);
      return json({ turn: await store.settle(stopTurnId, 'stopped', 'stopped_by_user') }, 200);
    }

    // ---- daily limit (user's timezone, server-side) ----
    // The day ends at midnight in profiles.timezone (day_bounds_in_tz), so
    // the app's countdown uses resets_at from here, not the phone's clock.
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
    const resetsAt = new Date(dayEnd).toISOString();

    if (wantsStatus) {
      const { count: sentCount } = await admin
        .from('messages')
        .select('id, conversations!inner(user_id)', { count: 'exact', head: true })
        .eq('conversations.user_id', user.id)
        .eq('role', 'user')
        .gte('created_at', dayStart)
        .lt('created_at', dayEnd);
      const sentToday = sentCount ?? 0;
      return json(
        {
          limit: DAILY_LIMIT,
          sent_today: sentToday,
          remaining_today: Math.max(0, DAILY_LIMIT - sentToday),
          resets_at: resetsAt,
        },
        200,
      );
    }

    if (message.length === 0) return json({ error: 'empty_message' }, 400);
    if (message.length > INPUT_MAX) {
      return json({ error: 'message_too_long', max: INPUT_MAX }, 400);
    }
    // Prompt-injection guard. Safety routing below still reads the
    // original words; the model and the stored chat get the cleaned text.
    const guarded = sanitizeUserInput(message);
    if (guarded.flagged.length) {
      console.warn('coach input sanitized', { rules: guarded.flagged });
    }
    const safeMessage = guarded.text.length ? guarded.text : '[removed]';

    // Safety replies are rule-based and always work. Anything that needs the
    // model fails loudly when the key is missing, instead of quietly
    // answering with canned text that looks like a broken coach.
    const intent = classifyIntent(message);
    if (!isDeterministic(intent) && !hasGroqKey()) {
      console.error('coach not configured: GROQ_API_KEY is not set');
      return json({ error: 'not_configured' }, 503);
    }

    // The client names the chat it is showing (it can start new ones);
    // otherwise use the newest. Ownership is checked because this client
    // bypasses RLS.
    const ownConversations = () =>
      admin.from('conversations').select('id').eq('user_id', user.id);
    // A resent turn stays in the chat it was first sent to.
    const knownTurn = clientTurn ? await store.get(clientTurn) : null;
    if (knownTurn) requestedConversation = knownTurn.conversation_id;
    const { data: conversation, error: conversationError } =
      requestedConversation
        ? await ownConversations().eq('id', requestedConversation).maybeSingle()
        : await ownConversations()
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
    if (conversationError) {
      console.error('coach conversation lookup', conversationError.message);
      return json({ error: 'storage_failed' }, 500);
    }
    if (requestedConversation && !conversation) {
      return json({ error: 'conversation_not_found' }, 404);
    }

    let conversationId = conversation?.id as string | undefined;
    if (!conversationId) {
      const { data: created, error: createError } = await admin
        .from('conversations')
        .insert({ user_id: user.id })
        .select('id')
        .single();
      if (createError || !created) {
        console.error('coach conversation create', createError?.message);
        return json({ error: 'storage_failed' }, 500);
      }
      conversationId = created.id as string;
    }

    // ---- begin the turn: quota + user message, once per turn id ----
    // coach_begin_turn (migration 0046) counts today's messages and saves this
    // one under the same per-account lock as 0045, so parallel sends cannot
    // pass the daily limit, and a resend of the same turn id counts once.
    const turnId = clientTurn ?? crypto.randomUUID();
    const { data: begun, error: beginError } = await admin.rpc('coach_begin_turn', {
      p_user: user.id,
      p_conversation: conversationId,
      p_turn: turnId,
      p_content: safeMessage,
      p_limit: DAILY_LIMIT,
    });
    if (beginError || !begun) {
      if (beginError?.message?.includes('turn_conflict')) {
        return json({ error: 'turn_conflict' }, 409);
      }
      console.error('coach begin turn', beginError?.message);
      return json({ error: 'storage_failed' }, 500);
    }
    const reserved = begun as CoachReservation;
    const quotaResetsAt = reserved.resets_at
      ? new Date(reserved.resets_at).toISOString()
      : resetsAt;
    if (!reserved.ok || !reserved.turn?.user_message) {
      const retryAfter = Math.max(
        1,
        Math.ceil((Date.parse(quotaResetsAt) - Date.now()) / 1000),
      );
      return json(
        {
          error: 'rate_limit_exceeded',
          message: 'Daily message limit reached. Resets at midnight.',
          limit: DAILY_LIMIT,
          remaining_today: 0,
          resets_at: quotaResetsAt,
        },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    }
    const turn = reserved.turn;
    const userRow = reserved.turn.user_message;
    const remainingToday = reserved.remaining_today;

    // ---- context for the LLM (and for the UI badge) ----
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const weekAgo = new Date(todayMs - 7 * DAY_MS).toISOString().slice(0, 10);
    const yesterday = new Date(todayMs - DAY_MS).toISOString().slice(0, 10);
    const [
      goalsRes,
      gamRes,
      scoresRes,
      badgesRes,
      historyRes,
      weekRes,
      todayQuestsRes,
      completionsRes,
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
        .neq('id', userRow.id)
        .lte('created_at', userRow.created_at)
        .order('created_at', { ascending: false })
        .limit(HISTORY_TURNS),
      admin
        .from('quests')
        .select('pillar, assigned_date, skipped, quest_completions(id, undone_at)')
        .eq('user_id', user.id)
        .gte('assigned_date', weekAgo)
        .lt('assigned_date', today),
      admin
        .from('quests')
        .select('title, pillar, xp_reward, skipped, priority, quest_completions(id, undone_at)')
        .eq('user_id', user.id)
        .eq('assigned_date', today)
        .order('priority', { ascending: true }),
      // Memory: the last quests actually finished (not undone), any day.
      admin
        .from('quest_completions')
        .select('completed_at, xp_awarded, quests!inner(title, pillar, assigned_date, user_id)')
        .eq('user_id', user.id)
        .eq('quests.user_id', user.id)
        .is('undone_at', null)
        .order('completed_at', { ascending: false })
        .limit(RECENT_COMPLETIONS),
    ]);

    type CompletionRow = { id: string; undone_at: string | null };
    const isDone = (c: CompletionRow[] | null) =>
      (c ?? []).some((x) => x.undone_at === null);

    const goals = sanitizeGoals((goalsRes.data ?? {}) as Record<string, unknown>);
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
    const pastQuests = (weekRes.data ?? []) as {
      pillar: Pillar;
      assigned_date: string;
      skipped: boolean;
      quest_completions: CompletionRow[];
    }[];
    // Missed this week: past days' quests neither completed nor skipped.
    const missedThisWeek = pastQuests.filter(
      (q) => !q.skipped && !isDone(q.quest_completions),
    ).length;

    // Yesterday per pillar, so the coach can say "we skipped Health
    // yesterday, but Family went great".
    const yesterdayByPillar: Partial<Record<Pillar, PillarDay>> = {};
    for (const q of pastQuests) {
      if (q.assigned_date !== yesterday) continue;
      const d = (yesterdayByPillar[q.pillar] ??= { done: 0, skipped: 0, missed: 0 });
      if (isDone(q.quest_completions)) d.done += 1;
      else if (q.skipped) d.skipped += 1;
      else d.missed += 1;
    }

    type CompletedQuest = {
      title: string;
      pillar: Pillar;
      assigned_date: string;
    };
    const recentCompletions: RecentCompletion[] = (
      (completionsRes.data ?? []) as {
        xp_awarded: number;
        quests: CompletedQuest | CompletedQuest[] | null;
      }[]
    ).flatMap((c) => {
      const q = Array.isArray(c.quests) ? c.quests[0] : c.quests;
      if (!q) return [];
      const daysAgo = Math.max(
        0,
        Math.round((todayMs - Date.parse(`${q.assigned_date}T00:00:00Z`)) / DAY_MS),
      );
      return [{ title: q.title, pillar: q.pillar, xp: c.xp_awarded, daysAgo }];
    });

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
      recentCompletions,
      yesterday: yesterdayByPillar,
    };

    const contextUsed = {
      user_level: level,
      daily_score: todayScore.overall,
      streak,
      weakest_pillars: pillarAverages(ctx).weakestTwo,
    };

    const buildTurns = (): ChatTurn[] => {
      const history: ChatTurn[] = (historyRes.data ?? [])
        .reverse()
        .map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role,
          // Older user messages were stored before the guard existed.
          content: (m.role === 'user'
            ? sanitizeUserInput(m.content).text
            : m.content).slice(0, HISTORY_CHARS),
        }));
      const tail: ChatTurn[] = [];
      if (intent === 'wellbeing') {
        tail.push({
          role: 'system',
          content:
            'They seem tired, stressed, unwell or low. Lead with care, offer a lighter day, no diagnosis or medication. If they feel dizzy or unwell: tell them to sit down, drink some water and rest, and to get medical help if it is severe or does not pass. Never turn a health issue into a quest or XP.',
        });
      }
      tail.push({ role: 'user', content: safeMessage });

      // Token-limit protection: drop the oldest turns, then compact the
      // context, so the request never exceeds Groq's per-request limits.
      const fit = fitToBudget({
        system: wrapSystemPrompt(buildSystemPrompt(ctx)),
        compactSystem: wrapSystemPrompt(buildCompactSystemPrompt(ctx)),
        history,
        tail,
        budget: promptBudget(Deno.env.get('COACH_PROMPT_TOKEN_BUDGET')),
      });
      if (fit.droppedTurns || fit.compacted || fit.truncated) {
        console.warn('coach prompt trimmed', {
          estimated_tokens: fit.estimatedTokens,
          dropped_turns: fit.droppedTurns,
          compacted: fit.compacted,
          truncated: fit.truncated,
        });
      }
      return fit.turns;
    };

    const turnArgs = {
      store,
      turn,
      safetyReply: isDeterministic(intent) ? safetyResponse(intent) : null,
      provider: groqProvider(isDeterministic(intent) ? [] : buildTurns()),
      fallback: () => fallbackReply(ctx),
      explicitRetry,
      // Older apps (no turn id) cannot show a "Try again" state.
      onUncertain: clientTurn ? 'recover' as const : 'fallback' as const,
      startedAt: requestStarted,
    };

    if (wantsStream) {
      return streamReply({
        ...turnArgs,
        conversationId,
        intent,
        userRow,
        remainingToday,
        resetsAt: quotaResetsAt,
        contextUsed,
        suggestions: suggestions(ctx),
      });
    }

    // ---- one JSON reply (older apps) ----
    const result = await runTurn({
      ...turnArgs,
      sink: { send: () => undefined, gone: () => false },
    });
    logTurn(result.view, result.providerCalls, result.firstTextMs, result.replayed);
    const aiRow = result.view.assistant_message;
    if (!aiRow) {
      return json({ error: 'reply_uncertain', turn: result.view }, 504);
    }
    return json(
      {
        conversation_id: conversationId,
        turn_id: turn.turn_id,
        user_message: userRow,
        ai_message: aiRow,
        remaining_today: remainingToday,
        resets_at: quotaResetsAt,
        context_used: contextUsed,
        suggestions: suggestions(ctx),
        intent,
        model: result.view.model ?? 'groq',
        // True when the model was unreachable and this is the rule-based
        // stand-in reply, so the app can say so.
        degraded: result.view.degraded,
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

// ---- streaming reply -------------------------------------------------------

type TurnArgs = Omit<Parameters<typeof runTurn>[0], 'sink'>;

interface StreamArgs extends TurnArgs {
  conversationId: string;
  intent: string;
  /** The user's message, already saved by coach_begin_turn. */
  userRow: SavedMessage;
  remainingToday: number;
  resetsAt: string;
  contextUsed: Record<string, unknown>;
  suggestions: string[];
}

type EdgeRuntimeLike = { waitUntil(p: Promise<unknown>): void };

interface SavedMessage {
  id: string;
  content: string;
  created_at: string;
}

/** Result of the coach_begin_turn RPC (migration 0046). */
interface CoachReservation {
  ok: boolean;
  existing: boolean;
  sent_today: number;
  remaining_today: number;
  resets_at: string | null;
  turn?: TurnView & { user_message: SavedMessage };
}

/** Postgres-backed turn store; every call is scoped to the JWT's user. */
function turnStore(admin: SupabaseClient, userId: string): TurnStore {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await admin.rpc(fn, { p_user: userId, ...args });
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };
  return {
    claimProviderCall: (turnId, explicitRetry) =>
      rpc<boolean>('coach_claim_provider_call', {
        p_turn: turnId,
        p_explicit_retry: explicitRetry,
      }),
    complete: (turnId, content, model, degraded, firstTextMs) =>
      rpc<TurnView>('coach_complete_turn', {
        p_turn: turnId,
        p_content: content,
        p_model: model,
        p_degraded: degraded,
        p_first_text_ms: firstTextMs,
      }),
    settle: (turnId, status, error) =>
      rpc<TurnView>('coach_settle_turn', { p_turn: turnId, p_status: status, p_error: error }),
    get: (turnId) => rpc<TurnView | null>('coach_get_turn', { p_turn: turnId }),
  };
}

/** Groq, streamed. A timeout is not retried: it may already be billed. */
function groqProvider(turns: ChatTurn[]): Provider {
  return (signal) =>
    streamGroq(turns, {
      maxTokens: 220,
      temperature: 0.8,
      timeoutMs: 12000,
      idleTimeoutMs: 8000,
      retries: 1,
      retryOnTimeout: false,
      useFallbackModel: true,
      signal,
    });
}

function logTurn(view: TurnView, providerCalls: number, firstTextMs: number | null, replayed: boolean) {
  console.log('coach turn', {
    status: view.status,
    provider_calls_total: view.provider_calls,
    provider_calls_this_request: providerCalls,
    first_text_ms: firstTextMs,
    replayed,
    degraded: view.degraded,
  });
}

/**
 * Server-Sent Events:
 *   meta   { conversation_id, turn_id, user_message, remaining_today, ... }
 *          sent once the user's message is saved (so it counts at once)
 *   delta  { text }  a piece of the reply, already safety-shaped
 *   turn   { turn_id, status, can_retry }  the turn is not answered (yet):
 *          'generating' (another request is writing it), 'uncertain'
 *          (provider timeout: show "Try again") or 'stopped'
 *   done   { turn_id, ai_message, text, model, degraded, replayed, ... }
 *          text is the saved reply; the app shows it in place of the deltas
 *   error  { error }
 * If the app goes away (lost signal) the reply is still generated and saved
 * under the turn id, so reopening the app shows it. Stop is a separate
 * { stop_turn } request; then only the words already shown are saved.
 */
function streamReply(a: StreamArgs): Response {
  const encoder = new TextEncoder();
  let clientGone = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const sink: TurnSink = {
        send(event, rawData) {
          if (clientGone) return;
          // The quota fields ride on every 'done', as before.
          const data = event === 'done'
            ? {
              ...(rawData as Record<string, unknown>),
              remaining_today: a.remainingToday,
              resets_at: a.resetsAt,
            }
            : rawData;
          try {
            controller.enqueue(encoder.encode(sseFrame(event, data)));
          } catch {
            clientGone = true;
          }
        },
        gone: () => clientGone,
      };
      const close = () => {
        if (clientGone) return;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const work = (async () => {
        sink.send('meta', {
          conversation_id: a.conversationId,
          turn_id: a.turn.turn_id,
          user_message: a.userRow,
          remaining_today: a.remainingToday,
          resets_at: a.resetsAt,
          intent: a.intent,
          context_used: a.contextUsed,
          suggestions: a.suggestions,
        });
        const result = await runTurn({ ...a, sink });
        logTurn(result.view, result.providerCalls, result.firstTextMs, result.replayed);
        close();
      })().catch((e) => {
        console.error('coach stream', e instanceof Error ? e.message : e);
        sink.send('error', { error: 'storage_failed', turn_id: a.turn.turn_id });
        close();
      });

      // Let the reply finish and be saved even after the app hangs up.
      (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime?.waitUntil(work);
    },
    cancel() {
      clientGone = true;
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

function json(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
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
