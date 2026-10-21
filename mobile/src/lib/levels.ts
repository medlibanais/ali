// Single source of truth for XP / level math on the client.
// Mirrors supabase/migrations/0001_init.sql (xp_for_level,
// cumulative_xp_for_level, level_for_xp, title_for_level).
// Keep the two in sync — unit tests live in __tests__/levels.test.ts.

export const MAX_LEVEL = 100;
export const DAILY_XP_CAP = 500;

/** XP cost to go from level n-1 to level n (level 2 costs 1000). */
export function xpForLevel(n: number): number {
  return 500 * n;
}

/** Cumulative XP required to REACH level n. */
export function cumulativeXpForLevel(n: number): number {
  return 500 * ((n * (n + 1)) / 2 - 1);
}

/** Level for a given lifetime XP total. Always >= 1, capped at MAX_LEVEL. */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  const level = Math.floor(
    (Math.sqrt(8 * (xp / 500 + 1) + 1) - 1) / 2,
  );
  return Math.max(1, Math.min(MAX_LEVEL, level));
}

/** XP still needed to reach the next level (0 at max level). */
export function xpToNextLevel(totalXp: number): number {
  const level = levelForXp(totalXp);
  if (level >= MAX_LEVEL) return 0;
  return cumulativeXpForLevel(level + 1) - totalXp;
}

/** Progress through the current level, 0..1. */
export function levelProgress(totalXp: number): number {
  const level = levelForXp(totalXp);
  if (level >= MAX_LEVEL) return 1;
  const floor = cumulativeXpForLevel(level);
  const span = xpForLevel(level + 1);
  return Math.min(1, Math.max(0, (totalXp - floor) / span));
}

export function titleForLevel(level: number): string {
  if (level >= 76) return 'Legendary';
  if (level >= 51) return 'Guardian of Family';
  if (level >= 26) return 'Iron Mind';
  if (level >= 11) return 'Disciplined Human';
  return 'Novice';
}
