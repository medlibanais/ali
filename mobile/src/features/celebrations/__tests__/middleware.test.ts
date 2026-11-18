// The celebration middleware against a real store: what gets queued after
// gamification and quest updates, and what must never replay.

import { configureStore } from '@reduxjs/toolkit';
import type { Quest } from '../../../api/types';
import authReducer from '../../../store/slices/authSlice';
import celebrationsReducer from '../../../store/slices/celebrationsSlice';
import gamificationReducer, { fetchGamification } from '../../../store/slices/gamificationSlice';
import questsReducer, {
  completeQuest,
  fetchDailyQuests,
  questCompletedLocally,
  questRolledBack,
} from '../../../store/slices/questsSlice';
import {
  celebrationMiddleware,
  resetCelebrationMemory,
} from '../../../store/celebrationMiddleware';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../../lib/offlineQueue', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const DATE = '2026-11-15';
const quest = (id: string): Quest => ({
  quest_id: id,
  predefined_id: null,
  pillar: 'work',
  title: id,
  description: '',
  difficulty: 'medium',
  xp_reward: 20,
  is_ai_generated: false,
  why_this_matters: null,
  time_estimate_minutes: null,
  assigned_date: DATE,
  completed: false,
  completed_at: null,
  skipped: false,
  priority: 1,
});

function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      quests: questsReducer,
      gamification: gamificationReducer,
      celebrations: celebrationsReducer,
    },
    preloadedState: {
      auth: { ...authReducer(undefined, { type: 'init' }), userId: 'user-1' },
    },
    middleware: (d) => d().prepend(celebrationMiddleware.middleware),
  });
}
type TestStore = ReturnType<typeof makeStore>;

const gam = (level: number) =>
  fetchGamification.fulfilled(
    { level, total_xp: 0, xp_today: 0, current_streak: 0, best_streak: 0, achievements: [] },
    'req',
  );

const done = (id: string, xp = 20) =>
  completeQuest.fulfilled(
    {
      quest_id: id,
      xp_awarded: xp,
      total_xp: 0,
      level: 1,
      level_up: false,
      daily_score: 0,
      current_streak: 0,
      best_streak: 0,
      new_badges: [],
      completedAt: Date.now(),
      offline: false,
    },
    'req',
    quest(id),
  );

const flush = async (ms = 0) => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
  if (ms) await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const kinds = (store: TestStore) => store.getState().celebrations.queue.map((c) => c.kind);

beforeEach(async () => {
  resetCelebrationMemory();
  const storage = jest.requireMock('@react-native-async-storage/async-storage') as {
    clear: () => Promise<void>;
  };
  await storage.clear();
});

it('the first load is a baseline, then each new level celebrates once', async () => {
  const store = makeStore();
  store.dispatch(gam(10));
  await flush();
  expect(kinds(store)).toEqual([]);

  store.dispatch(gam(11));
  await flush();
  expect(store.getState().celebrations.queue[0]).toMatchObject({
    kind: 'levelUp',
    fromLevel: 10,
    toLevel: 11,
    fromTitle: 'Novice',
    toTitle: 'Disciplined Human',
  });

  // Undo drops the level, completing again brings it back: no replay.
  store.dispatch(gam(10));
  store.dispatch(gam(11));
  await flush();
  expect(kinds(store)).toEqual(['levelUp']);
});

it('does not replay after a relaunch (marks are persisted per user)', async () => {
  const store = makeStore();
  store.dispatch(gam(4));
  await flush();
  store.dispatch(gam(5));
  await flush();
  expect(kinds(store)).toEqual(['levelUp']);

  resetCelebrationMemory(); // app restart
  const relaunched = makeStore();
  relaunched.dispatch(gam(5));
  await flush();
  relaunched.dispatch(gam(5));
  await flush();
  expect(kinds(relaunched)).toEqual([]);
});

it('a completion sends XP particles; an optimistic rollback sends nothing', async () => {
  const store = makeStore();
  store.dispatch(fetchDailyQuests.fulfilled(
    { date: DATE, daily_life_score: 0, pillars: {}, quests: [quest('a'), quest('b'), quest('c'), quest('d')] },
    'req',
    undefined,
  ));
  store.dispatch(questCompletedLocally('a'));
  store.dispatch(questRolledBack('a'));
  await flush();
  expect(store.getState().celebrations.bursts).toHaveLength(0);

  store.dispatch(questCompletedLocally('a'));
  store.dispatch(done('a', 20));
  await flush();
  expect(store.getState().celebrations.bursts).toEqual([
    expect.objectContaining({ xp: 20, origin: null }),
  ]);
  expect(kinds(store)).toEqual([]);
});

it('Perfect Day shows once, after the last quest, not on a refetch', async () => {
  const store = makeStore();
  const ids = ['a', 'b', 'c'];
  store.dispatch(fetchDailyQuests.fulfilled(
    { date: DATE, daily_life_score: 0, pillars: {}, quests: ids.map(quest) },
    'req',
    undefined,
  ));
  for (const id of ids) {
    store.dispatch(questCompletedLocally(id));
    store.dispatch(done(id));
  }
  await flush(1900);
  expect(kinds(store)).toEqual(['perfectDay']);
  expect(store.getState().celebrations.queue[0]).toMatchObject({ questCount: 3 });

  // A silent refresh with everything done, or another completion event for
  // the same day, does not bring it back.
  store.dispatch(fetchDailyQuests.fulfilled(
    {
      date: DATE,
      daily_life_score: 100,
      pillars: {},
      quests: ids.map((id) => ({ ...quest(id), completed: true })),
    },
    'req',
    { silent: true },
  ));
  store.dispatch(done('c'));
  await flush(1900);
  expect(kinds(store)).toEqual(['perfectDay']);
});
