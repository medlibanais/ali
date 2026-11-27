import reducer, {
  chatSlice,
  coachFailure,
  isLocalMessage,
  refreshCoachQuota,
  remainingMessages,
  sendChatMessage,
  startNewChat,
  type ChatState,
} from '../chatSlice';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

const base = reducer(undefined, { type: 'init' }) as ChatState;

const withHistory: ChatState = {
  ...base,
  conversationId: 'old-chat',
  messages: [
    { id: 'm1', role: 'user', content: 'hi', feedback: 0, timestamp: '2026-10-21T08:00:00Z' },
    { id: 'm2', role: 'assistant', content: 'hey', feedback: 0, timestamp: '2026-10-21T08:00:01Z' },
  ],
  suggestions: ['Am I on track?'],
  messagesSentToday: 4,
};

describe('coachFailure', () => {
  it('names the missing GROQ_API_KEY instead of a vague error', () => {
    const f = coachFailure({ kind: 'http', status: 503, code: 'not_configured' });
    expect(f.message).toContain('GROQ_API_KEY');
    expect(f.rateLimited).toBe(false);
  });

  it('flags the daily limit', () => {
    expect(coachFailure({ kind: 'http', status: 429, code: 'rate_limit_exceeded' }).rateLimited).toBe(true);
  });

  it('tells an undeployed function apart from a deleted chat', () => {
    expect(coachFailure({ kind: 'http', status: 404, code: 'NOT_FOUND' }).message).toContain(
      'not deployed',
    );
    const gone = coachFailure({ kind: 'http', status: 404, code: 'conversation_not_found' });
    expect(gone.conversationGone).toBe(true);
  });

  it('reports offline sends as a connection problem', () => {
    expect(coachFailure({ kind: 'network', status: null, code: null }).message).toContain(
      'No connection',
    );
  });
});

describe('new chat', () => {
  it('switches to the new conversation and clears the screen, keeping the daily count', () => {
    const next = reducer(
      withHistory,
      startNewChat.fulfilled({ conversationId: 'new-chat' }, 'req', undefined),
    );
    expect(next.conversationId).toBe('new-chat');
    expect(next.messages).toEqual([]);
    expect(next.suggestions).toEqual([]);
    expect(next.messagesSentToday).toBe(4);
  });

  it('forgets a deleted conversation so retry lands in the latest one', () => {
    const pending = reducer(withHistory, sendChatMessage.pending('r1', 'hello'));
    const failed = reducer(
      pending,
      sendChatMessage.rejected(null, 'r1', 'hello', {
        message: 'gone',
        rateLimited: false,
        conversationGone: true,
      }),
    );
    expect(failed.conversationId).toBeNull();
    expect(failed.failedText).toBe('hello');
    expect(failed.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('marks a stand-in reply as degraded', () => {
    const pending = reducer(withHistory, sendChatMessage.pending('r2', 'hello'));
    const done = reducer(
      pending,
      sendChatMessage.fulfilled(
        {
          conversationId: 'old-chat',
          turnId: 't-1',
          userMessage: { id: 'u', role: 'user', content: 'hello', feedback: 0, timestamp: 't' },
          aiMessage: { id: 'a', role: 'assistant', content: 'ok', feedback: 0, timestamp: 't' },
          remainingToday: 15,
          resetsAt: '2026-11-16T00:00:00Z',
          contextUsed: null,
          suggestions: [],
          degraded: true,
          stopped: false,
        },
        'r2',
        'hello',
      ),
    );
    expect(done.degradedReply).toBe(true);
    expect(done.messagesSentToday).toBe(5);
    expect(done.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'u', 'a']);
  });
});

describe('streaming', () => {
  const meta = {
    conversation_id: 'old-chat',
    user_message: { id: 'u1', content: 'hello', created_at: '2026-11-15T22:00:00Z' },
    remaining_today: 5,
    resets_at: '2026-11-16T00:00:00Z',
    context_used: null,
    suggestions: [],
  };

  it('shows typing dots, then words, and counts from the server', () => {
    const pending = reducer(withHistory, sendChatMessage.pending('r3', 'hello'));
    expect(pending.streaming).toEqual({ text: '', phase: 'waiting' });
    const started = reducer(pending, chatSlice.actions.streamMeta({ requestId: 'r3', meta }));
    // The optimistic bubble became the saved row.
    expect(started.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'u1']);
    expect(remainingMessages(started)).toBe(5);
    expect(started.resetsAt).toBe('2026-11-16T00:00:00Z');
    const words = reducer(
      reducer(started, chatSlice.actions.streamText({ requestId: 'r3', text: 'We ' })),
      chatSlice.actions.streamText({ requestId: 'r3', text: 'got this.' }),
    );
    expect(words.streaming).toEqual({ text: 'We got this.', phase: 'streaming' });
    const reconnecting = reducer(words, chatSlice.actions.streamReconnecting({ requestId: 'r3' }));
    expect(reconnecting.streaming?.phase).toBe('reconnecting');
  });

  it('keeps a stopped partial reply, unrated, without a duplicate user row', () => {
    let state = reducer(withHistory, sendChatMessage.pending('r4', 'hello'));
    state = reducer(state, chatSlice.actions.streamMeta({ requestId: 'r4', meta }));
    state = reducer(
      state,
      sendChatMessage.fulfilled(
        {
          conversationId: 'old-chat',
          turnId: 't-2',
          userMessage: { id: 'u1', role: 'user', content: 'hello', feedback: 0, timestamp: 't' },
          aiMessage: { id: 'local-r4', role: 'assistant', content: 'We got', feedback: 0, timestamp: 't' },
          remainingToday: 5,
          resetsAt: null,
          contextUsed: null,
          suggestions: [],
          degraded: false,
          stopped: true,
        },
        'r4',
        'hello',
      ),
    );
    expect(state.streaming).toBeNull();
    expect(state.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'u1', 'local-r4']);
    expect(isLocalMessage(state.messages[3])).toBe(true);
  });

  it('a Stop before the server answered shows no error', () => {
    const pending = reducer(withHistory, sendChatMessage.pending('r5', 'hello'));
    const stopped = reducer(
      pending,
      sendChatMessage.rejected(null, 'r5', 'hello', {
        message: '',
        rateLimited: false,
        conversationGone: false,
        stopped: true,
      }),
    );
    expect(stopped.error).toBeNull();
    expect(stopped.sending).toBe(false);
    expect(stopped.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('a new day from the server lifts the limit', () => {
    const limited = { ...withHistory, messagesSentToday: 20, rateLimitedMessage: 'rest' };
    const next = reducer(
      limited,
      refreshCoachQuota.fulfilled({ sentToday: 0, resetsAt: '2026-11-17T00:00:00Z' }, 'q', undefined),
    );
    expect(remainingMessages(next)).toBe(20);
    expect(next.rateLimitedMessage).toBeNull();
  });
});
