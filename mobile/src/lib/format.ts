import i18n from '../i18n';
// Small formatting helpers shared across screens.

/** "1 day" / "2 days" / "0 days" — correct singular/plural. */
export function pluralize(count: number, noun: string): string {
  const n = Math.round(count);
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Streak display: "1 day" current with best as "best 23 days". */
export function streakLabel(current: number): string {
  return i18n.t('common.days', { count: Math.round(current) });
}

export function bestStreakLabel(best: number): string {
  return i18n.t('common.bestDays', { count: Math.round(best) });
}
