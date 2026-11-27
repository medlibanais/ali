// Returning-user startup and partial onboarding.
//   * A failed profile read on launch is not "unfinished onboarding".
//   * Onboarding is marked complete only after profile and goals are saved,
//     and a retry after any failed step finishes the job.

import { configureStore } from '@reduxjs/toolkit';
import authReducer, { restoreSession } from '../authSlice';
import userReducer, { submitOnboarding } from '../userSlice';
import { rememberOnboardingCompleted } from '../../../lib/onboardingCache';
import { kvStore } from '../../../lib/kvStore';

jest.mock('../../../lib/notifications', () => ({
  unregisterDeviceForPush: () => Promise.resolve(),
}));

type Result = { data: unknown; error: { message: string; code?: string } | null };
const mockWrites: { table: string; op: string; values: Record<string, unknown> }[] = [];
let mockProfileRead: () => Promise<Result>;
let mockFailWrite: ((table: string, values: Record<string, unknown>) => boolean) | null = null;
const mockUser = { id: 'user-r' };

jest.mock('../../../lib/supabase', () => {
  const query = (table: string) => {
    let op = 'select';
    let values: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    const settle = (): Promise<Result> => {
      if (op === 'select') return mockProfileRead();
      mockWrites.push({ table, op, values });
      if (mockFailWrite?.(table, values)) {
        return Promise.resolve({ data: null, error: { message: 'Network request failed' } });
      }
      return Promise.resolve({ data: [{ id: mockUser.id, user_id: mockUser.id }], error: null });
    };
    b.select = () => b;
    b.eq = () => b;
    b.update = (v: Record<string, unknown>) => {
      op = 'update';
      values = v;
      return b;
    };
    b.upsert = (v: Record<string, unknown>) => {
      op = 'upsert';
      values = v;
      return b;
    };
    b.maybeSingle = settle;
    b.then = (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => settle().then(res, rej);
    return b;
  };
  return {
    supabase: {
      from: query,
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: mockUser } } }),
        getUser: () => Promise.resolve({ data: { user: mockUser } }),
      },
    },
  };
});

function makeStore() {
  return configureStore({ reducer: { auth: authReducer, user: userReducer } });
}

const offline = () => Promise.reject(new TypeError('Network request failed'));

const answers = {
  username: 'returning_user',
  first_name: 'Rim',
  timezone: 'Africa/Tunis',
  goals: { health_goal: 'Walk daily' },
} as unknown as Parameters<typeof submitOnboarding>[0];

beforeEach(() => {
  mockWrites.length = 0;
  mockFailWrite = null;
  kvStore.delete(`grow.onboarded.${mockUser.id}`);
});

describe('cold start with a saved session', () => {
  it('opens Today offline for a returning user who finished onboarding here', async () => {
    rememberOnboardingCompleted(mockUser.id);
    mockProfileRead = offline;
    const store = makeStore();
    await store.dispatch(restoreSession());
    expect(store.getState().auth.status).toBe('ready');
  });

  it('shows a retry screen, not onboarding, when the profile cannot be read', async () => {
    mockProfileRead = offline;
    const store = makeStore();
    await store.dispatch(restoreSession());
    expect(store.getState().auth.status).toBe('profileUnavailable');

    // Retry once the network is back.
    mockProfileRead = () => Promise.resolve({ data: { onboarding_completed: true }, error: null });
    await store.dispatch(restoreSession());
    expect(store.getState().auth.status).toBe('ready');
  });

  it('treats a server error like a network error', async () => {
    mockProfileRead = () => Promise.resolve({ data: null, error: { message: 'JWT expired' } });
    const store = makeStore();
    await store.dispatch(restoreSession());
    expect(store.getState().auth.status).toBe('profileUnavailable');
  });

  it('still sends a new account to onboarding', async () => {
    mockProfileRead = () => Promise.resolve({ data: { onboarding_completed: false }, error: null });
    const store = makeStore();
    await store.dispatch(restoreSession());
    expect(store.getState().auth.status).toBe('needsOnboarding');
  });
});

describe('saving onboarding', () => {
  const completedWrite = () =>
    mockWrites.find((w) => w.table === 'profiles' && w.values.onboarding_completed === true);

  it('marks onboarding complete last, after profile and goals', async () => {
    const store = makeStore();
    const result = await store.dispatch(submitOnboarding(answers));
    expect(submitOnboarding.fulfilled.match(result)).toBe(true);
    expect(mockWrites.map((w) => `${w.table}:${w.op}`)).toEqual([
      'profiles:update',
      'user_goals:upsert',
      'profiles:update',
    ]);
    expect(mockWrites[0].values.onboarding_completed).toBeUndefined();
    expect(completedWrite()).toBe(mockWrites[2]);
  });

  it('does not mark onboarding complete when the goals fail, and a retry finishes', async () => {
    const store = makeStore();
    mockFailWrite = (table) => table === 'user_goals';
    const failed = await store.dispatch(submitOnboarding(answers));
    expect(submitOnboarding.rejected.match(failed)).toBe(true);
    expect(completedWrite()).toBeUndefined();

    mockFailWrite = null;
    mockWrites.length = 0;
    const retried = await store.dispatch(submitOnboarding(answers));
    expect(submitOnboarding.fulfilled.match(retried)).toBe(true);
    expect(completedWrite()).toBeDefined();
    expect(kvStore.getString(`grow.onboarded.${mockUser.id}`)).toBe('1');
  });
});
