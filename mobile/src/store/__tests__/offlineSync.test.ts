// End-to-end of the offline flow against a fake Supabase: complete while
// offline (optimistic UI + queue), reconnect, ordered sync, server XP wins.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import type { Quest } from '../../api/types';
import authReducer from '../slices/authSlice';
import gamificationReducer from '../slices/gamificationSlice';
import questsReducer, { completeQuest, fetchDailyQuests, undoQuest } from '../slices/questsSlice';
import syncReducer from '../slices/syncSlice';
import { syncOfflineCompletions } from '../offlineSync';
import { readCompletionQueue } from '../../lib/offlineQueue';
import { isOnline, reportOffline, reportOnline, resetConnectivityForTests } from '../../lib/connectivity';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
const mockCalls: { name: string; params: Record<string, unknown> }[] = [];
let mockRpcImpl: (name: string, params: Record<string, unknown>) => Promise<RpcResult>;
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
    functions: { invoke: () => new Promise(() => undefined) },
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
    preloadedState: {
      auth: {
        status: 'signedIn' as never, userId: 'u1', email: null, busy: false,
        error: null, pendingInviteCode: null,
      },
    },
  });
}

const offlineRpc = () => Promise.reject(new TypeError('Network request failed'));

beforeEach(async () => {
  await AsyncStorage.clear();
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
  expect(await readCompletionQueue('u1')).toEqual([]);
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
  expect((await readCompletionQueue('u1')).map((i) => i.questId)).toEqual(['c', 'd']);
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
  expect(await readCompletionQueue('u1')).toEqual([]);
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
  await AsyncStorage.setItem(
    'prayerlock.dailyQuests.v1',
    JSON.stringify({
      date: (() => {
        const d = new Date();
        return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
      })(),
      daily_life_score: 0,
      pillars: {},
      quests: [quest('a'), quest('b')],
    }),
  );
  reportOffline();
  await store.dispatch(completeQuest(quest('a')));
  mockRpcImpl = offlineRpc;
  await store.dispatch(fetchDailyQuests());
  const qs = store.getState().quests.quests;
  expect(qs.find((q) => q.quest_id === 'a')?.completed).toBe(true);
  expect(qs.find((q) => q.quest_id === 'b')?.completed).toBe(false);
  expect(store.getState().quests.pillarScores.health).toBe(50);
});
