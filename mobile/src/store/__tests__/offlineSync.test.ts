// End-to-end of the offline flow against a fake Supabase: complete while
// offline (optimistic UI + queue), reconnect, ordered sync, server XP wins.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import type { Quest } from '../../api/types';
import authReducer, { sessionExpired } from '../slices/authSlice';
import gamificationReducer from '../slices/gamificationSlice';
import questsReducer, { completeQuest, fetchDailyQuests, undoQuest } from '../slices/questsSlice';
import syncReducer from '../slices/syncSlice';
import { completedElsewhere, setFlushPaceForTests, syncOfflineCompletions } from '../offlineSync';
import { syncMachineMiddleware } from '../syncMachineMiddleware';
import { QUEUE_KEY, localDateOf, readOfflineQueue, saveQuestsCache } from '../../lib/offlineQueue';
import { kvStore } from '../../lib/kvStore';
import { isOnline, reportOffline, reportOnline, resetConnectivityForTests } from '../../lib/connectivity';

jest.mock('expo-background-fetch', () => ({}));
jest.mock('expo-task-manager', () => ({ defineTask: () => undefined }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
const mockCalls: { name: string; params: Record<string, unknown> }[] = [];
let mockRpcImpl: (name: string, params: Record<string, unknown>) => Promise<RpcResult>;
const mockInvoke = jest.fn<Promise<RpcResult>, []>();
let mockServerGam = { level: 1, total_xp: 0, xp_today: 0, xp_today_date: null as string | null, current_streak: 0, best_streak: 0 };

function mockBuilder(result: unknown) {
  const b: Record<string, unknown> = {};
  ['select', 'eq', 'order'].forEach((m) => {
    b[m] = () => b;
  });
  b.maybeSingle = () => Promise.resolve({ data: result, error: null });
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return b;
}

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, params: Record<string, unknown>) => {
      mockCalls.push({ name, params });
      const p = mockRpcImpl(name, params);
      return { abortSignal: () => p, then: p.then.bind(p) };
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => mockBuilder(table === 'gamification' ? mockServerGam : null),
    functions: { invoke: () => mockInvoke() },
  },
}));

function quest(id: string, xp = 10): Quest {
  return {
    quest_id: id, predefined_id: null, pillar: 'health', title: `Quest ${id}`,
    description: '', difficulty: 'easy', xp_reward: xp, is_ai_generated: false,
    why_this_matters: null, time_estimate_minutes: null, assigned_date: '2026-11-15',
    completed: false, completed_at: null, skipped: false, priority: 1,
  };
}

function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      gamification: gamificationReducer,
      quests: questsReducer,
      sync: syncReducer,
    },
    middleware: (getDefault) => getDefault().concat(syncMachineMiddleware),
    preloadedState: {
      auth: {
        status: 'signedIn' as never, userId: 'u1', email: null, busy: false,
        error: null, pendingInviteCode: null,
      },
    },
  });
}

const offlineRpc = () => Promise.reject(new TypeError('Network request failed'));

setFlushPaceForTests(0);

beforeEach(async () => {
  await AsyncStorage.clear();
  kvStore.delete(QUEUE_KEY);
  kvStore.delete('prayerlock.dailyQuests.v1');
  kvStore.delete('prayerlock.dailyQuests.v2.u1');
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: { results: { u1: 'fallback:unavailable' } }, error: null });
  mockCalls.length = 0;
  resetConnectivityForTests();
  mockServerGam = { level: 1, total_xp: 0, xp_today: 0, xp_today_date: null, current_streak: 0, best_streak: 0 };
});

it('queues offline completions with optimistic XP, then syncs them in order', async () => {
  const store = makeStore();
  mockRpcImpl = offlineRpc;

  const r1 = await store.dispatch(completeQuest(quest('a', 10)));
  expect(completeQuest.fulfilled.match(r1) && r1.payload.offline).toBe(true);
  // Known offline now: the next ones never hit the network.
  mockCalls.length = 0;
  await store.dispatch(completeQuest(quest('b', 50)));
  await store.dispatch(completeQuest(quest('c', 20)));
  expect(mockCalls).toHaveLength(0);

  const s = store.getState();
  expect(isOnline()).toBe(false);
  expect(s.sync.pending).toBe(3);
  expect(s.gamification.pendingXp).toBeGreaterThanOrEqual(80);
  expect(s.gamification.totalXp).toBe(s.gamification.pendingXp);

  // Back online; the server gives its own (authoritative) numbers.
  reportOnline();
  mockRpcImpl = (name, params) => {
    if (name === 'sync_quest_completion') {
      mockServerGam.total_xp += 30;
      return Promise.resolve({ data: { quest_id: params.p_quest_id, duplicate: false }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  const res = await store.dispatch(syncOfflineCompletions());
  expect(syncOfflineCompletions.fulfilled.match(res) && res.payload.synced).toBe(3);

  const syncCalls = mockCalls.filter((c) => c.name === 'sync_quest_completion');
  expect(syncCalls.map((c) => c.params.p_quest_id)).toEqual(['a', 'b', 'c']);
  expect(new Set(syncCalls.map((c) => c.params.p_client_id)).size).toBe(3);
  const times = syncCalls.map((c) => String(c.params.p_completed_at));
  expect([...times].sort()).toEqual(times);

  const after = store.getState();
  expect(after.sync.pending).toBe(0);
  expect(after.gamification.pendingXp).toBe(0);
  expect(after.gamification.totalXp).toBe(90); // server value, not the estimate
  expect(await readOfflineQueue('u1')).toEqual([]);
});

it('drops refused items, counts duplicates once, and stops on a network error', async () => {
  const store = makeStore();
  reportOffline();
  for (const id of ['a', 'b', 'c', 'd']) {
    await store.dispatch(completeQuest(quest(id)));
  }
  reportOnline();
  mockRpcImpl = (name, params) => {
    // The connection drops at c: everything after it fails too.
    if (name !== 'sync_quest_completion') return Promise.reject(new TypeError('Network request failed'));
    switch (params.p_quest_id) {
      case 'a': return Promise.resolve({ data: { duplicate: true }, error: null });
      case 'b': return Promise.resolve({ data: null, error: { message: 'daily_completion_limit' } });
      case 'c': return Promise.reject(new TypeError('Network request failed'));
      default: return Promise.resolve({ data: {}, error: null });
    }
  };
  const res = await store.dispatch(syncOfflineCompletions());
  if (!syncOfflineCompletions.fulfilled.match(res)) throw new Error('sync failed');
  expect(res.payload.duplicates).toBe(1);
  expect(res.payload.rejected.map((r) => r.questId)).toEqual(['b']);
  expect(res.payload.stoppedBy).toBe('offline');
  // c and d wait, still in order.
  expect((await readOfflineQueue('u1')).map((i) => i.questId)).toEqual(['c', 'd']);
  expect(isOnline()).toBe(false);
  expect(store.getState().sync.pending).toBe(2);
});

it('falls back to complete_quest when the database has no sync RPC yet', async () => {
  const store = makeStore();
  reportOffline();
  await store.dispatch(completeQuest(quest('a')));
  reportOnline();
  mockRpcImpl = (name) =>
    Promise.resolve(
      name === 'sync_quest_completion'
        ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
        : { data: {}, error: null },
    );
  await store.dispatch(syncOfflineCompletions());
  expect(mockCalls.map((c) => c.name)).toContain('complete_quest');
  expect(await readOfflineQueue('u1')).toEqual([]);
});

it('undo of an offline completion just leaves the queue', async () => {
  const store = makeStore();
  reportOffline();
  await store.dispatch(completeQuest(quest('a')));
  expect(store.getState().sync.pending).toBe(1);
  mockCalls.length = 0;
  await store.dispatch(undoQuest('a'));
  expect(mockCalls).toHaveLength(0);
  expect(store.getState().sync.pending).toBe(0);
  expect(store.getState().gamification.totalXp).toBe(0);
});

it('keeps queued quests ticked when the day reloads offline', async () => {
  const store = makeStore();
  saveQuestsCache('u1', {
    date: localDateOf(new Date()),
    daily_life_score: 0,
    pillars: {},
    quests: [quest('a'), quest('b')],
  });
  reportOffline();
  await store.dispatch(completeQuest(quest('a')));
  mockRpcImpl = offlineRpc;
  await store.dispatch(fetchDailyQuests());
  const qs = store.getState().quests.quests;
  expect(qs.find((q) => q.quest_id === 'a')?.completed).toBe(true);
  expect(qs.find((q) => q.quest_id === 'b')?.completed).toBe(false);
  expect(store.getState().quests.pillarScores.health).toBe(50);
});

it('ignores old unowned and other accounts’ offline quest caches', async () => {
  const store = makeStore();
  const day = {
    date: localDateOf(new Date()),
    daily_life_score: 0,
    pillars: {},
    quests: [quest('private')],
  };
  kvStore.set('prayerlock.dailyQuests.v1', JSON.stringify(day));
  saveQuestsCache('another-user', day);
  mockRpcImpl = offlineRpc;

  const result = await store.dispatch(fetchDailyQuests());
  expect(fetchDailyQuests.rejected.match(result)).toBe(true);
  expect(store.getState().quests.quests).toEqual([]);
});

it('ignores a daily quest response that finishes after signing out', async () => {
  const store = makeStore();
  let finish: (result: RpcResult) => void = () => undefined;
  mockRpcImpl = () => new Promise<RpcResult>((resolve) => { finish = resolve; });
  const load = store.dispatch(fetchDailyQuests());

  store.dispatch(sessionExpired());
  finish({ data: [], error: null });
  await load;

  expect(store.getState().quests.date).toBeNull();
  expect(mockInvoke).not.toHaveBeenCalled();
});

it('shares one generation attempt across concurrent daily loads and stops on fallback', async () => {
  const store = makeStore();
  mockRpcImpl = () => Promise.resolve({ data: [], error: null });
  await Promise.all([store.dispatch(fetchDailyQuests()), store.dispatch(fetchDailyQuests())]);

  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockCalls.filter((call) => call.name === 'assign_daily_quests')).toHaveLength(2);
});

it('refreshes once after generation even when the refreshed list has no AI quests', async () => {
  const store = makeStore();
  mockRpcImpl = () => Promise.resolve({ data: [], error: null });
  mockInvoke.mockResolvedValue({ data: { results: { u1: 'ok:2:balanced' } }, error: null });

  await store.dispatch(fetchDailyQuests());
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(mockCalls.filter((call) => call.name === 'assign_daily_quests')).toHaveLength(2);
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(store.getState().quests.refreshing).toBe(false);
});

it('drives the XState machine: OptimisticPending, Syncing, then Synced', async () => {
  const store = makeStore();
  reportOffline();
  await store.dispatch(completeQuest(quest('a')));
  await store.dispatch(completeQuest(quest('b')));
  expect(store.getState().sync.machine).toMatchObject({ state: 'Syncing', pending: 2 });

  reportOnline();
  mockRpcImpl = () => Promise.resolve({ data: {}, error: null });
  await store.dispatch(syncOfflineCompletions());
  expect(store.getState().sync.machine.state).toBe('Synced');
});

it('server wins on a conflict: notice, no doubled XP, quest stays as the server has it', async () => {
  const store = makeStore();
  reportOffline();
  await store.dispatch(completeQuest(quest('a', 50)));
  reportOnline();
  mockServerGam.total_xp = 55; // the other device's completion
  mockRpcImpl = (name) =>
    Promise.resolve(
      name === 'sync_quest_completion'
        ? { data: { duplicate: true, conflict: true }, error: null }
        : { data: null, error: null },
    );
  const res = await store.dispatch(syncOfflineCompletions());
  if (!syncOfflineCompletions.fulfilled.match(res)) throw new Error('sync failed');
  expect(res.payload.conflicts).toHaveLength(1);
  const s = store.getState();
  expect(s.sync.machine).toMatchObject({ state: 'Error', errorKind: 'conflict' });
  expect(s.sync.machine.errorMessage).toBe(completedElsewhere());
  expect(s.gamification.totalXp).toBe(55); // not 55 + our 55
});

it('a lost online answer is not reported as a conflict', async () => {
  const store = makeStore();
  mockRpcImpl = offlineRpc; // the online call "fails" (it did reach the server)
  await store.dispatch(completeQuest(quest('a')));
  reportOnline();
  mockRpcImpl = (name) =>
    Promise.resolve(
      name === 'sync_quest_completion'
        ? { data: { duplicate: true, conflict: true }, error: null }
        : { data: null, error: null },
    );
  const res = await store.dispatch(syncOfflineCompletions());
  if (!syncOfflineCompletions.fulfilled.match(res)) throw new Error('sync failed');
  expect(res.payload.conflicts).toHaveLength(0);
  expect(res.payload.duplicates).toBe(1);
});

it('keeps exactly the failed items when 3 of 5 sync', async () => {
  const store = makeStore();
  reportOffline();
  for (const id of ['a', 'b', 'c', 'd', 'e']) await store.dispatch(completeQuest(quest(id)));
  reportOnline();
  mockRpcImpl = (name, params) => {
    if (name !== 'sync_quest_completion') return Promise.resolve({ data: null, error: null });
    return params.p_quest_id === 'd'
      ? Promise.resolve({ data: null, error: { message: 'internal server error' } })
      : Promise.resolve({ data: {}, error: null });
  };
  const res = await store.dispatch(syncOfflineCompletions());
  if (!syncOfflineCompletions.fulfilled.match(res)) throw new Error('sync failed');
  expect(res.payload.synced).toBe(3);
  expect(res.payload.remaining).toBe(2);
  const left = await readOfflineQueue('u1');
  expect(left.map((i) => i.questId)).toEqual(['d', 'e']);
  expect(left[0].attempts).toBe(1);
  expect(store.getState().sync.machine).toMatchObject({ state: 'Error', errorKind: 'failed', pending: 2 });
});

it('queues an undo made offline and replays complete then undo in order', async () => {
  const store = makeStore();
  // Completed online first (the server has it).
  mockRpcImpl = (name) =>
    Promise.resolve(
      name === 'complete_quest'
        ? { data: { quest_id: 'a', xp_awarded: 15, total_xp: 15, level: 1, level_up: false, daily_score: 0, current_streak: 1, best_streak: 1, new_badges: [] }, error: null }
        : { data: null, error: null },
    );
  await store.dispatch(completeQuest(quest('a')));
  reportOffline();
  await store.dispatch(completeQuest(quest('b')));
  mockCalls.length = 0;
  await store.dispatch(undoQuest('a'));
  expect(mockCalls).toHaveLength(0);
  const q = await readOfflineQueue('u1');
  expect(q.map((i) => `${i.kind}:${i.questId}`)).toEqual(['complete:b', 'undo:a']);

  reportOnline();
  mockRpcImpl = () => Promise.resolve({ data: {}, error: null });
  await store.dispatch(syncOfflineCompletions());
  expect(
    mockCalls.filter((c) => c.name.startsWith('sync_')).map((c) => `${c.name}:${c.params.p_quest_id}`),
  ).toEqual(['sync_quest_completion:b', 'sync_quest_undo:a']);
});

it('tags the post-sync XP refresh so reward animations do not replay', async () => {
  const seen: unknown[] = [];
  const store = configureStore({
    reducer: { auth: authReducer, gamification: gamificationReducer, quests: questsReducer, sync: syncReducer },
    middleware: (getDefault) =>
      getDefault().concat(() => (next) => (action) => {
        const a = action as { type: string; meta?: { arg?: unknown } };
        if (a.type === 'gamification/fetch/fulfilled') seen.push(a.meta?.arg);
        return next(action);
      }),
    preloadedState: {
      auth: { status: 'signedIn' as never, userId: 'u1', email: null, busy: false, error: null, pendingInviteCode: null },
    },
  });
  reportOffline();
  await store.dispatch(completeQuest(quest('a')));
  reportOnline();
  mockRpcImpl = () => Promise.resolve({ data: {}, error: null });
  await store.dispatch(syncOfflineCompletions());
  expect(seen).toContainEqual({ reason: 'sync' });
});

it('sends each queued action once, in order, when two flushes start together', async () => {
  // Foreground reconnect and the background task fire at the same moment.
  const store = makeStore();
  mockRpcImpl = (name) =>
    Promise.resolve(
      name === 'complete_quest'
        ? { data: { quest_id: 'a', xp_awarded: 15, total_xp: 15, level: 1, level_up: false, daily_score: 0, current_streak: 1, best_streak: 1, new_badges: [] }, error: null }
        : { data: null, error: null },
    );
  reportOffline();
  await store.dispatch(completeQuest(quest('b')));
  await store.dispatch(completeQuest(quest('c')));
  expect((await readOfflineQueue('u1')).map((i) => i.questId)).toEqual(['b', 'c']);

  reportOnline();
  mockCalls.length = 0;
  // Slow server answers, so both flushes overlap.
  mockRpcImpl = () => new Promise((r) => setTimeout(() => r({ data: {}, error: null }), 20));
  const { flushOfflineQueue } = jest.requireActual<typeof import('../offlineSync')>('../offlineSync');
  const [one, two] = await Promise.all([
    store.dispatch(syncOfflineCompletions()),
    flushOfflineQueue('u1'),
  ]);
  const sent = mockCalls.filter((c) => c.name.startsWith('sync_')).map((c) => `${c.name}:${c.params.p_quest_id}`);
  // Each queued action goes to the server exactly once, in order.
  expect(sent).toEqual(['sync_quest_completion:b', 'sync_quest_completion:c']);
  expect(syncOfflineCompletions.fulfilled.match(one)).toBe(true);
  expect(two.synced + (syncOfflineCompletions.fulfilled.match(one) ? one.payload.synced : 0)).toBe(2);
  expect(await readOfflineQueue('u1')).toEqual([]);
});
