// Offline-first quest actions.
//
// Quest completions and undos made without a connection are written to a
// persistent, ordered queue ("offline_queue" in MMKV on Android and in
// localStorage on web, see kvStore.ts, so it survives app restarts) and replayed in the exact order they happened once the app
// is back online. Today's quests are cached too, so a cold start on the
// subway still shows the day.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { kvStore, readJson, writeJson } from './kvStore';
import type { DailyQuestsResponse, Quest } from '../api/types';
import type { Pillar } from '../theme/tokens';

const CACHE_KEY = 'prayerlock.dailyQuests.v1';
export const QUEUE_KEY = 'prayerlock.offline_queue';
const LEGACY_QUEUE_KEY = 'prayerlock.completionQueue.v1';

interface QueuedBase {
  /** Idempotency key: the server applies each clientId at most once. */
  clientId: string;
  questId: string;
  /** Owner of the action; null only for items from the old v1 queue. */
  userId: string | null;
  /** ISO time the user tapped, from the device clock. */
  at: string;
  /** Monotonic order; the sync replays by this. */
  seq: number;
  title: string;
  /** Failed sync attempts so far (the item stays queued). */
  attempts: number;
  lastError: string | null;
}

export interface QueuedCompletion extends QueuedBase {
  kind: 'complete';
  /** Optimistic XP shown until the server answers. */
  xpEstimate: number;
  /** Device-local day (YYYY-MM-DD) the completion happened on. */
  localDate: string;
  /**
   * Queued because the online call failed mid-way: the server may already
   * have it from that call, which is then not a conflict with another device.
   */
  afterOnlineAttempt?: boolean;
}

export interface QueuedUndo extends QueuedBase {
  kind: 'undo';
  /** XP the server gave for the completion being undone. */
  xpRefund: number;
  localDate: string;
}

export type QueuedAction = QueuedCompletion | QueuedUndo;

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

function sortQueue(items: QueuedAction[]): QueuedAction[] {
  return [...items].sort((a, b) => a.seq - b.seq || a.at.localeCompare(b.at));
}

function nextSeq(items: QueuedAction[]): number {
  return items.reduce((max, i) => Math.max(max, i.seq), 0) + 1;
}

async function readRaw(): Promise<QueuedAction[]> {
  const items: QueuedAction[] = readJson<QueuedAction[]>(QUEUE_KEY) ?? [];
  // One-time carry-over of completions the previous app version queued in
  // AsyncStorage.
  try {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as LegacyQueuedCompletion[];
      for (const old of legacy) {
        if (items.some((i) => i.questId === old.questId)) continue;
        const at = new Date(old.queuedAt);
        items.push({
          kind: 'complete',
          clientId: newClientId(),
          questId: old.questId,
          userId: null,
          at: at.toISOString(),
          seq: nextSeq(items),
          xpEstimate: 0,
          title: '',
          localDate: localDateOf(at),
          attempts: 0,
          lastError: null,
        });
      }
      writeJson(QUEUE_KEY, items);
      await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
    }
  } catch {
    // ignore: legacy items stay where they are and are retried next time
  }
  return sortQueue(items);
}

async function writeRaw(items: QueuedAction[]): Promise<void> {
  if (items.length === 0) kvStore.delete(QUEUE_KEY);
  else writeJson(QUEUE_KEY, sortQueue(items));
}

function belongsTo(item: QueuedAction, userId: string | null): boolean {
  return userId === null || item.userId === null || item.userId === userId;
}

// ------------------------------------------------------------------ queue

/** Queued actions in the order they happened, optionally for one user. */
export function readOfflineQueue(userId: string | null = null): Promise<QueuedAction[]> {
  return withLock(async () => (await readRaw()).filter((i) => belongsTo(i, userId)));
}

type NewItem<T extends QueuedAction> = Omit<T, 'seq' | 'clientId' | 'attempts' | 'lastError' | 'kind'> & {
  clientId?: string;
};

/**
 * Appends a completion. A quest already waiting to be completed is not
 * added twice. Returns the stored item (with its order and key).
 */
export function enqueueCompletion(item: NewItem<QueuedCompletion>): Promise<QueuedCompletion> {
  return withLock(async () => {
    const items = await readRaw();
    const existing = items.find(
      (i): i is QueuedCompletion =>
        i.kind === 'complete' && i.questId === item.questId && belongsTo(i, item.userId),
    );
    if (existing && !items.some((u) => u.kind === 'undo' && u.questId === item.questId && u.seq > existing.seq)) {
      return existing;
    }
    const stored: QueuedCompletion = {
      ...item,
      kind: 'complete',
      clientId: item.clientId ?? newClientId(),
      seq: nextSeq(items),
      attempts: 0,
      lastError: null,
    };
    items.push(stored);
    await writeRaw(items);
    return stored;
  });
}

/** Appends an undo of a completion the server already has. */
export function enqueueUndo(item: NewItem<QueuedUndo>): Promise<QueuedUndo> {
  return withLock(async () => {
    const items = await readRaw();
    const stored: QueuedUndo = {
      ...item,
      kind: 'undo',
      clientId: item.clientId ?? newClientId(),
      seq: nextSeq(items),
      attempts: 0,
      lastError: null,
    };
    items.push(stored);
    await writeRaw(items);
    return stored;
  });
}

/** Removes one queued action by its key. */
export function removeQueued(clientId: string): Promise<void> {
  return withLock(async () => {
    const items = await readRaw();
    await writeRaw(items.filter((i) => i.clientId !== clientId));
  });
}

/** Keeps a failed action queued, noting the attempt. */
export function markAttempt(clientId: string, error: string): Promise<void> {
  return withLock(async () => {
    const items = await readRaw();
    await writeRaw(
      items.map((i) =>
        i.clientId === clientId ? { ...i, attempts: i.attempts + 1, lastError: error } : i,
      ),
    );
  });
}

/**
 * Offline undo of a completion that never left the device: both cancel
 * out, so the completion is simply taken out of the queue.
 */
export function cancelQueuedQuest(
  questId: string,
  userId: string | null,
): Promise<QueuedCompletion | null> {
  return withLock(async () => {
    const items = await readRaw();
    const found =
      [...items]
        .reverse()
        .find(
          (i): i is QueuedCompletion =>
            i.kind === 'complete' && i.questId === questId && belongsTo(i, userId),
        ) ?? null;
    if (found) await writeRaw(items.filter((i) => i.clientId !== found.clientId));
    return found;
  });
}

// ---------------------------------------------------------- optimistic UI

/**
 * Replays queued actions on a day of quests, in order: completions tick
 * quests, undos untick them. Pillar and life scores are recomputed the
 * way the server does (pillar % = completed / non-skipped; life score =
 * mean of pillars).
 */
export function applyQueuedActions(
  day: DailyQuestsResponse,
  queue: QueuedAction[],
): DailyQuestsResponse {
  if (queue.length === 0) return day;
  const byId = new Map(day.quests.map((q) => [q.quest_id, q]));
  let changed = false;
  for (const item of sortQueue(queue)) {
    const q = byId.get(item.questId);
    if (!q || q.skipped) continue;
    if (item.kind === 'complete' && !q.completed) {
      byId.set(q.quest_id, { ...q, completed: true, completed_at: item.at });
      changed = true;
    } else if (item.kind === 'undo' && q.completed) {
      byId.set(q.quest_id, { ...q, completed: false, completed_at: null });
      changed = true;
    }
  }
  if (!changed) return day;
  const quests = day.quests.map((q) => byId.get(q.quest_id) ?? q);

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
  queue: QueuedAction[],
  today: string,
): { total: number; today: number } {
  let total = 0;
  let todayXp = 0;
  for (const item of queue) {
    const xp = item.kind === 'complete' ? item.xpEstimate : -item.xpRefund;
    total += xp;
    if (item.localDate === today) todayXp += xp;
  }
  return { total, today: todayXp };
}

// ------------------------------------------------------------- day cache

export async function saveQuestsCache(payload: DailyQuestsResponse): Promise<void> {
  writeJson(CACHE_KEY, payload);
}

export async function loadQuestsCache(): Promise<DailyQuestsResponse | null> {
  return readJson<DailyQuestsResponse>(CACHE_KEY);
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
  undo_window_expired: 'the undo reached the server too late, so the completion stays',
  offline_undo_too_old: 'the undo was saved more than 24 hours ago, so the completion stays',
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

/** True when the database does not have the sync RPCs yet (0022 not pushed). */
export function isMissingSyncRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? '';
  return (
    error.code === 'PGRST202' ||
    (/sync_quest_(completion|undo)/.test(msg) && msg.toLowerCase().includes('could not find'))
  );
}
