import i18n from '../../i18n';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  describeFunctionError,
  type FunctionFailure,
  isNotDeployed,
} from '../../lib/functionErrors';
import { supabase } from '../../lib/supabase';
import {
  type CoachTurnView,
  fetchCoachTurn,
  openCoachStream,
  stopCoachTurn,
  type StreamDone,
  type StreamMeta,
  type StreamTurn,
} from '../../lib/coachStream';
import {
  clearPendingTurn,
  loadPendingTurn,
  newTurnId,
  savePendingTurn,
} from '../../lib/coachTurns';
import type { ChatMessage } from '../../api/types';

export const DAILY_MESSAGE_LIMIT = 20;
export const MESSAGE_MAX_LENGTH = 500;

export interface ChatContextUsed {
  user_level?: number;
  daily_score?: number;
  streak?: number;
}

export interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  loadingHistory: boolean;
  sending: boolean;
  error: string | null;
  rateLimitedMessage: string | null;
  messagesSentToday: number;
  contextUsed: ChatContextUsed | null;
  /** Context-aware quick replies from the last coach response. */
  suggestions: string[];
  /** Text of a send that failed, so the UI can offer a retry. */
  failedText: string | null;
  /** Set when the last reply is the rule-based stand-in (model unreachable). */
  degradedReply: boolean;
  startingNewChat: boolean;
  /** When the server's daily count resets (midnight in profile timezone). */
  resetsAt: string | null;
  /** The reply being written right now, shown below the list. */
  streaming: StreamingReply | null;
  /** Turn id of a failed send, so Retry resends the same turn (no double count). */
  failedTurnId: string | null;
  /** A message whose reply is not on screen yet (see CoachRecovery). */
  recovery: CoachRecovery | null;
}

/**
 * A sent message without its reply on screen:
 *   waiting    the reply may still be saved (lost signal, app restart);
 *              "Check again" asks the server, never the AI
 *   uncertain  the AI did not answer in time; "Try again" asks the AI once
 *              more for the same message, without using another message
 *   unsent     the server never got it; "Send again" sends the same turn
 */
export interface CoachRecovery {
  turnId: string;
  text: string;
  status: 'waiting' | 'uncertain' | 'unsent';
  canRetry: boolean;
}

export interface StreamingReply {
  text: string;
  /** waiting: no word yet (typing dots). reconnecting: the line dropped. */
  phase: 'waiting' | 'streaming' | 'reconnecting';
}

const initialState: ChatState = {
  conversationId: null,
  messages: [],
  loadingHistory: false,
  sending: false,
  error: null,
  rateLimitedMessage: null,
  messagesSentToday: 0,
  contextUsed: null,
  suggestions: [],
  failedText: null,
  degradedReply: false,
  startingNewChat: false,
  resetsAt: null,
  streaming: null,
  failedTurnId: null,
  recovery: null,
};

const PENDING_PREFIX = 'pending-';
/** A stopped reply the server had not saved yet: shown, not rateable. */
const LOCAL_PREFIX = 'local-';

/** Warn once this many messages are left (15 of 20 used). */
export const LOW_MESSAGES_WARNING = 5;

function rateLimitMessage(): string {
  return i18n.t('chatErrors.rateLimit');
}

export function remainingMessages(state: ChatState): number {
  return Math.max(0, DAILY_MESSAGE_LIMIT - state.messagesSentToday);
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  feedback: number;
  created_at: string;
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    feedback: (row.feedback as -1 | 0 | 1) ?? 0,
    timestamp: row.created_at,
  };
}

/**
 * Today's count from the coach function, which counts in the user's
 * profile timezone exactly like the limit it enforces. Falls back to a
 * local count when the deployed function is older than this app.
 */
export async function fetchCoachQuota(): Promise<{
  sentToday: number;
  resetsAt: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('coach', {
    body: { status: true },
  });
  const quota = data as { sent_today?: unknown; resets_at?: unknown } | null;
  if (!error && typeof quota?.sent_today === 'number') {
    return {
      sentToday: quota.sent_today,
      resetsAt: typeof quota.resets_at === 'string' ? quota.resets_at : null,
    };
  }
  return { sentToday: await countSentToday(), resetsAt: null };
}

/** User messages sent today across every chat (RLS scopes it to the user). */
async function countSentToday(): Promise<number> {
  // Local midnight; the server enforces the real limit in the user's timezone.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', startOfToday.toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function getOrCreateConversation(userId: string): Promise<string> {
  const { data: existing, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ user_id: userId })
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id as string;
}

export const fetchChatHistory = createAsyncThunk<
  {
    conversationId: string;
    messages: ChatMessage[];
    messagesSentToday: number;
    resetsAt: string | null;
  },
  void,
  { rejectValue: string }
>('chat/fetchHistory', async (_, { rejectWithValue }) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error(i18n.t('chatErrors.notSignedIn'));

    const conversationId = await getOrCreateConversation(user.id);
    // Newest 50, then flip to chronological (ascending + limit returned the
    // oldest 50 forever once a conversation grew past that).
    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, feedback, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = ((data ?? []) as MessageRow[]).reverse();
    const quota = await fetchCoachQuota();

    return {
      conversationId,
      messages: rows.map(rowToMessage),
      messagesSentToday: quota.sentToday,
      resetsAt: quota.resetsAt,
    };
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : i18n.t('chatErrors.loadConversation'),
    );
  }
});

/** Re-reads the server's count (e.g. when the midnight countdown ends). */
export const refreshCoachQuota = createAsyncThunk<
  { sentToday: number; resetsAt: string | null },
  void,
  { rejectValue: string }
>('chat/refreshQuota', async (_, { rejectWithValue }) => {
  try {
    return await fetchCoachQuota();
  } catch {
    return rejectWithValue(i18n.t('chatErrors.couldNotRefreshThe'));
  }
});

/** Starts an empty chat. Earlier chats stay stored in `conversations`. */
export const startNewChat = createAsyncThunk<
  { conversationId: string },
  void,
  { state: { chat: ChatState }; rejectValue: string }
>('chat/startNew', async (_, { getState, rejectWithValue }) => {
  const { chat } = getState();
  // Already on an empty chat: reuse it rather than piling up empty rows.
  if (chat.conversationId && chat.messages.length === 0) {
    return { conversationId: chat.conversationId };
  }
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error(i18n.t('chatErrors.notSignedIn'));
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single();
    if (error) throw error;
    return { conversationId: data.id as string };
  } catch {
    return rejectWithValue(i18n.t('chatErrors.newChatFailed'));
  }
});

export interface CoachSendFailure {
  message: string;
  rateLimited: boolean;
  /** The chat the app pointed at no longer exists on the server. */
  conversationGone: boolean;
  /** The person tapped Stop; nothing to report. */
  stopped?: boolean;
  /** The server saved the user's message before the line dropped. */
  userMessage?: ChatMessage;
  /** Turn id to resend with, so a retry never counts twice. */
  turnId?: string;
  /** The message reached the server but its reply is not on screen. */
  recovery?: CoachRecovery;
}

/** What to tell the user when the coach call fails. */
export function coachFailure(failure: FunctionFailure): CoachSendFailure {
  const result = (message: string): CoachSendFailure => ({
    message,
    rateLimited: false,
    conversationGone: false,
  });
  if (failure.kind === 'network') {
    return result(i18n.t('chatErrors.offline'));
  }
  if (failure.status === 429) {
    return { ...result(rateLimitMessage()), rateLimited: true };
  }
  if (failure.status === 401) {
    return result(i18n.t('chatErrors.sessionExpired'));
  }
  if (failure.code === 'conversation_not_found') {
    return {
      ...result(i18n.t('chatErrors.chatGone')),
      conversationGone: true,
    };
  }
  if (isNotDeployed(failure, ['conversation_not_found'])) {
    return result(
      i18n.t('chatErrors.notDeployed'),
    );
  }
  if (failure.status === 503 && failure.code === 'not_configured') {
    return result(
      i18n.t('chatErrors.notConfigured'),
    );
  }
  if (failure.code === 'message_too_long') {
    return result(i18n.t('chatErrors.tooLong', { max: MESSAGE_MAX_LENGTH }));
  }
  return result(i18n.t('chatErrors.generic'));
}

function streamedToMessage(
  row: { id: string; content: string; created_at: string },
  role: 'user' | 'assistant',
): ChatMessage {
  return { id: row.id, role, content: row.content, feedback: 0, timestamp: row.created_at };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Waits between reconnect checks: about 30 seconds in all. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000];
/** Words are shown in small batches so the list is not re-rendered per token. */
const FLUSH_MS = 50;

export type SendArg = string | { text: string; turnId?: string; retry?: boolean };

function sendArgs(arg: SendArg): { text: string; turnId?: string; retry: boolean } {
  return typeof arg === 'string' ? { text: arg, retry: false } : { ...arg, retry: arg.retry === true };
}

export interface SendResult {
  conversationId: string | null;
  turnId: string;
  userMessage: ChatMessage;
  /** Null when the person stopped before any word arrived. */
  aiMessage: ChatMessage | null;
  remainingToday: number;
  resetsAt: string | null;
  contextUsed: ChatContextUsed | null;
  suggestions: string[];
  degraded: boolean;
  stopped: boolean;
}

/** What the server says about a turn after the line dropped. */
type TurnCheck =
  | { kind: 'saved'; view: CoachTurnView }
  | { kind: 'uncertain'; view: CoachTurnView }
  | { kind: 'stopped'; view: CoachTurnView }
  | { kind: 'running'; view: CoachTurnView }
  | { kind: 'missing' }
  | { kind: 'offline' };

async function checkTurn(accessToken: string, turnId: string): Promise<TurnCheck> {
  const found = await fetchCoachTurn(accessToken, turnId);
  if (found === null) return { kind: 'offline' };
  if (found === 'missing') return { kind: 'missing' };
  const { view } = found;
  if (view.status === 'saved' && view.assistant_message) return { kind: 'saved', view };
  if (view.status === 'uncertain') return { kind: 'uncertain', view };
  if (view.status === 'stopped') return { kind: 'stopped', view };
  return { kind: 'running', view };
}

/**
 * Sends a message and streams the reply. Abort the promise that dispatch()
 * returns to stop generating.
 *
 * Every message has a turn id (made here, or passed in to resend the same
 * message). It is kept on the phone until the turn ends, so after a lost
 * signal or a restart the app asks the server about that turn instead of
 * sending the message again: a saved reply is shown, a running one is
 * waited for, and an uncertain one (the AI did not answer in time) waits for
 * the person to tap "Try again". Resending a turn id never counts twice.
 */
export const sendChatMessage = createAsyncThunk<
  SendResult,
  SendArg,
  { state: { chat: ChatState }; rejectValue: CoachSendFailure }
>('chat/send', async (arg, { getState, dispatch, signal, rejectWithValue, requestId }) => {
  const { text, turnId: givenTurn, retry } = sendArgs(arg);
  const { conversationId } = getState().chat;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return rejectWithValue(coachFailure({ kind: 'http', status: 401, code: null }));
  }
  const userId = session.user?.id ?? 'anonymous';
  const turnId = givenTurn ?? newTurnId();
  const pending = loadPendingTurn(userId);
  savePendingTurn(userId, {
    turnId,
    // A resent turn stays in the chat it was first sent to.
    conversationId: pending?.turnId === turnId ? pending.conversationId : conversationId,
    text,
    sentAt: pending?.turnId === turnId ? pending.sentAt : Date.now(),
  });

  let meta: StreamMeta | null = null;
  let streamed = '';
  let buffer = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    flushTimer = null;
    if (!buffer) return;
    dispatch(chatSlice.actions.streamText({ requestId, text: buffer }));
    buffer = '';
  };

  type Outcome =
    | { kind: 'done'; done: StreamDone }
    | { kind: 'failed'; failure: FunctionFailure }
    | { kind: 'turn'; turn: StreamTurn }
    | { kind: 'stopped' };

  const outcome = await new Promise<Outcome>((resolve) => {
    const stream = openCoachStream(
      { accessToken: session.access_token, message: text, conversationId, turnId, retry },
      {
        onMeta: (m) => {
          meta = m;
          dispatch(chatSlice.actions.streamMeta({ requestId, meta: m }));
        },
        onDelta: (piece) => {
          streamed += piece;
          buffer += piece;
          if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
        },
        onDone: (done) => resolve({ kind: 'done', done }),
        onTurn: (turn) => resolve({ kind: 'turn', turn }),
        onFailure: (failure) => resolve({ kind: 'failed', failure }),
      },
    );
    signal.addEventListener('abort', () => {
      stream.close();
      resolve({ kind: 'stopped' });
    });
  });
  if (flushTimer) clearTimeout(flushTimer);
  flush();

  const m = meta as StreamMeta | null;
  const base = (userMessage: ChatMessage) => ({
    conversationId: m?.conversation_id ?? conversationId,
    turnId,
    userMessage,
    remainingToday: m?.remaining_today ?? remainingMessages(getState().chat),
    resetsAt: m?.resets_at ?? getState().chat.resetsAt,
    contextUsed: m?.context_used ?? null,
    suggestions: m?.suggestions ?? [],
  });
  const localUser = (): ChatMessage =>
    streamedToMessage(
      { id: `${LOCAL_PREFIX}${requestId}`, content: text, created_at: new Date().toISOString() },
      'user',
    );
  const savedReply = (view: CoachTurnView): SendResult => ({
    ...base(view.user_message ? streamedToMessage(view.user_message, 'user') : localUser()),
    conversationId: view.conversation_id,
    aiMessage: streamedToMessage(view.assistant_message!, 'assistant'),
    degraded: view.degraded === true,
    stopped: false,
  });
  const uncertain = (userMessage: ChatMessage | undefined, canRetry: boolean) =>
    rejectWithValue({
      message: i18n.t('chatErrors.replyUncertain'),
      rateLimited: false,
      conversationGone: false,
      userMessage,
      recovery: { turnId, text, status: 'uncertain', canRetry },
    });
  const done = () => clearPendingTurn(userId, turnId);

  if (outcome.kind === 'done') {
    done();
    const userMessage = m ? streamedToMessage(m.user_message, 'user') : localUser();
    return {
      ...base(userMessage),
      aiMessage: {
        ...streamedToMessage(outcome.done.ai_message, 'assistant'),
        content: outcome.done.text || outcome.done.ai_message.content,
      },
      remainingToday: outcome.done.remaining_today,
      resetsAt: outcome.done.resets_at ?? m?.resets_at ?? null,
      degraded: outcome.done.degraded === true,
      stopped: false,
    };
  }

  const savedUser = m ? streamedToMessage(m.user_message, 'user') : undefined;

  if (outcome.kind === 'turn') {
    if (outcome.turn.status === 'stopped') {
      done();
      return { ...base(savedUser ?? localUser()), aiMessage: null, degraded: false, stopped: true };
    }
    // The AI did not answer in time. The turn stays on the phone, so the
    // "Try again" state also survives a restart.
    return uncertain(savedUser, outcome.turn.can_retry);
  }

  if (outcome.kind === 'stopped') {
    done();
    if (!m) {
      // Nothing came back yet; the server may still have saved the message.
      void stopCoachTurn(session.access_token, turnId);
      return rejectWithValue({ message: '', rateLimited: false, conversationGone: false, stopped: true });
    }
    // Ask the server to keep only what was shown, then pick up its row so
    // the thumbs work; else keep the text on screen as it is.
    await stopCoachTurn(session.access_token, turnId);
    let saved: ChatMessage | null = null;
    if (streamed) {
      await sleep(800);
      const check = await checkTurn(session.access_token, turnId);
      if (check.kind === 'saved') saved = streamedToMessage(check.view.assistant_message!, 'assistant');
    }
    return {
      ...base(savedUser!),
      aiMessage: saved ?? (streamed
        ? {
          id: `${LOCAL_PREFIX}${requestId}`,
          role: 'assistant',
          content: streamed.trim(),
          feedback: 0,
          timestamp: new Date().toISOString(),
        }
        : null),
      degraded: false,
      stopped: true,
    };
  }

  // The server refused before saving anything (401, 429, 503...): the turn
  // is over and the person may send it again.
  if (outcome.failure.kind === 'http' && !m && outcome.failure.status !== 500) {
    done();
    return rejectWithValue({ ...coachFailure(outcome.failure), turnId });
  }

  // The line dropped (or the server failed after saving). Ask about the
  // turn instead of sending again: that would use up another message.
  dispatch(chatSlice.actions.streamReconnecting({ requestId }));
  let lastCheck: TurnCheck = { kind: 'offline' };
  for (const delay of RECONNECT_DELAYS_MS) {
    await sleep(delay, signal);
    if (signal.aborted) break;
    lastCheck = await checkTurn(session.access_token, turnId);
    if (lastCheck.kind === 'saved') {
      done();
      return savedReply(lastCheck.view);
    }
    if (lastCheck.kind === 'uncertain') {
      return uncertain(
        lastCheck.view.user_message ? streamedToMessage(lastCheck.view.user_message, 'user') : savedUser,
        lastCheck.view.can_retry,
      );
    }
    if (lastCheck.kind === 'stopped') {
      done();
      return rejectWithValue({ message: '', rateLimited: false, conversationGone: false, stopped: true });
    }
    // The server never got it: safe to send again with the same turn id.
    if (lastCheck.kind === 'missing' && !m) break;
  }

  if (signal.aborted) {
    done();
    return rejectWithValue({
      message: '',
      rateLimited: false,
      conversationGone: false,
      stopped: true,
      userMessage: savedUser,
    });
  }
  if (lastCheck.kind === 'missing' && !m) {
    // Kept on the phone: after a restart the banner still offers to resend.
    return rejectWithValue({ ...coachFailure(outcome.failure), turnId });
  }
  const runningUser = lastCheck.kind === 'running' && lastCheck.view.user_message
    ? streamedToMessage(lastCheck.view.user_message, 'user')
    : savedUser;
  return rejectWithValue({
    message: i18n.t('chatErrors.replyPending'),
    rateLimited: false,
    conversationGone: false,
    userMessage: runningUser,
    recovery: { turnId, text, status: 'waiting', canRetry: false },
  });
});

export type RecoverResult =
  | { kind: 'none' }
  | { kind: 'saved'; conversationId: string; userMessage: ChatMessage | null; aiMessage: ChatMessage }
  | { kind: 'uncertain' | 'waiting' | 'resume' | 'unsent'; recovery: CoachRecovery; userMessage: ChatMessage | null };

/**
 * Picks up the message that was still waiting when the app lost signal or
 * was closed. Run it after the chat history loads. Never calls the AI:
 * 'resume' means the server saved the message but never started the AI for
 * it, so the screen may send it again with the same turn id for free.
 */
export const recoverCoachTurn = createAsyncThunk<
  RecoverResult,
  { polls?: number } | void,
  { state: { chat: ChatState } }
>('chat/recoverTurn', async (arg, { signal }) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!session || !userId) return { kind: 'none' };
  const pending = loadPendingTurn(userId);
  if (!pending) return { kind: 'none' };
  const recovery = (status: CoachRecovery['status'], canRetry: boolean): CoachRecovery => ({
    turnId: pending.turnId,
    text: pending.text,
    status,
    canRetry,
  });
  const polls = (arg && arg.polls) ?? 4;
  let check: TurnCheck = { kind: 'offline' };
  for (let i = 0; i <= polls; i += 1) {
    if (i > 0) await sleep(RECONNECT_DELAYS_MS[Math.min(i - 1, RECONNECT_DELAYS_MS.length - 1)], signal);
    if (signal.aborted) break;
    check = await checkTurn(session.access_token, pending.turnId);
    if (check.kind !== 'running' && check.kind !== 'offline') break;
  }
  const userOf = (view: CoachTurnView) =>
    view.user_message ? streamedToMessage(view.user_message, 'user') : null;
  switch (check.kind) {
    case 'saved':
      clearPendingTurn(userId, pending.turnId);
      return {
        kind: 'saved',
        conversationId: check.view.conversation_id,
        userMessage: userOf(check.view),
        aiMessage: streamedToMessage(check.view.assistant_message!, 'assistant'),
      };
    case 'stopped':
      clearPendingTurn(userId, pending.turnId);
      return { kind: 'none' };
    case 'uncertain':
      return { kind: 'uncertain', recovery: recovery('uncertain', check.view.can_retry), userMessage: userOf(check.view) };
    case 'running':
      return check.view.status === 'reserved'
        ? { kind: 'resume', recovery: recovery('waiting', true), userMessage: userOf(check.view) }
        : { kind: 'waiting', recovery: recovery('waiting', false), userMessage: userOf(check.view) };
    case 'missing':
      return { kind: 'unsent', recovery: recovery('unsent', true), userMessage: null };
    default:
      return { kind: 'waiting', recovery: recovery('waiting', false), userMessage: null };
  }
});

/** Hides the recovery notice and forgets the waiting turn on this phone. */
export const dismissRecovery = createAsyncThunk<void, void, { state: { chat: ChatState } }>(
  'chat/dismissRecovery',
  async (_, { getState, dispatch }) => {
    const turnId = getState().chat.recovery?.turnId;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (turnId && session?.user?.id) clearPendingTurn(session.user.id, turnId);
    dispatch(chatSlice.actions.recoveryDismissed());
  },
);

export const setMessageFeedback = createAsyncThunk<
  { messageId: string; feedback: -1 | 0 | 1 },
  { messageId: string; feedback: -1 | 0 | 1 },
  { rejectValue: string }
>('chat/feedback', async ({ messageId, feedback }, { rejectWithValue }) => {
  const { error } = await supabase
    .from('messages')
    .update({ feedback })
    .eq('id', messageId);
  if (error) {
    return rejectWithValue(i18n.t('chatErrors.ratingFailed'));
  }
  return { messageId, feedback };
});

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearChat() {
      return initialState;
    },
    chatErrorCleared(state) {
      state.error = null;
      state.rateLimitedMessage = null;
      state.failedText = null;
      state.failedTurnId = null;
    },
    recoveryDismissed(state) {
      state.recovery = null;
    },
    streamMeta(state, action: PayloadAction<{ requestId: string; meta: StreamMeta }>) {
      const { requestId, meta } = action.payload;
      // The saved row replaces the optimistic bubble; it now counts.
      const pending = state.messages.find((m) => m.id === `${PENDING_PREFIX}${requestId}`);
      if (pending) {
        pending.id = meta.user_message.id;
        pending.timestamp = meta.user_message.created_at;
      }
      state.conversationId = meta.conversation_id;
      state.messagesSentToday = DAILY_MESSAGE_LIMIT - meta.remaining_today;
      state.resetsAt = meta.resets_at ?? state.resetsAt;
      if (meta.context_used) state.contextUsed = meta.context_used;
    },
    streamText(state, action: PayloadAction<{ requestId: string; text: string }>) {
      if (!state.streaming) return;
      state.streaming.text += action.payload.text;
      state.streaming.phase = 'streaming';
    },
    streamReconnecting(state, action: PayloadAction<{ requestId: string }>) {
      void action;
      if (state.streaming) state.streaming.phase = 'reconnecting';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChatHistory.pending, (state) => {
        state.loadingHistory = true;
        state.error = null;
      })
      .addCase(fetchChatHistory.fulfilled, (state, action) => {
        state.loadingHistory = false;
        state.degradedReply = false;
        state.conversationId = action.payload.conversationId;
        state.messages = action.payload.messages;
        state.messagesSentToday = action.payload.messagesSentToday;
        state.resetsAt = action.payload.resetsAt;
      })
      .addCase(refreshCoachQuota.fulfilled, (state, action) => {
        state.messagesSentToday = action.payload.sentToday;
        state.resetsAt = action.payload.resetsAt;
        if (remainingMessages(state) > 0) state.rateLimitedMessage = null;
      })
      .addCase(fetchChatHistory.rejected, (state, action) => {
        state.loadingHistory = false;
        state.error = action.payload ?? i18n.t('chatErrors.loadConversation');
      })
      .addCase(startNewChat.pending, (state) => {
        state.startingNewChat = true;
        state.error = null;
      })
      .addCase(startNewChat.fulfilled, (state, action) => {
        state.startingNewChat = false;
        state.conversationId = action.payload.conversationId;
        state.messages = [];
        state.suggestions = [];
        state.failedText = null;
        state.degradedReply = false;
      })
      .addCase(startNewChat.rejected, (state, action) => {
        state.startingNewChat = false;
        state.error = action.payload ?? i18n.t('chatErrors.newChatFailed');
      })
      .addCase(sendChatMessage.pending, (state, action) => {
        state.sending = true;
        state.streaming = { text: '', phase: 'waiting' };
        state.error = null;
        state.degradedReply = false;
        state.rateLimitedMessage = null;
        state.failedText = null;
        state.failedTurnId = null;
        const { text, turnId } = sendArgs(action.meta.arg);
        // Resending a turn whose message is already on screen: no new bubble.
        const resend = Boolean(turnId) && state.recovery?.turnId === turnId;
        state.recovery = null;
        if (resend && state.messages.some((m) => m.role === 'user' && m.content === text)) return;
        // Show the user's bubble immediately; the server row replaces it.
        state.messages.push({
          id: `${PENDING_PREFIX}${action.meta.requestId}`,
          role: 'user',
          content: text,
          feedback: 0,
          timestamp: new Date().toISOString(),
        });
      })
      .addCase(sendChatMessage.fulfilled, (state, action) => {
        state.sending = false;
        state.streaming = null;
        const { userMessage, aiMessage } = action.payload;
        state.messages = state.messages.filter(
          (m) =>
            m.id !== `${PENDING_PREFIX}${action.meta.requestId}` &&
            m.id !== userMessage.id &&
            m.id !== aiMessage?.id,
        );
        state.messages.push(userMessage);
        if (aiMessage) state.messages.push(aiMessage);
        state.recovery = null;
        state.resetsAt = action.payload.resetsAt;
        state.conversationId = action.payload.conversationId;
        state.suggestions = action.payload.suggestions;
        state.degradedReply = action.payload.degraded;
        state.messagesSentToday =
          DAILY_MESSAGE_LIMIT - action.payload.remainingToday;
        state.contextUsed = action.payload.contextUsed;
      })
      .addCase(sendChatMessage.rejected, (state, action) => {
        state.sending = false;
        state.streaming = null;
        const failure = action.payload;
        // A message the server saved stays; only the optimistic one goes.
        state.messages = state.messages.filter(
          (m) => m.id !== `${PENDING_PREFIX}${action.meta.requestId}`,
        );
        if (failure?.userMessage) upsertMessage(state, failure.userMessage);
        if (failure?.stopped) return;
        if (failure?.recovery) {
          state.recovery = failure.recovery;
          return;
        }
        if (failure?.rateLimited) {
          state.rateLimitedMessage = failure.message;
          state.messagesSentToday = DAILY_MESSAGE_LIMIT;
        } else {
          state.error = failure?.message ?? i18n.t('chatErrors.sendFailed');
          state.failedText = sendArgs(action.meta.arg).text;
          state.failedTurnId = failure?.turnId ?? null;
          // Retry then goes to the newest chat on the server.
          if (failure?.conversationGone) state.conversationId = null;
        }
      })
      .addCase(recoverCoachTurn.fulfilled, (state, action) => {
        const r = action.payload;
        if (r.kind === 'none') return;
        if (r.kind === 'saved') {
          // Shown only if that chat is the one on screen (history may have
          // loaded it already; upsert keeps one copy).
          if (r.conversationId === state.conversationId) {
            if (r.userMessage) upsertMessage(state, r.userMessage);
            upsertMessage(state, r.aiMessage);
          }
          state.recovery = null;
          return;
        }
        if (r.userMessage) upsertMessage(state, r.userMessage);
        if (r.kind === 'unsent') {
          state.error = i18n.t('chatErrors.notSentYet');
          state.failedText = r.recovery.text;
          state.failedTurnId = r.recovery.turnId;
          state.recovery = null;
          return;
        }
        state.recovery = r.recovery;
      })
      .addCase(
        setMessageFeedback.fulfilled,
        (state, action: PayloadAction<{ messageId: string; feedback: -1 | 0 | 1 }>) => {
          const msg = state.messages.find((m) => m.id === action.payload.messageId);
          if (msg) {
            msg.feedback = action.payload.feedback;
          }
        },
      );
  },
});

export const { clearChat, chatErrorCleared, recoveryDismissed } = chatSlice.actions;

/** Adds a saved message once (by id) and keeps the list in time order. */
function upsertMessage(state: ChatState, message: ChatMessage) {
  if (state.messages.some((m) => m.id === message.id)) return;
  state.messages.push(message);
  state.messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function isPendingMessage(message: ChatMessage): boolean {
  return message.id.startsWith(PENDING_PREFIX);
}

/** Not saved on the server (yet), so it cannot be rated. */
export function isLocalMessage(message: ChatMessage): boolean {
  return message.id.startsWith(PENDING_PREFIX) || message.id.startsWith(LOCAL_PREFIX);
}

export default chatSlice.reducer;
