// Pure decisions behind the celebrations, kept free of React and Redux so
// they are easy to unit test. The middleware feeds them state and acts on
// what they return.

import type { Quest } from '../../api/types';
import { MAX_LEVEL, titleForLevel } from '../../lib/levels';

/** Minimum active quests for a Perfect Day (same rule as the badge). */
export const PERFECT_DAY_MIN_QUESTS = 3;

/** What we have already celebrated for one user, persisted across launches. */
export interface CelebrationMarks {
  /** Highest level a level-up was shown for (or seen at first load). */
  level: number;
  /** Local date (YYYY-MM-DD) of the last Perfect Day takeover. */
  perfectDay: string | null;
}

export interface LevelUpInfo {
  fromLevel: number;
  toLevel: number;
  fromTitle: string;
  toTitle: string;
  titleChanged: boolean;
}

/**
 * The first level we see for a user only sets the baseline: loading the app,
 * signing in or pulling to refresh never replays a level-up. After that, a
 * level-up shows once per level, so undoing a quest (level drops) and
 * completing it again does not show it twice.
 */
export function decideLevelUp(
  marks: CelebrationMarks,
  level: number,
): { marks: CelebrationMarks; levelUp: LevelUpInfo | null } {
  const next = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  if (next <= marks.level) return { marks, levelUp: null };
  const fromLevel = marks.level;
  const fromTitle = titleForLevel(fromLevel);
  const toTitle = titleForLevel(next);
  return {
    marks: { ...marks, level: next },
    levelUp: {
      fromLevel,
      toLevel: next,
      fromTitle,
      toTitle,
      titleChanged: fromTitle !== toTitle,
    },
  };
}

/** Marks for a user we have not seen on this device: the current level. */
export function baselineMarks(
  stored: CelebrationMarks | null,
  level: number,
): CelebrationMarks {
  return {
    level: Math.max(stored?.level ?? 1, level),
    perfectDay: stored?.perfectDay ?? null,
  };
}

/** Every active (not skipped) quest of the day is done, and there are enough. */
export function isPerfectDay(quests: readonly Quest[]): boolean {
  const active = quests.filter((q) => !q.skipped);
  return (
    active.length >= PERFECT_DAY_MIN_QUESTS && active.every((q) => q.completed)
  );
}

/** Perfect Day shows once per local date, only right after a completion. */
export function decidePerfectDay(
  marks: CelebrationMarks,
  date: string | null,
  quests: readonly Quest[],
): { marks: CelebrationMarks; perfect: boolean } {
  if (!date || marks.perfectDay === date || !isPerfectDay(quests)) {
    return { marks, perfect: false };
  }
  return { marks: { ...marks, perfectDay: date }, perfect: true };
}

/** 6 to 14 particles, more for bigger rewards. */
export function particleCount(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return Math.max(6, Math.min(14, Math.round(xp / 4)));
}
