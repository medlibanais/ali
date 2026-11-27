// Behavioral pattern detection for Insights.
//
// - usePatterns(): one row of public.user_behavioral_patterns. The view is
//   security_invoker and pinned to auth.uid(), so it only ever returns the
//   signed-in user's own row (computed in their profile timezone).
// - usePatternInsights(): 2 plain-language insights from the
//   generate-insights Edge Function (Groq server-side, cached there).
// - Pure helpers for the Time-of-Day Histogram.

import { useQuery } from '@tanstack/react-query';
import i18n from '../../i18n';
import { supabase } from '../../lib/supabase';
import { describeFunctionError } from '../../lib/functionErrors';
import type { Pillar } from '../../theme/tokens';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface BehavioralPatterns {
  user_id: string;
  timezone: string;
  window_start: string;
  window_end: string;
  skip_weekday: number | null;
  skip_weekday_name: string | null;
  skip_rate: number | null;
  skip_missed: number | null;
  skip_total: number | null;
  skip_top_pillar: Pillar | null;
  morning_count: number;
  afternoon_count: number;
  evening_count: number;
  peak_time_of_day: TimeOfDay | null;
  neglected_pillar: Pillar | null;
  neglected_rate: number | null;
  neglected_done: number | null;
  neglected_total: number | null;
  neglected_days_since: number | null;
}

export type InsightKind = 'skip_day' | 'time_of_day' | 'neglected_pillar';

export interface PatternInsight {
  kind: InsightKind;
  observation: string;
  suggestion: string;
}

export interface PatternInsightsResult {
  status: 'ok' | 'not_enough_data';
  /** 'ai' = written by the coach model; 'rules' = template fallback. */
  source: 'ai' | 'rules' | 'none';
  insights: PatternInsight[];
  generatedAt: string;
}

export function usePatterns(userId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'patterns', userId],
    enabled: userId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BehavioralPatterns | null> => {
      const { data, error } = await supabase
        .from('user_behavioral_patterns')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as BehavioralPatterns | null) ?? null;
    },
  });
}

export function usePatternInsights(userId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'pattern-insights', userId],
    enabled: userId !== null,
    // The function caches for up to 24 h; no need to ask often.
    staleTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<PatternInsightsResult> => {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: {},
      });
      if (error) {
        const failure = await describeFunctionError(error);
        throw new Error(failure.code ?? (failure.kind === 'network' ? 'network' : `http_${failure.status}`));
      }
      const result = data as PatternInsightsResult | null;
      if (!result || !Array.isArray(result.insights)) throw new Error('bad_response');
      return result;
    },
  });
}

// ---- Time-of-day histogram helpers (pure, unit-tested) ----

export interface TimeBin {
  key: TimeOfDay;
  label: string;
  /** Local hours covered, for the tooltip. */
  range: string;
  count: number;
  /** 0-100, rounded so the three add up to 100 when there is data. */
  share: number;
  /** Average completions per day in this slot over the window. */
  perDay: number;
  isPeak: boolean;
}

const BIN_META: { key: TimeOfDay; label: string; range: string }[] = [
  { key: 'morning', get label() { return i18n.t('insights.morning'); }, get range() { return i18n.t('insights.n5AmNoon'); } },
  { key: 'afternoon', get label() { return i18n.t('insights.afternoon'); }, get range() { return i18n.t('insights.noon5Pm'); } },
  { key: 'evening', get label() { return i18n.t('insights.evening'); }, get range() { return i18n.t('insights.n5Pm5Am'); } },
];

/** Largest-remainder rounding so shares always sum to exactly 100. */
export function roundedShares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (100 * c) / total);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

export function timeOfDayBins(p: BehavioralPatterns): TimeBin[] {
  const counts = [p.morning_count, p.afternoon_count, p.evening_count];
  const shares = roundedShares(counts);
  const days = Math.max(1, daysBetween(p.window_start, p.window_end));
  const max = Math.max(...counts);
  return BIN_META.map((m, i) => ({
    ...m,
    count: counts[i],
    share: shares[i],
    perDay: Math.round((counts[i] / days) * 10) / 10,
    isPeak: max > 0 && counts[i] === max && p.peak_time_of_day === m.key,
  }));
}

/** "nice" axis top: 1, 2, 2.5, 5 x 10^n, at least the max. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * exp >= value) return step * exp;
  }
  return 10 * exp;
}
