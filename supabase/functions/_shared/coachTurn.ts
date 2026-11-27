// One durable Coach turn: from a reserved user message to a saved reply.
//
// The coach Edge Function wires this to Postgres (migration 0046) and Groq;
// the Deno tests wire it to an in-memory store and a scripted provider, so
// the recovery rules are tested without a database or a paid call.
//
// Rules (see 0046_coach_turns.sql for the states):
//   * A saved turn is replayed, never generated again.
//   * A paid provider call starts only after coach_claim_provider_call says
//     yes: automatically for a fresh turn, or after an explicit "Try again"
//     for an uncertain one. Never twice at the same time.
//   * A provider timeout is "uncertain": the turn is marked so and the app
//     offers "Try again" instead of the server calling again by itself.
//   * A provider that clearly did no work (refused, 4xx/5xx before any text)
//     gets the rule-based fallback reply, saved and marked degraded.
//   * If the app goes away mid-reply, generation continues and the reply is
//     saved, so reopening the app shows it. If the person tapped Stop (the
//     turn was set to 'stopped'), only the words already shown are saved.

import { ReplyShaper } from './coachStream.ts';
import { leaksSystemPrompt } from './promptGuard.ts';
import type { StreamEvent } from './llm.ts';

export type TurnStatus = 'reserved' | 'generating' | 'saved' | 'uncertain' | 'stopped';

export interface TurnRow {
  id: string;
  content: string;
  created_at: string;
}

/** coach_turn_json() from migration 0046. */
export interface TurnView {
  turn_id: string;
  conversation_id: string;
  status: TurnStatus;
  provider_calls: number;
  can_retry: boolean;
  degraded: boolean;
  model: string | null;
  error: string | null;
  user_message: TurnRow | null;
  assistant_message: TurnRow | null;
}

export interface TurnStore {
  claimProviderCall(turnId: string, explicitRetry: boolean): Promise<boolean>;
  complete(
    turnId: string,
    content: string,
    model: string,
    degraded: boolean,
    firstTextMs: number | null,
  ): Promise<TurnView>;
  settle(turnId: string, status: 'uncertain' | 'stopped' | 'reserved', error: string | null): Promise<TurnView>;
  get(turnId: string): Promise<TurnView | null>;
}

/** Streams provider text. Throws ProviderTimeout-like errors (name 'ProviderTimeout'). */
export type Provider = (signal: AbortSignal) => AsyncIterable<StreamEvent>;

export interface TurnSink {
  send(event: string, data: unknown): void;
  /** True once the app has hung up. */
  gone(): boolean;
}

export interface RunTurnArgs {
  store: TurnStore;
  turn: TurnView;
  /** Rule-based answer (crisis, acute medical...). Never goes to the model. */
  safetyReply: string | null;
  provider: Provider;
  fallback: () => string;
  /** The person tapped "Try again" on an uncertain turn. */
  explicitRetry: boolean;
  /**
   * 'recover' (apps that send a turn id): a timeout leaves the turn
   * uncertain with a "Try again" state. 'fallback' (older apps): a timeout
   * saves the rule-based reply, as before.
   */
  onUncertain: 'recover' | 'fallback';
  sink: TurnSink;
  /** Date.now() when the request arrived, for time to first text. */
  startedAt: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How long to wait for another request already generating this turn. */
  waitForOtherMs?: number;
  /** Aborted when the provider call must stop (Stop with nothing shown). */
  providerSignal?: AbortSignal;
}

export interface RunTurnResult {
  view: TurnView;
  /** Paid calls this request started (0 or 1). */
  providerCalls: number;
  firstTextMs: number | null;
  replayed: boolean;
}

const isTimeout = (e: unknown) =>
  e instanceof Error && (e.name === 'ProviderTimeout' || e.message === 'timeout');

export async function runTurn(a: RunTurnArgs): Promise<RunTurnResult> {
  const now = a.now ?? Date.now;
  const sleep = a.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let firstTextMs: number | null = null;
  const sendText = (text: string) => {
    if (!text) return;
    if (firstTextMs === null) firstTextMs = now() - a.startedAt;
    a.sink.send('delta', { text });
  };
  const done = (view: TurnView, replayed: boolean, providerCalls: number): RunTurnResult => {
    if (view.status === 'saved' && view.assistant_message) {
      a.sink.send('done', {
        turn_id: view.turn_id,
        ai_message: view.assistant_message,
        text: view.assistant_message.content,
        model: view.model,
        degraded: view.degraded,
        replayed,
      });
    } else {
      // Not saved: tell the app what state the turn is in.
      a.sink.send('turn', turnEvent(view));
    }
    return { view, providerCalls, firstTextMs, replayed };
  };

  // 1. Already answered: replay, no provider call.
  if (a.turn.status === 'saved' && a.turn.assistant_message) {
    sendText(a.turn.assistant_message.content);
    return done(a.turn, true, 0);
  }

  // 2. Safety replies are rule-based and free.
  if (a.safetyReply !== null) {
    sendText(a.safetyReply);
    const view = await a.store.complete(a.turn.turn_id, a.safetyReply, 'safety-rules', false, firstTextMs);
    return done(view, false, 0);
  }

  // 3. Claim the one paid call.
  const claimed = await a.store.claimProviderCall(a.turn.turn_id, a.explicitRetry);
  if (!claimed) {
    let view = (await a.store.get(a.turn.turn_id)) ?? a.turn;
    // Another request is generating this turn right now: wait for it.
    const deadline = now() + (a.waitForOtherMs ?? 20000);
    while (view.status === 'generating' && now() < deadline && !a.sink.gone()) {
      a.sink.send('turn', turnEvent(view));
      await sleep(300);
      view = (await a.store.get(a.turn.turn_id)) ?? view;
    }
    if (view.status === 'saved' && view.assistant_message) {
      sendText(view.assistant_message.content);
      return done(view, true, 0);
    }
    return done(view, false, 0);
  }

  // 4. Generate.
  const shaper = new ReplyShaper();
  let model = 'groq';
  let banned = false;
  let providerError: unknown = null;
  // What actually reached the app before it hung up (for Stop).
  let shown = '';
  const abort = new AbortController();
  a.providerSignal?.addEventListener('abort', () => abort.abort());
  try {
    for await (const ev of a.provider(abort.signal)) {
      if (ev.type === 'start') {
        model = ev.model;
        continue;
      }
      const step = shaper.push(ev.text);
      if (step.banned) {
        banned = true;
        break;
      }
      // Once the app is gone, keep generating so the reply is saved.
      if (!a.sink.gone() && step.emit) {
        shown += step.emit;
        sendText(step.emit);
      }
      if (step.full) break;
    }
  } catch (e) {
    providerError = e;
  }

  let reply = banned ? null : shaper.finish();
  if (reply && leaksSystemPrompt(reply)) {
    banned = true;
    reply = null;
  }

  // Stop: keep only the words that were on screen.
  if (a.sink.gone()) {
    const current = await a.store.get(a.turn.turn_id);
    if (current?.status === 'stopped') {
      const kept = shown.trim();
      if (!kept) return { view: current, providerCalls: 1, firstTextMs, replayed: false };
      const view = await a.store.complete(a.turn.turn_id, kept, model, false, firstTextMs);
      return { view, providerCalls: 1, firstTextMs, replayed: false };
    }
  }

  if (!reply && providerError && isTimeout(providerError) && a.onUncertain === 'recover') {
    const view = await a.store.settle(a.turn.turn_id, 'uncertain', 'provider_timeout');
    return done(view, false, 1);
  }

  let degraded = false;
  if (!reply) {
    reply = a.fallback();
    degraded = true;
    const why = banned
      ? 'filtered'
      : providerError instanceof Error
        ? providerError.message.slice(0, 60)
        : 'empty';
    model = `fallback(${why})`;
    // The fallback replaces whatever partial text was streamed.
    if (!shaper.sent) sendText(reply);
  }
  const view = await a.store.complete(a.turn.turn_id, reply, model, degraded, firstTextMs);
  return done(view, false, 1);
}

/** The `turn` SSE event: a turn that is not (yet) answered. */
export function turnEvent(view: TurnView) {
  return {
    turn_id: view.turn_id,
    status: view.status,
    can_retry: view.can_retry,
    provider_calls: view.provider_calls,
    error: view.error,
  };
}
