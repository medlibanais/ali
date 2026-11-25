// Account switching: sign out while a request for account A is still in
// flight, sign in as B, then let A's request answer. B must start with an
// empty store and only ever see B's own data.

import { combineReducers, configureStore } from '@reduxjs/toolkit';
import authReducer, { login, logout, sessionExpired } from '../slices/authSlice';
import userReducer, { fetchProfile } from '../slices/userSlice';
import gamificationReducer, { fetchGamification } from '../slices/gamificationSlice';
import chatReducer from '../slices/chatSlice';
import syncReducer, { pendingChanged } from '../slices/syncSlice';
import { accountScopeMiddleware, endsAccount, withAccountReset } from '../accountScope';

jest.mock('../../lib/notifications', () => ({
  unregisterDeviceForPush: () => Promise.resolve(),
}));

type Row = Record<string, unknown> | null;
interface Deferred {
  table: string;
  id: string;
  resolve: (row: Row) => void;
}
const mockReads: Deferred[] = [];
let mockCurrentUser: string | null = 'user-a';

function mockQuery(table: string) {
  let id = '';
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.order = () => b;
  b.eq = (_col: string, value: string) => {
    id = value;
    return b;
  };
  b.maybeSingle = () =>
    new Promise((resolve) => {
      mockReads.push({ table, id, resolve: (row) => resolve({ data: row, error: null }) });
    });
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return b;
}

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockQuery(table),
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: mockCurrentUser ? { id: mockCurrentUser } : null } }),
      signOut: () => {
        mockCurrentUser = null;
        return Promise.resolve({ error: null });
      },
      signInWithPassword: ({ email }: { email: string }) => {
        mockCurrentUser = email.startsWith('b') ? 'user-b' : 'user-a';
        return Promise.resolve({
          data: { user: { id: mockCurrentUser, email } },
          error: null,
        });
      },
    },
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Answer every pending read for `table` and `id` with `row`. */
async function answer(table: string, id: string, row: Row) {
  await flush();
  for (const read of mockReads.filter((r) => r.table === table && r.id === id)) {
    mockReads.splice(mockReads.indexOf(read), 1);
    read.resolve(row);
  }
  await flush();
}

function makeStore() {
  const root = combineReducers({
    auth: authReducer,
    user: userReducer,
    gamification: gamificationReducer,
    chat: chatReducer,
    sync: syncReducer,
  });
  return configureStore({
    reducer: withAccountReset(root) as typeof root,
    middleware: (getDefault) => getDefault().prepend(accountScopeMiddleware),
    preloadedState: {
      auth: {
        status: 'ready', userId: 'user-a', email: 'a@x.test', busy: false,
        error: null, pendingInviteCode: null,
      },
    },
  });
}

const profileRow = (name: string) => ({ first_name: name, username: name.toLowerCase(), timezone: 'UTC' });

describe('account switching', () => {
  beforeEach(() => {
    mockReads.length = 0;
    mockCurrentUser = 'user-a';
  });

  it('drops account A responses that answer after sign-out and starts B clean', async () => {
    const store = makeStore();

    // A's data is loaded...
    const first = store.dispatch(fetchProfile());
    await answer('profiles', 'user-a', profileRow('Alice'));
    await answer('user_goals', 'user-a', null);
    await first;
    store.dispatch(pendingChanged(3));
    expect(store.getState().user.profile?.first_name).toBe('Alice');

    // ...then a slow request for A is in flight when A signs out.
    const slowProfile = store.dispatch(fetchProfile());
    const slowXp = store.dispatch(fetchGamification());
    await store.dispatch(logout());
    expect(store.getState().auth.userId).toBeNull();
    expect(store.getState().user.profile).toBeNull();
    expect(store.getState().sync.pending).toBe(0);

    // B signs in (the onboarding check reads B's profile).
    const signIn = store.dispatch(login({ email: 'b@x.test', password: 'Secret#123' }));
    await answer('profiles', 'user-b', { onboarding_completed: true });
    await signIn;
    expect(store.getState().auth.userId).toBe('user-b');

    // A's slow answers arrive now. They must not reach B's store.
    await answer('profiles', 'user-a', profileRow('Alice'));
    await answer('user_goals', 'user-a', null);
    await answer('gamification', 'user-a', { level: 9, total_xp: 9000, xp_today: 50, current_streak: 12, best_streak: 12 });
    await Promise.all([slowProfile, slowXp]);
    expect(store.getState().user.profile).toBeNull();
    expect(store.getState().gamification.totalXp).toBe(0);
    expect(store.getState().gamification.currentStreak).toBe(0);

    // B's own data loads normally.
    const mine = store.dispatch(fetchProfile());
    await answer('profiles', 'user-b', profileRow('Badr'));
    await answer('user_goals', 'user-b', null);
    await mine;
    expect(store.getState().user.profile?.first_name).toBe('Badr');
  });

  it('clears account data when the session expires', async () => {
    const store = makeStore();
    const load = store.dispatch(fetchProfile());
    await answer('profiles', 'user-a', profileRow('Alice'));
    await answer('user_goals', 'user-a', null);
    await load;
    store.dispatch(sessionExpired());
    expect(store.getState().user.profile).toBeNull();
    expect(store.getState().auth.status).toBe('unauthenticated');
  });

  it('treats a sign-in as another account as the end of the current one', () => {
    const signedInB = login.fulfilled(
      { userId: 'user-b', email: null, onboardingCompleted: true }, 'r1',
      { email: 'b', password: 'p' },
    );
    expect(endsAccount(signedInB, 'user-a')).toBe(true);
    expect(endsAccount(signedInB, 'user-b')).toBe(false);
    expect(endsAccount(signedInB, null)).toBe(false);
  });
});
