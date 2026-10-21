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
};

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
    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, feedback, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    const sentToday = ((data ?? []) as MessageRow[]).filter(
      (m) => m.role === 'user' && m.created_at.slice(0, 10) === today,
    ).length;

    return {
      conversationId,
      messages: ((data ?? []) as MessageRow[]).map(rowToMessage),
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
}

export const sendChatMessage = createAsyncThunk<
  {
    userMessage: ChatMessage;
    aiMessage: ChatMessage;
    remainingToday: number;
    contextUsed: ChatContextUsed | null;
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
      'Your coach could not answer right now. Try again in a moment.',
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
      .addCase(sendChatMessage.pending, (state) => {
        state.sending = true;
        state.error = null;
        state.rateLimitedMessage = null;
      })
      .addCase(sendChatMessage.fulfilled, (state, action) => {
        state.sending = false;
        state.messages.push(action.payload.userMessage);
        state.messages.push(action.payload.aiMessage);
        state.messagesSentToday =
          DAILY_MESSAGE_LIMIT - action.payload.remainingToday;
        state.contextUsed = action.payload.contextUsed;
      })
      .addCase(sendChatMessage.rejected, (state, action) => {
        state.sending = false;
        if (action.payload === '__RATE_LIMITED__') {
          state.rateLimitedMessage =
            'That is all for today — your coach rests at midnight. 20 messages per day.';
          state.messagesSentToday = DAILY_MESSAGE_LIMIT;
        } else {
          state.error = action.payload ?? 'Could not send that message.';
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

export default chatSlice.reducer;
