import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
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
};

const PENDING_PREFIX = 'pending-';

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

    // Count against the user's local day (the server enforces the real limit).
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sentToday = rows.filter(
      (m) => m.role === 'user' && new Date(m.created_at) >= startOfToday,
    ).length;

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

interface CoachFunctionResponse {
  user_message: { id: string; content: string; created_at: string };
  ai_message: { id: string; content: string; created_at: string };
  remaining_today: number;
  context_used?: ChatContextUsed;
  suggestions?: string[];
}

export const sendChatMessage = createAsyncThunk<
  {
    userMessage: ChatMessage;
    aiMessage: ChatMessage;
    remainingToday: number;
    contextUsed: ChatContextUsed | null;
    suggestions: string[];
  },
  string,
  { rejectValue: string }
>('chat/send', async (text, { rejectWithValue }) => {
  const { data, error } = await supabase.functions.invoke('coach', {
    body: { message: text },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) {
      return rejectWithValue('__RATE_LIMITED__');
    }
    return rejectWithValue(
      status
        ? 'Your future self lost the thread for a second. Tap retry.'
        : 'No connection. Check your internet and tap retry.',
    );
  }
  const payload = data as CoachFunctionResponse;
  return {
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
        state.conversationId = action.payload.conversationId;
        state.messages = action.payload.messages;
        state.messagesSentToday = action.payload.messagesSentToday;
      })
      .addCase(fetchChatHistory.rejected, (state, action) => {
        state.loadingHistory = false;
        state.error = action.payload ?? 'Could not load the conversation.';
      })
      .addCase(sendChatMessage.pending, (state, action) => {
        state.sending = true;
        state.error = null;
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
        state.suggestions = action.payload.suggestions;
        state.messagesSentToday =
          DAILY_MESSAGE_LIMIT - action.payload.remainingToday;
        state.contextUsed = action.payload.contextUsed;
      })
      .addCase(sendChatMessage.rejected, (state, action) => {
        state.sending = false;
        state.messages = state.messages.filter(
          (m) => m.id !== `${PENDING_PREFIX}${action.meta.requestId}`,
        );
        if (action.payload === '__RATE_LIMITED__') {
          state.rateLimitedMessage =
            'That is all for today — your coach rests at midnight. 20 messages per day.';
          state.messagesSentToday = DAILY_MESSAGE_LIMIT;
        } else {
          state.error = action.payload ?? 'Could not send that message.';
          state.failedText = action.meta.arg;
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
