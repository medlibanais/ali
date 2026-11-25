import i18n from '../../i18n';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  describeFunctionError,
  type FunctionFailure,
  isNotDeployed,
} from '../../lib/functionErrors';
import { supabase } from '../../lib/supabase';
import {
  openCoachStream,
  type StreamDone,
  type StreamMeta,
} from '../../lib/coachStream';
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

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** The saved reply to a user message, if the server got to save it. */
async function findSavedReply(
  conversationId: string,
  after: string,
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, feedback, created_at')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .gte('created_at', after)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToMessage(data as MessageRow) : null;
}

/**
 * The user's message, if the server saved it although the line dropped
 * before its first event arrived (the quota reservation saves the message
 * before the stream opens). Matches this chat, this text, sent just now.
 */
async function findSavedUserMessage(
  conversationId: string,
  text: string,
  sentAt: number,
): Promise<{ id: string; content: string; created_at: string } | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .eq('content', text)
    .gte('created_at', new Date(sentAt - 5000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; content: string; created_at: string } | null) ?? null;
}

/** Waits between reconnect checks: about 30 seconds in all. */
const RECONNECT_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000];
/** Words are shown in small batches so the list is not re-rendered per token. */
const FLUSH_MS = 50;

export interface SendResult {
  conversationId: string | null;
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

/**
 * Sends a message and streams the reply. Abort the promise that dispatch()
 * returns to stop generating. A dropped connection switches to
 * "Reconnecting…" and then looks for the reply the server saved, instead of
 * sending the message again (that would use up another message).
 */
export const sendChatMessage = createAsyncThunk<
  SendResult,
  string,
  { state: { chat: ChatState }; rejectValue: CoachSendFailure }
>('chat/send', async (text, { getState, dispatch, signal, rejectWithValue, requestId }) => {
  const { conversationId } = getState().chat;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return rejectWithValue(coachFailure({ kind: 'http', status: 401, code: null }));
  }

  const sentAt = Date.now();
  let meta: StreamMeta | null = null;
  let streamed = '';
  let buffer = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    flushTimer = null;
    if (!buffer) return;
    dispatch(chatSlice.actions.streamText(buffer));
    buffer = '';
  };

  type Outcome =
    | { kind: 'done'; done: StreamDone }
    | { kind: 'failed'; failure: FunctionFailure }
    | { kind: 'stopped' };

  const outcome = await new Promise<Outcome>((resolve) => {
    const stream = openCoachStream(
      { accessToken: session.access_token, message: text, conversationId },
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
    userMessage,
    remainingToday: m?.remaining_today ?? remainingMessages(getState().chat),
    resetsAt: m?.resets_at ?? getState().chat.resetsAt,
    contextUsed: m?.context_used ?? null,
    suggestions: m?.suggestions ?? [],
  });

  if (outcome.kind === 'done') {
    const userMessage = m
      ? streamedToMessage(m.user_message, 'user')
      : streamedToMessage(
        { id: `${LOCAL_PREFIX}${requestId}`, content: text, created_at: new Date().toISOString() },
        'user',
      );
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

  // The line dropped before the first event: the server may still have
  // saved the message (and counted it). Look for it before telling the
  // person to resend, so a retry does not post it twice.
  let recovered: { id: string; content: string; created_at: string } | null = null;
  if (!m && outcome.kind === 'failed' && outcome.failure.kind === 'network' && conversationId) {
    dispatch(chatSlice.actions.streamReconnecting());
    for (const delay of RECONNECT_DELAYS_MS.slice(0, 3)) {
      await sleep(delay, signal);
      if (signal.aborted) break;
      recovered = await findSavedUserMessage(conversationId, text, sentAt).catch(() => null);
      if (recovered) break;
    }
  }

  // Nothing reached the server, or it refused (401, 429, 503...).
  if (!m && !recovered) {
    if (outcome.kind === 'stopped' || signal.aborted) {
      return rejectWithValue({ message: '', rateLimited: false, conversationGone: false, stopped: true });
    }
    return rejectWithValue(coachFailure((outcome as { failure: FunctionFailure }).failure));
  }

  const savedRow = m ? m.user_message : recovered!;
  const chatId = m ? m.conversation_id : conversationId!;
  const userMessage = streamedToMessage(savedRow, 'user');
  const savedAfter = savedRow.created_at;

  if (outcome.kind === 'stopped') {
    // The server saves what was written so far; pick up its row so the
    // thumbs work, else keep the text on screen as it is.
    let saved: ChatMessage | null = null;
    if (streamed) {
      await new Promise((r) => setTimeout(r, 800));
      saved = await findSavedReply(chatId, savedAfter).catch(() => null);
    }
    return {
      ...base(userMessage),
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

  if (outcome.failure.kind === 'network') {
    dispatch(chatSlice.actions.streamReconnecting());
    for (const delay of RECONNECT_DELAYS_MS) {
      await sleep(delay, signal);
      if (signal.aborted) break;
      try {
        const saved = await findSavedReply(chatId, savedAfter);
        if (saved) {
          return { ...base(userMessage), aiMessage: saved, degraded: false, stopped: false };
        }
      } catch {
        // Still offline: keep waiting.
      }
    }
  }

  return rejectWithValue({
    message: signal.aborted
      ? ''
      : i18n.t('chatErrors.theConnectionDroppedBefore'),
    rateLimited: false,
    conversationGone: false,
    stopped: signal.aborted,
    userMessage,
  });
});

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
    streamText(state, action: PayloadAction<string>) {
      if (!state.streaming) return;
      state.streaming.text += action.payload;
      state.streaming.phase = 'streaming';
    },
    streamReconnecting(state) {
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
        // Show the user's bubble immediately; the server row replaces it.
        state.messages.push({
          id: `${PENDING_PREFIX}${action.meta.requestId}`,
          role: 'user',
          content: action.meta.arg,
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
            m.id !== userMessage.id,
        );
        state.messages.push(userMessage);
        if (aiMessage) state.messages.push(aiMessage);
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
        if (failure?.stopped) return;
        if (failure?.rateLimited) {
          state.rateLimitedMessage = failure.message;
          state.messagesSentToday = DAILY_MESSAGE_LIMIT;
        } else {
          state.error = failure?.message ?? i18n.t('chatErrors.sendFailed');
          state.failedText = action.meta.arg;
          // Retry then goes to the newest chat on the server.
          if (failure?.conversationGone) state.conversationId = null;
        }
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

export const { clearChat, chatErrorCleared } = chatSlice.actions;

export function isPendingMessage(message: ChatMessage): boolean {
  return message.id.startsWith(PENDING_PREFIX);
}

/** Not saved on the server (yet), so it cannot be rated. */
export function isLocalMessage(message: ChatMessage): boolean {
  return message.id.startsWith(PENDING_PREFIX) || message.id.startsWith(LOCAL_PREFIX);
}

export default chatSlice.reducer;
