// Coach: the line drops before the first server event, but the server had
// already saved (and counted) the message. The app must find it and the
// reply instead of asking the person to send it again.

import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { sendChatMessage } from '../chatSlice';

jest.mock('../../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

const mockQueries: { role?: unknown; content?: unknown }[] = [];
let mockSavedUser: Record<string, unknown> | null = null;
let mockSavedReply: Record<string, unknown> | null = null;

jest.mock('../../../lib/coachStream', () => ({
  openCoachStream: (_req: unknown, handlers: { onFailure: (f: unknown) => void }) => {
    setTimeout(() => handlers.onFailure({ kind: 'network', status: null, code: null }), 0);
    return { close: () => undefined };
  },
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) },
    from: () => {
      const filters: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (k: string, v: unknown) => {
        filters[k] = v;
        return b;
      };
      b.gte = () => b;
      b.order = () => b;
      b.limit = () => b;
      b.maybeSingle = () => {
        mockQueries.push({ ...filters });
        const row = filters.role === 'user' ? mockSavedUser : mockSavedReply;
        return Promise.resolve({ data: row, error: null });
      };
      return b;
    },
  },
}));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  mockQueries.length = 0;
});
afterEach(() => jest.useRealTimers());

function store() {
  return configureStore({
    reducer: { chat: chatReducer },
    preloadedState: { chat: { ...chatReducer(undefined, { type: 'init' }), conversationId: 'conv-1' } },
  });
}

async function run(s: ReturnType<typeof store>, text: string) {
  const p = s.dispatch(sendChatMessage(text));
  for (let i = 0; i < 40; i++) {
    await jest.advanceTimersByTimeAsync(1000);
  }
  return p;
}

it('recovers a message the server saved before the line dropped', async () => {
  mockSavedUser = { id: 'u-1', content: 'hello coach', created_at: new Date().toISOString() };
  mockSavedReply = { id: 'a-1', role: 'assistant', content: 'We can do this.', feedback: 0, created_at: new Date().toISOString() };
  const s = store();
  const result = await run(s, 'hello coach');
  expect(sendChatMessage.fulfilled.match(result)).toBe(true);
  const ids = s.getState().chat.messages.map((m) => m.id);
  expect(ids).toEqual(['u-1', 'a-1']);
  expect(mockQueries[0]).toMatchObject({ role: 'user', content: 'hello coach' });
});

it('asks to resend only when the server never got the message', async () => {
  mockSavedUser = null;
  mockSavedReply = null;
  const s = store();
  const result = await run(s, 'hello again');
  expect(sendChatMessage.rejected.match(result)).toBe(true);
  expect(s.getState().chat.messages.some((m) => m.id.startsWith('u-'))).toBe(false);
});
