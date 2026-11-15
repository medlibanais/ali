// Offline-first quest completions.
//
// Completions made without a connection are written to a persistent,
// ordered queue (AsyncStorage: SQLite/files on native, localStorage on
// web, no extra native module) and replayed in the exact order they
// happened once the app is back online. Today's quests are cached too,
// so a cold start in airplane mode still shows the day.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyQuestsResponse, Quest } from '../api/types';
import type { Pillar } from '../theme/tokens';

const CACHE_KEY = 'prayerlock.dailyQuests.v1';
const QUEUE_KEY = 'prayerlock.completionQueue.v2';
const LEGACY_QUEUE_KEY = 'prayerlock.completionQueue.v1';

export interface QueuedCompletion {
  /** Idempotency key: the server awards each clientId at most once. */
  clientId: string;
  questId: string;
  /** Owner of the completion; null only for items from the old v1 queue. */
  userId: string | null;
  /** ISO time the user tapped "complete", from the device clock. */
  completedAt: string;
  /** Monotonic order of completion; the sync replays by this. */
  seq: number;
  /** Optimistic XP shown until the server answers. */
  xpEstimate: number;
  title: string;
  /** Device-local day (YYYY-MM-DD) the completion happened on. */
  localDate: string;
}

interface LegacyQueuedCompletion {
  questId: string;
  queuedAt: number;
}

// --------------------------------------------------------------- helpers

export function localDateOf(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** RFC 4122 v4 id. Uses crypto when present (web, newer Hermes). */
export function newClientId(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj: { getRandomValues?: (a: Uint8Array) => Uint8Array } | undefined =
    (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Optimistic XP for a completion: base + the before-6-PM bonus, inside the
 * 500/day cap. The streak bonus is left out on purpose (the server decides
 * it); the real number replaces this after sync.
 */
export function estimateXp(quest: Pick<Quest, 'xp_reward'>, at: Date, xpAlreadyToday: number): number {
  const raw = quest.xp_reward + (at.getHours() < 18 ? 5 : 0);
  return Math.max(0, Math.min(raw, 500 - Math.max(0, xpAlreadyToday)));
}

// Every read-modify-write of the queue runs through this chain, so an
// enqueue during a sync can never be lost to a concurrent write.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

function sortQueue(items: QueuedCompletion[]): QueuedCompletion[] {
  return [...items].sort(
    (a, b) => a.seq - b.seq || a.completedAt.localeCompare(b.completedAt),
  );
}

async function readRaw(): Promise<QueuedCompletion[]> {
  let items: QueuedCompletion[] = [];
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (raw) items = JSON.parse(raw) as QueuedCompletion[];
  } catch {
    items = [];
  }
  // One-time carry-over of completions queued by the previous version.
  try {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as LegacyQueuedCompletion[];
      let seq = items.reduce((max, i) => Math.max(max, i.seq), 0);
      for (const old of legacy) {
        if (items.some((i) => i.questId === old.questId)) continue;
        seq += 1;
        const at = new Date(old.queuedAt);
        items.push({
          clientId: newClientId(),
          questId: old.questId,
          userId: null,
          completedAt: at.toISOString(),
          seq,
          xpEstimate: 0,
          title: '',
          localDate: localDateOf(at),
        });
      }
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
      await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
    }
  } catch {
    // ignore: legacy items stay where they are and are retried next time
  }
  return sortQueue(items);
}

async function writeRaw(items: QueuedCompletion[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(sortQueue(items)));
}

function belongsTo(item: QueuedCompletion, userId: string | null): boolean {
  return userId === null || item.userId === null || item.userId === userId;
}

// ------------------------------------------------------------------ queue

/** Queued completions in completion order, optionally for one user. */
export function readCompletionQueue(userId: string | null = null): Promise<QueuedCompletion[]> {
  return withLock(async () => (await readRaw()).filter((i) => belongsTo(i, userId)));
}

export type NewQueuedCompletion = Omit<QueuedCompletion, 'seq' | 'clientId'> & {
  clientId?: string;
};

/**
 * Appends a completion. A quest already in the queue is not added twice.
 * Returns the stored item (with its order and idempotency key).
 */
export function enqueueCompletion(item: NewQueuedCompletion): Promise<QueuedCompletion> {
  return withLock(async () => {
    const items = await readRaw();
    const existing = items.find(
      (i) => i.questId === item.questId && belongsTo(i, item.userId),
    );
    if (existing) return existing;
    const seq = items.reduce((max, i) => Math.max(max, i.seq), 0) + 1;
    const stored: QueuedCompletion = {
      ...item,
      clientId: item.clientId ?? newClientId(),
      seq,
    };
    items.push(stored);
    await writeRaw(items);
    return stored;
  });
}

/** Removes one queued completion by its idempotency key. */
export function removeQueued(clientId: string): Promise<void> {
  return withLock(async () => {
    const items = await readRaw();
    await writeRaw(items.filter((i) => i.clientId !== clientId));
  });
}

/** Cancels a queued completion (offline undo). Returns what was removed. */
export function cancelQueuedQuest(
  questId: string,
  userId: string | null,
): Promise<QueuedCompletion | null> {
  return withLock(async () => {
    const items = await readRaw();
    const found = items.find((i) => i.questId === questId && belongsTo(i, userId)) ?? null;
    if (found) await writeRaw(items.filter((i) => i.clientId !== found.clientId));
    return found;
  });
}

// ---------------------------------------------------------- optimistic UI

/**
 * Overlays queued completions on a day of quests: marks them completed
 * and recomputes pillar and life scores the way the server does
 * (pillar % = completed / non-skipped; life score = mean of pillars).
 */
export function applyQueuedCompletions(
  day: DailyQuestsResponse,
  queue: QueuedCompletion[],
): DailyQuestsResponse {
  const pending = new Map(queue.map((i) => [i.questId, i]));
  let changed = false;
  const quests = day.quests.map((q) => {
    const item = pending.get(q.quest_id);
    if (!item || q.completed || q.skipped) return q;
    changed = true;
    return { ...q, completed: true, completed_at: item.completedAt };
  });
  if (!changed) return day;

  const totals: Partial<Record<Pillar, { total: number; done: number }>> = {};
  for (const q of quests) {
    if (q.skipped) continue;
    const t = totals[q.pillar] ?? { total: 0, done: 0 };
    t.total += 1;
    if (q.completed) t.done += 1;
    totals[q.pillar] = t;
  }
  const pillars: Partial<Record<Pillar, number>> = { ...day.pillars };
  let sum = 0;
  let count = 0;
  (Object.keys(totals) as Pillar[]).forEach((p) => {
    const t = totals[p];
    if (!t || t.total === 0) return;
    const pct = (100 * t.done) / t.total;
    pillars[p] = Math.round(pct);
    sum += pct;
    count += 1;
  });
  return {
    ...day,
    quests,
    pillars,
    daily_life_score: count === 0 ? day.daily_life_score : Math.round(sum / count),
  };
}

/** XP still waiting for the server, in total and for today. */
export function pendingXpOf(
  queue: QueuedCompletion[],
  today: string,
): { total: number; today: number } {
  let total = 0;
  let todayXp = 0;
  for (const item of queue) {
    total += item.xpEstimate;
    if (item.localDate === today) todayXp += item.xpEstimate;
  }
  return { total, today: todayXp };
}

// ------------------------------------------------------------- day cache

export async function saveQuestsCache(payload: DailyQuestsResponse): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // storage full or unavailable: caching is best-effort
  }
}

export async function loadQuestsCache(): Promise<DailyQuestsResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DailyQuestsResponse) : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- errors

export function isOfflineError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const msg = raw.toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort') ||
    msg.includes('econn') ||
    msg.includes('offline')
  );
}

/** Server refusals that retrying later will not fix. */
const PERMANENT_SYNC_ERRORS: Record<string, string> = {
  daily_completion_limit: 'the daily limit of 15 quests was already reached',
  quest_not_today: 'the quest belongs to another day',
  offline_completion_too_old: 'it was saved more than 24 hours ago',
  quest_not_found: 'the quest no longer exists',
  quest_skipped: 'the quest was skipped',
  not_your_quest: 'it belongs to another account',
  invalid_sync_payload: 'the saved data was incomplete',
};

/** Friendly reason when the server will never accept this completion. */
export function permanentSyncReason(message: string | undefined): string | null {
  const msg = message ?? '';
  const code = Object.keys(PERMANENT_SYNC_ERRORS).find((c) => msg.includes(c));
  return code ? PERMANENT_SYNC_ERRORS[code] : null;
}

/** True when the database does not have sync_quest_completion yet (0014 not pushed). */
export function isMissingSyncRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    ((error.message ?? '').includes('sync_quest_completion') &&
      (error.message ?? '').toLowerCase().includes('could not find'))
  );
}
