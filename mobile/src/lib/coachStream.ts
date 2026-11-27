// Streams a coach reply over Server-Sent Events (react-native-sse).
// react-native-sse reads the response through XMLHttpRequest, which streams
// on Android and in the browser, so the same code runs on the web export.
// The Groq key never leaves the Edge Function; the app only sends the
// user's own session token.

import EventSource from 'react-native-sse';
import type { FunctionFailure } from './functionErrors';

type CoachEvent = 'meta' | 'delta' | 'turn' | 'done';

export interface StreamedRow {
  id: string;
  content: string;
  created_at: string;
}

export interface StreamMeta {
  conversation_id: string;
  /** Echo of the turn id (older servers leave it out). */
  turn_id?: string;
  user_message: StreamedRow;
  remaining_today: number;
  resets_at: string | null;
  context_used: { user_level?: number; daily_score?: number; streak?: number } | null;
  suggestions: string[];
}

export interface StreamDone {
  turn_id?: string;
  ai_message: StreamedRow;
  /** True when the server sent a reply it had already saved. */
  replayed?: boolean;
  /** The saved reply; it replaces the text built from the deltas. */
  text: string;
  degraded: boolean;
  remaining_today: number;
  resets_at: string | null;
}

/**
 * The server's `turn` event: the turn is not answered (yet).
 *   generating  another request is writing it; ask again shortly
 *   uncertain   the AI did not answer in time; only "Try again" calls again
 *   stopped     the person tapped Stop before any word
 */
export interface StreamTurn {
  turn_id: string;
  status: 'reserved' | 'generating' | 'saved' | 'uncertain' | 'stopped';
  can_retry: boolean;
  provider_calls?: number;
}

export interface CoachStreamHandlers {
  onMeta: (meta: StreamMeta) => void;
  onDelta: (text: string) => void;
  onDone: (done: StreamDone) => void;
  /** Ends the stream without a reply (see StreamTurn). */
  onTurn?: (turn: StreamTurn) => void;
  /** Called once. `network` means the line dropped (or went silent). */
  onFailure: (failure: FunctionFailure) => void;
}

export interface CoachStreamOptions {
  accessToken: string;
  message: string;
  conversationId: string | null;
  /** Stable id of this message; resending it never counts twice. */
  turnId?: string;
  /** The person tapped "Try again" on an uncertain turn. */
  retry?: boolean;
  /** No event for this long counts as a dropped connection. */
  idleTimeoutMs?: number;
}

export interface CoachStream {
  /** Closes the connection (Stop). No handler runs after this. */
  close: () => void;
}

function functionsUrl(): string {
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/functions/v1/coach`;
}

function parse<T>(data: string | null): T | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/** Our `{ error }` code from a non-2xx body, if it is JSON. */
export function errorCode(body: string | null | undefined): string | null {
  const parsed = parse<{ error?: unknown; code?: unknown }>(body ?? null);
  const raw = parsed?.error ?? parsed?.code;
  return typeof raw === 'string' ? raw : null;
}

export function openCoachStream(
  options: CoachStreamOptions,
  handlers: CoachStreamHandlers,
): CoachStream {
  let finished = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const idleMs = options.idleTimeoutMs ?? 25000;

  const es = new EventSource<CoachEvent>(functionsUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: options.message,
      stream: true,
      ...(options.turnId ? { turn_id: options.turnId } : {}),
      ...(options.retry ? { retry: true } : {}),
      ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
    }),
    // A POST must never be replayed: that would send the message twice.
    pollingInterval: 0,
    timeoutBeforeConnection: 0,
  });

  const finish = () => {
    finished = true;
    if (idleTimer) clearTimeout(idleTimer);
    es.removeAllEventListeners();
    es.close();
  };

  const fail = (failure: FunctionFailure) => {
    if (finished) return;
    finish();
    handlers.onFailure(failure);
  };

  const touch = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => fail({ kind: 'network', status: null, code: 'idle_timeout' }),
      idleMs,
    );
  };
  touch();

  es.addEventListener('open', touch);
  es.addEventListener('meta', (event) => {
    touch();
    const meta = parse<StreamMeta>(event.data);
    if (meta && !finished) handlers.onMeta(meta);
  });
  es.addEventListener('delta', (event) => {
    touch();
    const delta = parse<{ text?: unknown }>(event.data);
    if (typeof delta?.text === 'string' && !finished) handlers.onDelta(delta.text);
  });
  es.addEventListener('turn', (event) => {
    touch();
    const turn = parse<StreamTurn>(event.data);
    if (!turn || finished) return;
    // 'generating' while another request writes it: keep listening.
    if (turn.status === 'generating') return;
    finish();
    if (handlers.onTurn) handlers.onTurn(turn);
    else handlers.onFailure({ kind: 'http', status: 504, code: 'reply_uncertain' });
  });
  es.addEventListener('done', (event) => {
    const done = parse<StreamDone>(event.data);
    if (finished) return;
    finish();
    if (done?.ai_message) handlers.onDone(done);
    else handlers.onFailure({ kind: 'http', status: 500, code: 'bad_response' });
  });
  es.addEventListener('error', (event) => {
    // The server's own `event: error` frame arrives as a custom event with
    // data (e.g. {"error":"storage_failed"}).
    const frame = (event as { data?: unknown }).data;
    if (typeof frame === 'string') {
      fail({ kind: 'http', status: 500, code: errorCode(frame) });
      return;
    }
    if (event.type === 'error' && event.xhrStatus > 0) {
      // A JSON error before the stream (401, 429, 503...). Wait for the
      // whole body (readyState 4) so the error code is readable.
      if (event.xhrState !== 4) return;
      fail({ kind: 'http', status: event.xhrStatus, code: errorCode(event.message) });
      return;
    }
    // xhrStatus 0, timeout or an exception: the connection itself failed.
    fail({ kind: 'network', status: null, code: null });
  });

  return { close: finish };
}

/** A turn as the server stores it (coach_turn_json, migration 0046). */
export interface CoachTurnView extends StreamTurn {
  conversation_id: string;
  degraded: boolean;
  user_message: StreamedRow | null;
  assistant_message: StreamedRow | null;
}

async function postCoach(accessToken: string, body: unknown): Promise<Response> {
  return fetch(functionsUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Where a turn stands on the server. Never calls the AI.
 *   view     the turn exists (it may be saved, running or uncertain)
 *   missing  the server never got this message (safe to send it again)
 *   null     could not ask (offline, server error)
 */
export async function fetchCoachTurn(
  accessToken: string,
  turnId: string,
): Promise<{ view: CoachTurnView } | 'missing' | null> {
  try {
    const res = await postCoach(accessToken, { turn_status: turnId });
    if (res.status === 404) {
      const code = errorCode(await res.text());
      // An older server without turns answers 4xx with another code.
      return code === 'turn_not_found' ? 'missing' : null;
    }
    if (!res.ok) return null;
    const body = (await res.json()) as { turn?: CoachTurnView };
    return body.turn ? { view: body.turn } : null;
  } catch {
    return null;
  }
}

/** Tells the server the person tapped Stop (best effort). */
export async function stopCoachTurn(accessToken: string, turnId: string): Promise<void> {
  try {
    await postCoach(accessToken, { stop_turn: turnId });
  } catch {
    // Offline: the server saves the full reply instead.
  }
}
