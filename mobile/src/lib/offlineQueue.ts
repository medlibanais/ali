// Offline support: cache today's quests and queue completions so a
// subway ride never loses progress. Drains when the app reconnects.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyQuestsResponse } from '../api/types';

const CACHE_KEY = 'prayerlock.dailyQuests.v1';
const QUEUE_KEY = 'prayerlock.completionQueue.v1';

export interface QueuedCompletion {
  questId: string;
  queuedAt: number;
}

export async function saveQuestsCache(payload: DailyQuestsResponse): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // storage full or unavailable — caching is best-effort
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

export async function readCompletionQueue(): Promise<QueuedCompletion[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedCompletion[]) : [];
  } catch {
    return [];
  }
}

export async function enqueueCompletion(questId: string): Promise<void> {
  const queue = await readCompletionQueue();
  if (queue.some((q) => q.questId === questId)) return;
  queue.push({ questId, queuedAt: Date.now() });
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export async function dequeueCompletion(questId: string): Promise<void> {
  const queue = await readCompletionQueue();
  const next = queue.filter((q) => q.questId !== questId);
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function isOfflineError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('econn') ||
    msg.includes('failed to fetch')
  );
}
