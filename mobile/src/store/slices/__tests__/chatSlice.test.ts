import reducer, {
  coachFailure,
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
          userMessage: { id: 'u', role: 'user', content: 'hello', feedback: 0, timestamp: 't' },
          aiMessage: { id: 'a', role: 'assistant', content: 'ok', feedback: 0, timestamp: 't' },
          remainingToday: 15,
          contextUsed: null,
          suggestions: [],
          degraded: true,
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
