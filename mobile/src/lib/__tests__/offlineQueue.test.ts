import { newClientId } from '../clientId';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyQuestsResponse, Quest } from '../../api/types';
import {
  applyQueuedActions,
  enqueueUndo,
  markAttempt,
  QUEUE_KEY,
  cancelQueuedQuest,
  enqueueCompletion,
  estimateXp,
  isMissingSyncRpc,
  isOfflineError,
  pendingXpOf,
  permanentSyncReason,
  readOfflineQueue,
  removeQueued,
} from '../offlineQueue';
import { kvStore } from '../kvStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const base = {
  userId: 'u1',
  xpEstimate: 15,
  title: 'Walk',
  localDate: '2026-11-15',
};

function quest(id: string, pillar: Quest['pillar'], extra: Partial<Quest> = {}): Quest {
  return {
    quest_id: id,
    predefined_id: null,
    pillar,
    title: id,
    description: '',
    difficulty: 'easy',
    xp_reward: 10,
    is_ai_generated: false,
    why_this_matters: null,
    time_estimate_minutes: null,
    assigned_date: '2026-11-15',
    completed: false,
    completed_at: null,
    skipped: false,
    priority: 1,
    ...extra,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  kvStore.delete(QUEUE_KEY);
});

describe('completion queue', () => {
  it('keeps completions in the order they happened, with unique ids', async () => {
    await enqueueCompletion({ ...base, questId: 'a', at: '2026-11-15T10:00:00.000Z' });
    await enqueueCompletion({ ...base, questId: 'b', at: '2026-11-15T10:05:00.000Z' });
    await enqueueCompletion({ ...base, questId: 'c', at: '2026-11-15T10:01:00.000Z' });
    const q = await readOfflineQueue('u1');
    expect(q.map((i) => i.questId)).toEqual(['a', 'b', 'c']);
    expect(q.map((i) => i.seq)).toEqual([1, 2, 3]);
    expect(new Set(q.map((i) => i.clientId)).size).toBe(3);
  });

  it('does not queue the same quest twice', async () => {
    const first = await enqueueCompletion({ ...base, questId: 'a', at: 'x' });
    const again = await enqueueCompletion({ ...base, questId: 'a', at: 'y' });
    expect(again.clientId).toBe(first.clientId);
    expect(await readOfflineQueue('u1')).toHaveLength(1);
  });

  it('loses nothing when writes race', async () => {
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((id) =>
        enqueueCompletion({ ...base, questId: id, at: id }),
      ),
    );
    expect((await readOfflineQueue('u1')).map((i) => i.questId)).toEqual([
      'a', 'b', 'c', 'd', 'e',
    ]);
  });

  it('separates accounts', async () => {
    await enqueueCompletion({ ...base, questId: 'a', at: 'x' });
    await enqueueCompletion({ ...base, userId: 'u2', questId: 'b', at: 'y' });
    expect((await readOfflineQueue('u1')).map((i) => i.questId)).toEqual(['a']);
    expect((await readOfflineQueue('u2')).map((i) => i.questId)).toEqual(['b']);
  });

  it('cancels and removes items', async () => {
    const a = await enqueueCompletion({ ...base, questId: 'a', at: 'x' });
    await enqueueCompletion({ ...base, questId: 'b', at: 'y' });
    expect((await cancelQueuedQuest('b', 'u1'))?.questId).toBe('b');
    expect(await cancelQueuedQuest('b', 'u1')).toBeNull();
    await removeQueued(a.clientId);
    expect(await readOfflineQueue('u1')).toEqual([]);
  });

  it('queues undos after completions and replays both in order', async () => {
    await enqueueCompletion({ ...base, questId: 'a', at: '2026-11-15T10:00:00.000Z' });
    await enqueueUndo({ ...base, questId: 'b', at: '2026-11-15T10:01:00.000Z', xpRefund: 20 });
    await enqueueCompletion({ ...base, questId: 'b', at: '2026-11-15T10:02:00.000Z' });
    const q = await readOfflineQueue('u1');
    expect(q.map((i) => `${i.kind}:${i.questId}`)).toEqual(['complete:a', 'undo:b', 'complete:b']);
  });

  it('lives in MMKV under offline_queue, so it survives a restart', async () => {
    await enqueueCompletion({ ...base, questId: 'a', at: 'x' });
    const raw = kvStore.getString(QUEUE_KEY) ?? null;
    expect(QUEUE_KEY).toMatch(/offline_queue/);
    expect(JSON.parse(raw ?? '[]')).toHaveLength(1);
  });

  it('keeps a failed item with its attempt count', async () => {
    const a = await enqueueCompletion({ ...base, questId: 'a', at: 'x' });
    await markAttempt(a.clientId, 'server error');
    const [item] = await readOfflineQueue('u1');
    expect(item.attempts).toBe(1);
    expect(item.lastError).toBe('server error');
  });

  it('carries over the old v1 queue', async () => {
    await AsyncStorage.setItem(
      'prayerlock.completionQueue.v1',
      JSON.stringify([{ questId: 'old', queuedAt: Date.UTC(2026, 10, 14, 9) }]),
    );
    const q = await readOfflineQueue('u1');
    expect(q).toHaveLength(1);
    expect(q[0].questId).toBe('old');
    expect(q[0].at).toBe('2026-11-14T09:00:00.000Z');
    expect(q[0].kind).toBe('complete');
    expect(await AsyncStorage.getItem('prayerlock.completionQueue.v1')).toBeNull();
  });
});

describe('optimistic helpers', () => {
  it('estimates XP with the before-6-PM bonus and the daily cap', () => {
    expect(estimateXp({ xp_reward: 20 }, new Date(2026, 10, 15, 9), 0)).toBe(25);
    expect(estimateXp({ xp_reward: 20 }, new Date(2026, 10, 15, 19), 0)).toBe(20);
    expect(estimateXp({ xp_reward: 50 }, new Date(2026, 10, 15, 9), 480)).toBe(20);
    expect(estimateXp({ xp_reward: 50 }, new Date(2026, 10, 15, 9), 500)).toBe(0);
  });

  it('marks queued quests completed and rescores the day', () => {
    const day: DailyQuestsResponse = {
      date: '2026-11-15',
      daily_life_score: 0,
      pillars: { health: 0, work: 0 },
      quests: [quest('h1', 'health'), quest('h2', 'health'), quest('w1', 'work')],
    };
    const out = applyQueuedActions(day, [
      { ...base, kind: 'complete', questId: 'h1', clientId: 'c1', seq: 1, at: 'T1', attempts: 0, lastError: null },
      { ...base, kind: 'complete', questId: 'w1', clientId: 'c2', seq: 2, at: 'T2', attempts: 0, lastError: null },
    ]);
    expect(out.quests.filter((q) => q.completed).map((q) => q.quest_id)).toEqual(['h1', 'w1']);
    expect(out.quests[0].completed_at).toBe('T1');
    expect(out.pillars).toEqual({ health: 50, work: 100 });
    expect(out.daily_life_score).toBe(75);
    expect(applyQueuedActions(day, [])).toBe(day);
  });

  it('applies a queued undo after the completion it cancels', () => {
    const day: DailyQuestsResponse = {
      date: '2026-11-15',
      daily_life_score: 100,
      pillars: { health: 100 },
      quests: [quest('h1', 'health', { completed: true, completed_at: 'T0' })],
    };
    const out = applyQueuedActions(day, [
      { ...base, kind: 'undo', xpRefund: 15, questId: 'h1', clientId: 'u', seq: 1, at: 'T1', attempts: 0, lastError: null },
    ]);
    expect(out.quests[0].completed).toBe(false);
    expect(out.pillars.health).toBe(0);
    expect(out.daily_life_score).toBe(0);
  });

  it('sums pending XP for today and in total', () => {
    const common = { attempts: 0, lastError: null, at: '' };
    expect(
      pendingXpOf(
        [
          { ...base, ...common, kind: 'complete', questId: 'a', clientId: '1', seq: 1, localDate: '2026-11-14' },
          { ...base, ...common, kind: 'complete', questId: 'b', clientId: '2', seq: 2 },
          { ...base, ...common, kind: 'undo', xpRefund: 25, questId: 'c', clientId: '3', seq: 3 },
        ],
        '2026-11-15',
      ),
    ).toEqual({ total: 5, today: -10 });
  });

  it('makes v4 uuids', () => {
    expect(newClientId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('error classification', () => {
  it('spots network failures', () => {
    expect(isOfflineError(new TypeError('Network request failed'))).toBe(true);
    expect(isOfflineError({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(isOfflineError(new Error('AbortError: aborted'))).toBe(true);
    expect(isOfflineError({ message: 'daily_completion_limit' })).toBe(false);
  });

  it('knows which refusals are final', () => {
    expect(permanentSyncReason('daily_completion_limit')).toMatch(/15/);
    expect(permanentSyncReason('offline_completion_too_old')).toMatch(/24 hours/);
    expect(permanentSyncReason('no_gamification')).toBeNull();
  });

  it('detects a database without the sync RPC', () => {
    expect(isMissingSyncRpc({ code: 'PGRST202', message: '' })).toBe(true);
    expect(
      isMissingSyncRpc({ message: 'Could not find the function public.sync_quest_completion' }),
    ).toBe(true);
    expect(isMissingSyncRpc({ message: 'quest_not_found' })).toBe(false);
    expect(isMissingSyncRpc(null)).toBe(false);
  });
});
