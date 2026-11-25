// Durable Coach turns, app side. A small fake of the coach function keeps
// the same rules as migration 0046 (one turn id = one saved message, one
// quota use, one reply; an uncertain turn needs an explicit "Try again"), so
// these tests check what the person sees after a lost signal, an app
// restart, a rapid retry or an account switch.
//
// The thin slice: send -> disconnect -> reopen -> recover one saved reply.

import { combineReducers, configureStore } from '@reduxjs/toolkit';
import authReducer, { login, sessionExpired } from '../authSlice';
import chatReducer, {
  type ChatState,
  recoverCoachTurn,
  RECONNECT_DELAYS_MS,
  sendChatMessage,
} from '../chatSlice';
import { accountScopeMiddleware, withAccountReset } from '../../accountScope';

jest.mock('../../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));
jest.mock('../../../lib/notifications', () => ({
  unregisterDeviceForPush: () => Promise.resolve(),
}));

// ---- the phone's storage (MMKV / localStorage) ---------------------------
const mockKv = new Map<string, string>();
jest.mock('../../../lib/kvStore', () => ({
  kvStore: {
    getString: (k: string) => mockKv.get(k),
    set: (k: string, v: string) => mockKv.set(k, v),
    delete: (k: string) => mockKv.delete(k),
  },
}));

// ---- the signed-in account ------------------------------------------------
let mockUser = 'user-a';
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: mockUser, user: { id: mockUser } } } }),
      getUser: () => Promise.resolve({ data: { user: { id: mockUser } } }),
    },
  },
}));

// ---- a fake coach function with the 0046 rules ----------------------------
type Mode =
  | 'ok' // stream the reply
  | 'drop-after-meta' // line drops after the first words; server finishes and saves
  | 'drop-before-meta' // line drops before any event; server saved the message and saves the reply
  | 'unreachable' // the request never reaches the server
  | 'timeout'; // the AI does not answer in time: turn becomes uncertain

interface Row { id: string; content: string; created_at: string }
interface Turn {
  id: string;
  user: string;
  conversation: string;
  status: 'reserved' | 'generating' | 'saved' | 'uncertain' | 'stopped';
  userMsg: Row;
  aiMsg: Row | null;
  providerCalls: number;
}
const mockServer = {
  mode: 'ok' as Mode,
  online: true,
  saveDelayMs: 500,
  turns: new Map<string, Turn>(),
  quota: new Map<string, number>(),
  messages: [] as { user: string; turnId: string; role: string; content: string }[],
  seq: 0,
  reset() {
    this.mode = 'ok';
    this.online = true;
    this.saveDelayMs = 500;
    this.turns.clear();
    this.quota.clear();
    this.messages = [];
    this.seq = 0;
  },
  row(content: string): Row {
    this.seq += 1;
    return { id: `m-${this.seq}`, content, created_at: new Date(Date.now() + this.seq).toISOString() };
  },
  view(t: Turn) {
    return {
      turn_id: t.id,
      conversation_id: t.conversation,
      status: t.status,
      can_retry: t.status === 'uncertain' && t.providerCalls < 3,
      provider_calls: t.providerCalls,
      degraded: false,
      user_message: t.userMsg,
      assistant_message: t.aiMsg,
    };
  },
  generate(t: Turn) {
    t.status = 'generating';
    t.providerCalls += 1;
    setTimeout(() => {
      if (t.status !== 'generating') return;
      t.aiMsg = this.row(`We can do "${t.userMsg.content}" together.`);
      this.messages.push({ user: t.user, turnId: t.id, role: 'assistant', content: t.aiMsg.content });
      t.status = 'saved';
    }, this.saveDelayMs);
  },
};

interface Handlers {
  onMeta: (m: unknown) => void;
  onDelta: (t: string) => void;
  onDone: (d: unknown) => void;
  onTurn: (t: unknown) => void;
  onFailure: (f: unknown) => void;
}

jest.mock('../../../lib/coachStream', () => ({
  openCoachStream: (
    req: { accessToken: string; message: string; conversationId: string | null; turnId: string; retry?: boolean },
    h: Handlers,
  ) => {
    let closed = false;
    const later = (ms: number, fn: () => void) => setTimeout(() => !closed && fn(), ms);
    const s = mockServer;
    const user = req.accessToken;
    if (s.mode === 'unreachable' || !s.online) {
      later(0, () => h.onFailure({ kind: 'network', status: null, code: null }));
      return { close: () => { closed = true; } };
    }
    let t = s.turns.get(req.turnId);
    if (t && t.user !== user) {
      later(0, () => h.onFailure({ kind: 'http', status: 409, code: 'turn_conflict' }));
      return { close: () => { closed = true; } };
    }
    if (!t) {
      // begin: one saved message and one quota use per turn id
      s.quota.set(user, (s.quota.get(user) ?? 0) + 1);
      const userMsg = s.row(req.message);
      s.messages.push({ user, turnId: req.turnId, role: 'user', content: req.message });
      t = { id: req.turnId, user, conversation: req.conversationId ?? 'conv-1', status: 'reserved', userMsg, aiMsg: null, providerCalls: 0 };
      s.turns.set(req.turnId, t);
    }
    const turn = t;
    const meta = {
      conversation_id: turn.conversation,
      turn_id: turn.id,
      user_message: turn.userMsg,
      remaining_today: 20 - (s.quota.get(user) ?? 0),
      resets_at: null,
      context_used: null,
      suggestions: [],
    };
    const doneEvent = (replayed: boolean) => ({
      turn_id: turn.id,
      ai_message: turn.aiMsg,
      text: turn.aiMsg!.content,
      degraded: false,
      replayed,
      remaining_today: meta.remaining_today,
      resets_at: null,
    });

    if (turn.status === 'saved') {
      later(0, () => { h.onMeta(meta); h.onDone(doneEvent(true)); });
    } else if (turn.status === 'uncertain' && !req.retry) {
      later(0, () => { h.onMeta(meta); h.onTurn({ turn_id: turn.id, status: 'uncertain', can_retry: true }); });
    } else if (turn.status === 'generating') {
      // Another request is writing it: wait, never call the AI again.
      later(0, () => h.onMeta(meta));
      const wait: ReturnType<typeof setInterval> = setInterval(() => {
        if (closed) return clearInterval(wait);
        if (turn.status === 'saved') {
          clearInterval(wait);
          h.onDone(doneEvent(true));
        }
      }, 100);
    } else if (s.mode === 'timeout') {
      turn.status = 'generating';
      turn.providerCalls += 1;
      later(0, () => h.onMeta(meta));
      setTimeout(() => {
        turn.status = 'uncertain';
        if (!closed) h.onTurn({ turn_id: turn.id, status: 'uncertain', can_retry: true });
      }, 300);
    } else {
      s.generate(turn);
      if (s.mode === 'drop-before-meta') {
        later(0, () => h.onFailure({ kind: 'network', status: null, code: null }));
      } else {
        later(0, () => h.onMeta(meta));
        later(50, () => h.onDelta('We '));
        if (s.mode === 'drop-after-meta') {
          later(100, () => h.onFailure({ kind: 'network', status: null, code: null }));
        } else {
          const finish: ReturnType<typeof setInterval> = setInterval(() => {
            if (closed) return clearInterval(finish);
            if (turn.status === 'saved') {
              clearInterval(finish);
              h.onDone(doneEvent(false));
            }
          }, 50);
        }
      }
    }
    return { close: () => { closed = true; } };
  },
  fetchCoachTurn: async (token: string, turnId: string) => {
    if (!mockServer.online) return null;
    const t = mockServer.turns.get(turnId);
    // Another account's turn looks missing (RLS / ownership).
    if (!t || t.user !== token) return 'missing';
    return { view: mockServer.view(t) };
  },
  stopCoachTurn: async () => undefined,
}));

// ---- helpers --------------------------------------------------------------

function makeStore(user = 'user-a', chat: Partial<ChatState> = {}) {
  const root = combineReducers({ auth: authReducer, chat: chatReducer });
  return configureStore({
    reducer: withAccountReset(root) as typeof root,
    middleware: (getDefault) => getDefault().prepend(accountScopeMiddleware),
    preloadedState: {
      auth: {
        status: 'ready', userId: user, email: null, busy: false,
        error: null, pendingInviteCode: null,
      } as ReturnType<typeof authReducer>,
      chat: { ...chatReducer(undefined, { type: 'init' }), conversationId: 'conv-1', ...chat },
    },
  });
}
type Store = ReturnType<typeof makeStore>;

const RECONNECT_TOTAL_MS = RECONNECT_DELAYS_MS.reduce((a, b) => a + b, 0);

async function advance(ms: number) {
  for (let t = 0; t < ms; t += 100) await jest.advanceTimersByTimeAsync(100);
}

async function settle<T>(p: Promise<T>, ms = RECONNECT_TOTAL_MS + 2000): Promise<T> {
  await advance(ms);
  return p;
}

const pendingKey = (user: string) => `coach_pending_turn:${user}`;
const chatOf = (s: Store) => s.getState().chat;
const contents = (s: Store) => chatOf(s).messages.map((m) => `${m.role}:${m.content}`);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  mockServer.reset();
  mockKv.clear();
  mockUser = 'user-a';
});
afterEach(() => jest.useRealTimers());

// ---- the thin slice ---------------------------------------------------------

describe('send -> disconnect -> reopen -> recover', () => {
  it('shows the saved reply after the line drops mid-reply (same session)', async () => {
    mockServer.mode = 'drop-after-meta';
    const s = makeStore();
    const result = await settle(s.dispatch(sendChatMessage('Plan my workout')));
    expect(sendChatMessage.fulfilled.match(result)).toBe(true);
    expect(contents(s)).toEqual([
      'user:Plan my workout',
      'assistant:We can do "Plan my workout" together.',
    ]);
    expect(mockKv.has(pendingKey('user-a'))).toBe(false);
    const [turn] = [...mockServer.turns.values()];
    expect(turn.providerCalls).toBe(1);
    expect(mockServer.quota.get('user-a')).toBe(1);
  });

  it('recovers the saved reply after the app is closed and reopened', async () => {
    mockServer.mode = 'drop-after-meta';
    // The reply is saved only after the in-app reconnect gave up.
    mockServer.saveDelayMs = RECONNECT_TOTAL_MS + 10_000;
    mockServer.online = true;
    const first = makeStore();
    const sending = first.dispatch(sendChatMessage('Plan my workout'));
    await advance(200);
    mockServer.online = false; // the phone loses signal
    const failed = await settle(sending);
    expect(sendChatMessage.rejected.match(failed)).toBe(true);
    expect(chatOf(first).recovery?.status).toBe('waiting');
    // The turn id is kept on the phone.
    const stored = JSON.parse(mockKv.get(pendingKey('user-a'))!);
    expect(stored.text).toBe('Plan my workout');

    // Later: signal is back, the server has saved the reply, the app reopens.
    await advance(20_000);
    mockServer.online = true;
    const reopened = makeStore();
    await settle(reopened.dispatch(recoverCoachTurn()), 1000);
    expect(contents(reopened)).toEqual([
      'user:Plan my workout',
      'assistant:We can do "Plan my workout" together.',
    ]);
    expect(chatOf(reopened).recovery).toBeNull();
    expect(mockKv.has(pendingKey('user-a'))).toBe(false);
    // One message counted, one paid call, one reply saved.
    expect(mockServer.quota.get('user-a')).toBe(1);
    expect([...mockServer.turns.values()][0].providerCalls).toBe(1);
    expect(mockServer.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it('finds a message the server saved although no event arrived', async () => {
    mockServer.mode = 'drop-before-meta';
    const s = makeStore();
    const result = await settle(s.dispatch(sendChatMessage('hello coach')));
    expect(sendChatMessage.fulfilled.match(result)).toBe(true);
    expect(contents(s)).toEqual(['user:hello coach', 'assistant:We can do "hello coach" together.']);
  });
});

// ---- uncertain provider outcome --------------------------------------------

describe('provider timeout', () => {
  it('shows "Try again", never calls again by itself, and keeps the quota at one', async () => {
    mockServer.mode = 'timeout';
    const s = makeStore();
    await settle(s.dispatch(sendChatMessage('Help me pray on time')), 2000);
    expect(chatOf(s).recovery).toMatchObject({ status: 'uncertain', canRetry: true });
    expect(contents(s)).toEqual(['user:Help me pray on time']);

    // Restart: still uncertain, and recovery made no paid call.
    const reopened = makeStore();
    await settle(reopened.dispatch(recoverCoachTurn()), 1000);
    expect(chatOf(reopened).recovery?.status).toBe('uncertain');
    const turn = [...mockServer.turns.values()][0];
    expect(turn.providerCalls).toBe(1);

    // The person taps Try again: same turn, one more paid call, same quota.
    mockServer.mode = 'ok';
    const { turnId, text } = chatOf(reopened).recovery!;
    const retried = await settle(
      reopened.dispatch(sendChatMessage({ text, turnId, retry: true })), 2000,
    );
    expect(sendChatMessage.fulfilled.match(retried)).toBe(true);
    expect(turn.providerCalls).toBe(2);
    expect(mockServer.quota.get('user-a')).toBe(1);
    expect(contents(reopened)).toEqual([
      'user:Help me pray on time',
      'assistant:We can do "Help me pray on time" together.',
    ]);
    expect(mockKv.has(pendingKey('user-a'))).toBe(false);
  });

  it('a plain resend of an uncertain turn does not call the AI', async () => {
    mockServer.mode = 'timeout';
    const s = makeStore();
    await settle(s.dispatch(sendChatMessage('hi')), 2000);
    const { turnId } = chatOf(s).recovery!;
    mockServer.mode = 'ok';
    await settle(s.dispatch(sendChatMessage({ text: 'hi', turnId })), 2000);
    expect(mockServer.turns.get(turnId)!.providerCalls).toBe(1);
    expect(chatOf(s).recovery?.status).toBe('uncertain');
  });
});

// ---- rapid retry ---------------------------------------------------------------

describe('rapid retry', () => {
  it('three fast retries of the same failed message count and pay once', async () => {
    mockServer.mode = 'unreachable';
    const s = makeStore();
    await settle(s.dispatch(sendChatMessage('Family dinner idea?')));
    const { failedText, failedTurnId } = chatOf(s);
    expect(failedText).toBe('Family dinner idea?');
    expect(failedTurnId).toBeTruthy();

    mockServer.mode = 'ok';
    const arg = { text: failedText!, turnId: failedTurnId! };
    const runs = [
      s.dispatch(sendChatMessage(arg)),
      s.dispatch(sendChatMessage(arg)),
      s.dispatch(sendChatMessage(arg)),
    ];
    await advance(3000);
    await Promise.all(runs);
    expect(mockServer.quota.get('user-a')).toBe(1);
    expect(mockServer.turns.get(failedTurnId!)!.providerCalls).toBe(1);
    expect(mockServer.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    // One user bubble and one reply on screen, in order.
    expect(contents(s)).toEqual([
      'user:Family dinner idea?',
      'assistant:We can do "Family dinner idea?" together.',
    ]);
  });

  it('a message that never reached the server is offered again after a restart', async () => {
    mockServer.mode = 'unreachable';
    const s = makeStore();
    await settle(s.dispatch(sendChatMessage('Remember me')));
    const reopened = makeStore();
    await settle(reopened.dispatch(recoverCoachTurn()), 1000);
    expect(chatOf(reopened).failedText).toBe('Remember me');
    expect(chatOf(reopened).failedTurnId).toBe(chatOf(s).failedTurnId);
    expect(mockServer.quota.get('user-a') ?? 0).toBe(0);
  });
});

// ---- account switch mid-stream --------------------------------------------

describe('switching accounts mid-stream', () => {
  it("never shows A's reply to B, and B cannot recover A's turn", async () => {
    mockServer.saveDelayMs = 1500;
    const s = makeStore('user-a');
    const sending = s.dispatch(sendChatMessage('A private thought'));
    await advance(200);
    expect(chatOf(s).streaming?.text).toBe('We ');

    // A's session ends and B signs in while A's reply is still coming.
    s.dispatch(sessionExpired());
    mockUser = 'user-b';
    s.dispatch(login.fulfilled(
      { userId: 'user-b', email: null, onboardingCompleted: true },
      'login-1',
      { email: 'b@x.test', password: 'p' },
    ));
    await settle(sending, 3000);

    expect(chatOf(s).messages).toEqual([]);
    expect(chatOf(s).streaming).toBeNull();
    // A's reply was still saved, in A's account.
    const aTurn = [...mockServer.turns.values()][0];
    expect(aTurn.user).toBe('user-a');
    expect(aTurn.status).toBe('saved');
    // B has nothing to recover, and asking for A's turn id finds nothing.
    await settle(s.dispatch(recoverCoachTurn()), 500);
    expect(chatOf(s).messages).toEqual([]);
    expect(mockKv.has(pendingKey('user-b'))).toBe(false);
    const coachStream = jest.requireMock('../../../lib/coachStream') as {
      fetchCoachTurn: (t: string, id: string) => Promise<unknown>;
    };
    await expect(coachStream.fetchCoachTurn('user-b', aTurn.id)).resolves.toBe('missing');
  });

  it("B resending A's turn id is refused, not answered", async () => {
    const a = makeStore('user-a');
    await settle(a.dispatch(sendChatMessage('mine')), 2000);
    const aTurn = [...mockServer.turns.values()][0];
    mockUser = 'user-b';
    const b = makeStore('user-b');
    const res = await settle(b.dispatch(sendChatMessage({ text: 'mine', turnId: aTurn.id })), 2000);
    expect(sendChatMessage.rejected.match(res)).toBe(true);
    expect(chatOf(b).messages).toEqual([]);
    expect(mockServer.quota.get('user-b') ?? 0).toBe(0);
  });
});
