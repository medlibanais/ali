// Per-user record of what was already celebrated, so a relaunch, a refresh
// or an offline sync never replays a level-up or a Perfect Day.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CelebrationMarks } from './logic';

const key = (userId: string) => `grow.celebrations.v1:${userId}`;

export async function loadMarks(userId: string): Promise<CelebrationMarks | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { level, perfectDay } = parsed as Record<string, unknown>;
    return {
      level: typeof level === 'number' && level >= 1 ? level : 1,
      perfectDay: typeof perfectDay === 'string' ? perfectDay : null,
    };
  } catch {
    return null;
  }
}

export async function saveMarks(userId: string, marks: CelebrationMarks): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(marks));
  } catch {
    // Best effort: the worst case is one repeated celebration.
  }
}
