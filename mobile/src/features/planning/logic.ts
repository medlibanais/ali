import type { Quest } from '../../api/types';
import type { Pillar } from '../../theme/tokens';
import type { TimeOfDay } from '../analytics/patterns';

export const PLAN_MINUTES = [10, 20, 30, 45] as const;
export type PlanMinutes = typeof PLAN_MINUTES[number];

export interface WeeklyPlan {
  pillar: Pillar;
  minutes: PlanMinutes;
  busyDays: number[];
}

export interface WeeklyAction {
  time: TimeOfDay;
  count: number;
  total: number;
}

export type DayFocus =
  | { date: string; kind: 'low'; ids: string[] }
  | { date: string; kind: 'coach'; minutes: number; ids: string[] };

export interface TimeProposal {
  date: string;
  minutes: number;
  selected: Quest[];
  deferred: Quest[];
}

export function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function offsetDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekStart(date: string, next = false): string {
  return offsetDate(date, (next ? 7 : 0) - weekday(date));
}

export function timeEstimate(quest: Quest): number | null {
  const minutes = quest.time_estimate_minutes;
  return minutes && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function openForDay(quests: Quest[], date: string): Quest[] {
  return quests.filter((q) => q.assigned_date === date && !q.completed && !q.skipped);
}

/** Favor the chosen pillar, known short duration, then the server's priority. */
export function rankQuests(quests: Quest[], pillar?: Pillar): Quest[] {
  return [...quests].sort((a, b) =>
    Number(b.pillar === pillar) - Number(a.pillar === pillar) ||
    (timeEstimate(a) ?? Infinity) - (timeEstimate(b) ?? Infinity) ||
    a.priority - b.priority,
  );
}

export function pickWithin(quests: Quest[], minutes: number, max = Infinity): Quest[] {
  const selected: Quest[] = [];
  let remaining = minutes;
  for (const quest of quests) {
    const estimate = timeEstimate(quest);
    if (estimate !== null && estimate <= remaining) {
      selected.push(quest);
      remaining -= estimate;
      if (selected.length === max) break;
    }
  }
  return selected;
}

export function planMinutesForDay(plan: WeeklyPlan, date: string): number {
  return plan.busyDays.includes(weekday(date)) ? Math.min(plan.minutes, 10) : plan.minutes;
}

export function buildTimeProposal(
  quests: Quest[], date: string, minutes: number, pillar?: Pillar,
): TimeProposal {
  const pending = rankQuests(openForDay(quests, date), pillar);
  const selected = pickWithin(pending, minutes);
  const included = new Set(selected.map((q) => q.quest_id));
  return { date, minutes, selected, deferred: pending.filter((q) => !included.has(q.quest_id)) };
}

export function strongestTime(counts: Record<TimeOfDay, number>): WeeklyAction | null {
  const times = Object.entries(counts) as [TimeOfDay, number][];
  const total = times.reduce((sum, [, count]) => sum + count, 0);
  const [[time, count], [, runnerUp]] = times.sort((a, b) => b[1] - a[1]);
  return total >= 6 && count > runnerUp && count / total >= 0.45 ? { time, count, total } : null;
}

/** Only interpret messages that explicitly describe available time. */
export function minutesFromCoachMessage(message: string): number | null {
  const text = message.toLowerCase().normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf));
  const match = /(?:\bi (?:only |just )?have\s+(?:only |just )?|\bj[’']ai\s+(?:seulement )?|\bje n[’']ai que\s+|(?:عندي|لدي)\s*(?:فقط\s*)?)(\d{1,3}|five|ten|fifteen|twenty|thirty|forty-five|cinq|dix|quinze|vingt|trente|خمس|عشر|عشرة|عشرين)\s*(?:minutes?\b|mins?\b|دقائق|دقيقة)/u.exec(text);
  if (!match) return null;
  const words: Record<string, number> = {
    five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45,
    cinq: 5, dix: 10, quinze: 15, vingt: 20, trente: 30,
    خمس: 5, عشر: 10, عشرة: 10, عشرين: 20,
  };
  const minutes = words[match[1]] ?? Number(match[1]);
  return minutes >= 1 && minutes <= 120 ? minutes : null;
}
