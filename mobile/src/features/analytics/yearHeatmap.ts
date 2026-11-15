// Data and pure helpers for the yearly XP heatmap on Insights.
//
// XP per day comes from daily_scores.xp_earned. The server writes that row
// for the quest's assigned_date, which is already the user's local day
// (public.user_today), so no client-side timezone bucketing of timestamps
// is needed: we only have to know what "today" is in the profile timezone.
// One select of at most 365 rows; RLS lets us read it, and we filter to our
// own user_id because friends' rows are readable too.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export const YEAR_DAYS = 365;

export interface XpDay {
  /** yyyy-mm-dd in the user's timezone. */
  date: string;
  xp: number;
}

export interface HeatCell extends XpDay {
  /** Week column, 0 = oldest. */
  col: number;
  /** Weekday row, 0 = Sunday. */
  row: number;
}

export interface YearGrid {
  cells: HeatCell[];
  /** Number of week columns (53 or 54). */
  weeks: number;
  /** Month labels: the column where each month's first day falls. */
  months: { col: number; label: string }[];
  totalXp: number;
  activeDays: number;
  best: XpDay | null;
  /** XP that maps to the brightest color (see xpScaleMax). */
  scaleMax: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

/** yyyy-mm-dd -> UTC midnight ms. Working in UTC keeps DST out of the grid. */
function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * DAY_MS);
}

/** Today's date in an IANA timezone; without one (or if Intl can't), the device's local date. */
export function todayInTimezone(
  timeZone: string | null | undefined,
  now: Date = new Date(),
): string {
  if (timeZone)
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const iso = `${get('year')}-${get('month')}-${get('day')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    } catch {
      // Unknown timezone or an Intl without timeZone support: use device date.
    }
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * XP that gets the brightest color: the 90th percentile of active days,
 * so one huge day doesn't wash every other day out to near-empty.
 */
export function xpScaleMax(values: number[]): number {
  const active = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (active.length === 0) return 1;
  const idx = Math.min(active.length - 1, Math.floor(active.length * 0.9));
  return Math.max(1, active[idx]);
}

/**
 * Continuous 0..1 intensity for a day's XP. Zero stays zero (empty cell);
 * any XP starts at 0.15 so a small day is still visible, then rises on a
 * gentle power curve (t^0.7) so mid-sized days are easy to tell apart.
 */
export function xpIntensity(xp: number, scaleMax: number): number {
  if (xp <= 0) return 0;
  const t = Math.min(1, xp / Math.max(1, scaleMax));
  return 0.15 + 0.85 * Math.pow(t, 0.7);
}

/** Lays out the last `days` days ending today as Sunday-first week columns. */
export function buildYearGrid(rows: XpDay[], today: string, days: number = YEAR_DAYS): YearGrid {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.xp);

  const start = addDays(today, -(days - 1));
  const startMs = toUtc(start);
  const startDow = new Date(startMs).getUTCDay();
  const cells: HeatCell[] = [];
  const months: { col: number; label: string }[] = [];
  let totalXp = 0;
  let activeDays = 0;
  let best: XpDay | null = null;

  for (let i = 0; i < days; i += 1) {
    const ms = startMs + i * DAY_MS;
    const date = fromUtc(ms);
    const slot = startDow + i;
    const col = Math.floor(slot / 7);
    const row = slot % 7;
    const xp = Math.max(0, byDate.get(date) ?? 0);
    cells.push({ date, xp, col, row });
    totalXp += xp;
    if (xp > 0) activeDays += 1;
    if (xp > 0 && (best === null || xp > best.xp)) best = { date, xp };

    const dt = new Date(ms);
    if (dt.getUTCDate() === 1 || i === 0) {
      // Skip a label that would collide with the previous one.
      const prev = months[months.length - 1];
      if (!prev || col - prev.col >= 3) months.push({ col, label: MONTHS[dt.getUTCMonth()] });
      else if (i !== 0 && prev)
        months[months.length - 1] = { col, label: MONTHS[dt.getUTCMonth()] };
    }
  }

  const weeks = cells.length ? cells[cells.length - 1].col + 1 : 0;
  return {
    cells,
    weeks,
    months,
    totalXp,
    activeDays,
    best,
    scaleMax: xpScaleMax(cells.map((c) => c.xp)),
  };
}

/** "Sat, Nov 14, 2026" for a yyyy-mm-dd date (timezone-proof). */
export function formatHeatDate(iso: string): string {
  const d = new Date(toUtc(iso));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface XpRow {
  score_date: string;
  xp_earned: number;
}

/** One query for the whole year of XP. */
export function useYearXp(userId: string | null, today: string) {
  const from = addDays(today, -(YEAR_DAYS - 1));
  return useQuery({
    queryKey: ['analytics', 'year-xp', userId, from, today],
    enabled: userId !== null,
    queryFn: async (): Promise<XpDay[]> => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select('score_date, xp_earned')
        .eq('user_id', userId as string)
        .gte('score_date', from)
        .lte('score_date', today)
        .order('score_date');
      if (error) throw error;
      return ((data ?? []) as XpRow[]).map((r) => ({
        date: r.score_date,
        xp: r.xp_earned,
      }));
    },
  });
}
