// In-memory stand-in for the Coach's Postgres side (migration 0046), with
// the same rules as the SQL functions, plus mock providers. Lets the Deno
// suite run whole conversations through runTurn() with no database and no
// paid calls. coach_turns_test.sql checks the SQL itself.

import type { ChatTurn, StreamEvent } from '../llm.ts';
import { ProviderTimeout } from '../llm.ts';
import { runTurn, type RunTurnResult, type TurnStatus, type TurnStore, type TurnView } from '../coachTurn.ts';
import { detectLang, type Lang } from '../coachGrounding.ts';

interface Msg {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  turnId: string;
  createdAt: string;
}

interface Turn {
  id: string;
  user: string;
  conversationId: string;
  status: TurnStatus;
  userMessageId: string;
  assistantMessageId: string | null;
  providerCalls: number;
  providerStartedAt: number | null;
  model: string | null;
  degraded: boolean;
  error: string | null;
  firstTextMs: number | null;
}

export const STALE_MS = 90_000;
export const MAX_CALLS = 3;

export class MemoryCoach {
  limit = 20;
  /** Added to Date.now(), to make a running call look stale. */
  skewMs = 0;
  conversations = new Map<string, string>();
  messages: Msg[] = [];
  turns = new Map<string, Turn>();
  private seq = 0;

  now() {
    return Date.now() + this.skewMs;
  }

  addConversation(id: string, user: string) {
    this.conversations.set(id, user);
  }

  sentToday(user: string) {
    return this.messages.filter((m) => m.role === 'user' && this.conversations.get(m.conversationId) === user).length;
  }

  private row(conversationId: string, role: Msg['role'], content: string, turnId: string): Msg {
    this.seq += 1;
    const m = { id: `m${this.seq}`, conversationId, role, content, turnId, createdAt: new Date(this.seq * 1000).toISOString() };
    this.messages.push(m);
    return m;
  }

  view(t: Turn): TurnView {
    const stale = t.status === 'generating' && (t.providerStartedAt ?? 0) < this.now() - STALE_MS;
    const msg = (id: string | null) => {
      const m = this.messages.find((x) => x.id === id);
      return m ? { id: m.id, content: m.content, created_at: m.createdAt } : null;
    };
    return {
      turn_id: t.id,
      conversation_id: t.conversationId,
      status: stale ? 'uncertain' : t.status,
      provider_calls: t.providerCalls,
      can_retry: (t.status === 'uncertain' || t.status === 'reserved' || stale) && t.providerCalls < MAX_CALLS,
      degraded: t.degraded,
      model: t.model,
      error: t.error,
      user_message: msg(t.userMessageId),
      assistant_message: msg(t.assistantMessageId),
    };
  }

  /** coach_begin_turn */
  begin(user: string, conversationId: string, turnId: string, content: string) {
    const existing = this.turns.get(turnId);
    if (existing) {
      if (existing.user !== user || existing.conversationId !== conversationId) throw new Error('turn_conflict');
      return { ok: true, existing: true, turn: this.view(existing) };
    }
    if (this.conversations.get(conversationId) !== user) throw new Error('conversation_not_found');
    if (this.sentToday(user) >= this.limit) return { ok: false, existing: false, turn: null };
    const m = this.row(conversationId, 'user', content, turnId);
    const t: Turn = {
      id: turnId, user, conversationId, status: 'reserved', userMessageId: m.id,
      assistantMessageId: null, providerCalls: 0, providerStartedAt: null, model: null,
      degraded: false, error: null, firstTextMs: null,
    };
    this.turns.set(turnId, t);
    return { ok: true, existing: false, turn: this.view(t) };
  }

  /** The TurnStore the coach function gets, scoped to one account. */
  store(user: string): TurnStore {
    const own = (turnId: string) => {
      const t = this.turns.get(turnId);
      if (!t || t.user !== user) throw new Error('turn_not_found');
      return t;
    };
    return {
      claimProviderCall: (turnId, explicitRetry) => {
        const t = own(turnId);
        if (t.providerCalls >= MAX_CALLS) return Promise.resolve(false);
        const stale = t.status === 'generating' && (t.providerStartedAt ?? 0) < this.now() - STALE_MS;
        if (t.status === 'reserved' || (explicitRetry && (t.status === 'uncertain' || stale))) {
          t.status = 'generating';
          t.providerCalls += 1;
          t.providerStartedAt = this.now();
          t.error = null;
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      },
      complete: (turnId, content, model, degraded, firstTextMs) => {
        const t = own(turnId);
        if (t.status === 'saved' && t.assistantMessageId) return Promise.resolve(this.view(t));
        const prior = this.messages.find((m) => m.turnId === turnId && m.role === 'assistant');
        const m = prior ?? this.row(t.conversationId, 'assistant', content, turnId);
        Object.assign(t, {
          status: 'saved', assistantMessageId: m.id, model, degraded,
          firstTextMs: t.firstTextMs ?? firstTextMs, error: null,
        });
        return Promise.resolve(this.view(t));
      },
      settle: (turnId, status, error) => {
        const t = own(turnId);
        if (t.status !== 'saved') Object.assign(t, { status, error });
        return Promise.resolve(this.view(t));
      },
      get: (turnId) => {
        const t = this.turns.get(turnId);
        return Promise.resolve(t && t.user === user ? this.view(t) : null);
      },
    };
  }
}

// ---- providers ---------------------------------------------------------------

export interface ProviderSpy {
  calls: number;
}

type ProviderFn = (turns: ChatTurn[], signal: AbortSignal) => AsyncIterable<StreamEvent>;

/** Wraps a provider and counts paid calls. */
export function spied(fn: ProviderFn, spy: ProviderSpy, turns: ChatTurn[]) {
  return (signal: AbortSignal) => {
    spy.calls += 1;
    return fn(turns, signal);
  };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Streams a fixed text word by word. */
export function textProvider(text: string | ((turns: ChatTurn[]) => string), opts: { firstMs?: number; gapMs?: number } = {}): ProviderFn {
  return async function* (turns) {
    const full = typeof text === 'function' ? text(turns) : text;
    if (opts.firstMs) await wait(opts.firstMs);
    yield { type: 'start', model: 'mock' };
    for (const w of full.split(/(?<= )/)) {
      yield { type: 'delta', text: w };
      if (opts.gapMs) await wait(opts.gapMs);
    }
  };
}

/** Accepts the call and never answers in time. */
export function timeoutProvider(afterMs = 0): ProviderFn {
  // deno-lint-ignore require-yield
  return async function* () {
    if (afterMs) await wait(afterMs);
    throw new ProviderTimeout();
  };
}

/** Refuses before any text (HTTP 500): no work was done. */
export function refusedProvider(): ProviderFn {
  // deno-lint-ignore require-yield
  return async function* () {
    throw new Error('groq_500: mock outage');
  };
}

const TEMPLATES: Record<Lang, (quest: string, streak: number) => string> = {
  en: (q, s) => `I remember this ${s}-day stretch. Let's do "${q}" next, it is the one we are glad we did.`,
  fr: (q, s) => `Je me souviens de ces ${s} jours d'affilée. On fait « ${q} » maintenant, c'est celle dont nous sommes fiers.`,
  ar: (q, s) => `أتذكر هذه السلسلة من ${s} أيام. لنبدأ الآن بـ «${q}»، إنها الخطوة التي نفخر بها معًا.`,
};

/**
 * A well-behaved model: it only knows what the system prompt tells it, picks
 * the first pending quest and the streak from there, and answers in the
 * user's language. If the prompt lost the quests, the reply says so.
 */
export function futureSelfProvider(opts: { firstMs?: number; gapMs?: number } = {}): ProviderFn {
  return textProvider((turns) => {
    const system = turns.find((t) => t.role === 'system')?.content ?? '';
    const user = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';
    const quest = system.match(/- \[pending\] (.+?) \(/)?.[1] ?? 'one small step';
    const streak = Number(system.match(/Streak (\d+) days/)?.[1] ?? 0);
    return TEMPLATES[detectLang(user)](quest, streak);
  }, opts);
}

/** A model that makes things up: a longer streak and a pending quest "done". */
export function inventingProvider(): ProviderFn {
  return textProvider((turns) => {
    const system = turns.find((t) => t.role === 'system')?.content ?? '';
    const user = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';
    const quest = system.match(/- \[pending\] (.+?) \(/)?.[1] ?? 'Run a marathon';
    const lang = detectLang(user);
    if (lang === 'fr') return `Bravo, nous avons fini « ${quest} » et notre série de 42 jours continue !`;
    if (lang === 'ar') return `رائع، لقد أنجزنا «${quest}» وسلسلتنا من 42 يوم مستمرة!`;
    return `Amazing, we finished "${quest}" and our 42-day streak keeps going!`;
  });
}

// ---- one send, like the coach function does it -------------------------------

export interface Sent {
  events: { event: string; data: Record<string, unknown> }[];
  result: RunTurnResult | null;
  status: number;
  error?: string;
}

export async function sendTurn(
  coach: MemoryCoach,
  a: {
    user: string;
    conversationId: string;
    turnId: string;
    text: string;
    provider: (turns: ChatTurn[], signal: AbortSignal) => AsyncIterable<StreamEvent>;
    spy: ProviderSpy;
    system?: string;
    safetyReply?: string | null;
    explicitRetry?: boolean;
    onUncertain?: 'recover' | 'fallback';
    /** The app hangs up after this many text events. */
    goneAfterText?: number;
    /** Called when the app hangs up (e.g. to record a Stop). */
    onGone?: () => Promise<void> | void;
  },
): Promise<Sent> {
  const startedAt = Date.now();
  let begun;
  try {
    begun = coach.begin(a.user, a.conversationId, a.turnId, a.text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { events: [], result: null, status: msg === 'turn_conflict' ? 409 : 404, error: msg };
  }
  if (!begun.ok || !begun.turn) return { events: [], result: null, status: 429, error: 'rate_limit_exceeded' };
  const events: Sent['events'] = [];
  let gone = false;
  let texts = 0;
  events.push({ event: 'meta', data: { turn_id: a.turnId } });
  const turns: ChatTurn[] = [
    { role: 'system', content: a.system ?? '' },
    ...coach.messages
      .filter((m) => m.conversationId === a.conversationId && m.turnId !== a.turnId)
      .map((m) => ({ role: m.role, content: m.content }) as ChatTurn),
    { role: 'user', content: a.text },
  ];
  const result = await runTurn({
    store: coach.store(a.user),
    turn: begun.turn,
    safetyReply: a.safetyReply ?? null,
    provider: spied(a.provider, a.spy, turns),
    fallback: () => 'Today is still wide open for us. One small step is enough.',
    explicitRetry: a.explicitRetry ?? false,
    onUncertain: a.onUncertain ?? 'recover',
    startedAt,
    sleep: (ms) => wait(Math.min(ms, 20)),
    sink: {
      send: (event, data) => {
        if (gone) return;
        events.push({ event, data: data as Record<string, unknown> });
        if (event === 'delta') {
          texts += 1;
          if (a.goneAfterText !== undefined && texts >= a.goneAfterText) {
            gone = true;
            void a.onGone?.();
          }
        }
      },
      gone: () => gone,
    },
  });
  return { events, result, status: 200 };
}
