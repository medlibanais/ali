import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  describeFunctionError,
  type FunctionFailure,
  isNotDeployed,
} from '../../lib/functionErrors';
import { supabase } from '../../lib/supabase';
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
};

const PENDING_PREFIX = 'pending-';

const RATE_LIMIT_MESSAGE =
  'That is all for today — your coach rests at midnight. 20 messages per day.';

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
  { conversationId: string; messages: ChatMessage[]; messagesSentToday: number },
  void,
  { rejectValue: string }
>('chat/fetchHistory', async (_, { rejectWithValue }) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in.');

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
    const sentToday = await countSentToday();

    return {
      conversationId,
      messages: rows.map(rowToMessage),
      messagesSentToday: sentToday,
    };
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : 'Could not load the conversation.',
    );
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
    if (!user) throw new Error('Not signed in.');
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single();
    if (error) throw error;
    return { conversationId: data.id as string };
  } catch {
    return rejectWithValue('Could not start a new chat. Try again.');
  }
});

export interface CoachSendFailure {
  message: string;
  rateLimited: boolean;
  /** The chat the app pointed at no longer exists on the server. */
  conversationGone: boolean;
}

/** What to tell the user when the coach call fails. */
export function coachFailure(failure: FunctionFailure): CoachSendFailure {
  const result = (message: string): CoachSendFailure => ({
    message,
    rateLimited: false,
    conversationGone: false,
  });
  if (failure.kind === 'network') {
    return result('No connection. Check your internet and tap retry.');
  }
  if (failure.status === 429) {
    return { ...result(RATE_LIMIT_MESSAGE), rateLimited: true };
  }
  if (failure.status === 401) {
    return result('Your session has expired. Sign out and back in, then retry.');
  }
  if (failure.code === 'conversation_not_found') {
    return {
      ...result('That chat is no longer available. Tap retry to continue in your latest chat.'),
      conversationGone: true,
    };
  }
  if (isNotDeployed(failure, ['conversation_not_found'])) {
    return result(
      'The AI coach is not set up on the server yet (the "coach" function is not deployed).',
    );
  }
  if (failure.status === 503 && failure.code === 'not_configured') {
    return result(
      'The AI coach is not switched on yet: the server is missing its GROQ_API_KEY.',
    );
  }
  if (failure.code === 'message_too_long') {
    return result(`That message is too long. Keep it under ${MESSAGE_MAX_LENGTH} characters.`);
  }
  return result('Your future self lost the thread for a second. Tap retry.');
}

interface CoachFunctionResponse {
  conversation_id?: string;
  degraded?: boolean;
  user_message: { id: string; content: string; created_at: string };
  ai_message: { id: string; content: string; created_at: string };
  remaining_today: number;
  context_used?: ChatContextUsed;
  suggestions?: string[];
}

export const sendChatMessage = createAsyncThunk<
  {
    conversationId: string | null;
    userMessage: ChatMessage;
    aiMessage: ChatMessage;
    remainingToday: number;
    contextUsed: ChatContextUsed | null;
    suggestions: string[];
    degraded: boolean;
  },
  string,
  { state: { chat: ChatState }; rejectValue: CoachSendFailure }
>('chat/send', async (text, { getState, rejectWithValue }) => {
  const { conversationId } = getState().chat;
  const { data, error } = await supabase.functions.invoke('coach', {
    body: conversationId
      ? { message: text, conversation_id: conversationId }
      : { message: text },
  });
  if (error) {
    return rejectWithValue(coachFailure(await describeFunctionError(error)));
  }
  const payload = data as CoachFunctionResponse | null;
  if (!payload?.user_message || !payload.ai_message) {
    return rejectWithValue(
      coachFailure({ kind: 'http', status: 500, code: 'bad_response' }),
    );
  }
  return {
    conversationId: payload.conversation_id ?? conversationId,
    userMessage: {
      id: payload.user_message.id,
      role: 'user',
      content: payload.user_message.content,
      feedback: 0,
      timestamp: payload.user_message.created_at,
    },
    aiMessage: {
      id: payload.ai_message.id,
      role: 'assistant',
      content: payload.ai_message.content,
      feedback: 0,
      timestamp: payload.ai_message.created_at,
    },
    remainingToday: payload.remaining_today,
    contextUsed: payload.context_used ?? null,
    suggestions: payload.suggestions ?? [],
    degraded: payload.degraded === true,
  };
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
    return rejectWithValue('Could not save that rating.');
  }
  return { messageId, feedback };
});

const chatSlice = createSlice({
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
      })
      .addCase(fetchChatHistory.rejected, (state, action) => {
        state.loadingHistory = false;
        state.error = action.payload ?? 'Could not load the conversation.';
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
        state.error = action.payload ?? 'Could not start a new chat. Try again.';
      })
      .addCase(sendChatMessage.pending, (state, action) => {
        state.sending = true;
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
        state.messages = state.messages.filter(
          (m) => m.id !== `${PENDING_PREFIX}${action.meta.requestId}`,
        );
        state.messages.push(action.payload.userMessage);
        state.messages.push(action.payload.aiMessage);
        state.conversationId = action.payload.conversationId;
        state.suggestions = action.payload.suggestions;
        state.degradedReply = action.payload.degraded;
        state.messagesSentToday =
          DAILY_MESSAGE_LIMIT - action.payload.remainingToday;
        state.contextUsed = action.payload.contextUsed;
      })
      .addCase(sendChatMessage.rejected, (state, action) => {
        state.sending = false;
        state.messages = state.messages.filter(
          (m) => m.id !== `${PENDING_PREFIX}${action.meta.requestId}`,
        );
        const failure = action.payload;
        if (failure?.rateLimited) {
          state.rateLimitedMessage = failure.message;
          state.messagesSentToday = DAILY_MESSAGE_LIMIT;
        } else {
          state.error = failure?.message ?? 'Could not send that message.';
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

export default chatSlice.reducer;
