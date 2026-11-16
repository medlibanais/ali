// Streak outlook: the server's predicted chance (0-100) that the user
// completes at least one quest tomorrow. Written hourly by the
// predict-streak Edge Function into gamification.streak_probability;
// the app only reads it (RLS: own row, or a friend's shared stats).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export type StreakBand = 'high_risk' | 'moderate' | 'on_track' | 'no_data';

/** Inputs the server used, stored next to the number. */
export interface StreakDetail {
  days: number;
  active7: number;
  window7: number;
  active30: number;
  weekdayActive: number;
  weekdayTotal: number;
  /** 0 = Sunday ... 6 = Saturday, for tomorrow. */
  weekday: number;
  activeToday: boolean;
}

export interface StreakPrediction {
  /** 0-100, or null for "Not enough data". */
  probability: number | null;
  /** The local day the prediction is about, yyyy-mm-dd. */
  forDay: string | null;
  updatedAt: string | null;
  detail: StreakDetail | null;
}

/** Days of history the server needs before it predicts (mirrors MIN_DATA_DAYS). */
export const MIN_DATA_DAYS = 7;
export const HIGH_RISK_BELOW = 30;
export const ON_TRACK_FROM = 70;

export function streakBand(probability: number | null): StreakBand {
  if (probability === null || !Number.isFinite(probability)) return 'no_data';
  if (probability < HIGH_RISK_BELOW) return 'high_risk';
  if (probability < ON_TRACK_FROM) return 'moderate';
  return 'on_track';
}

export const BAND_LABEL: Record<StreakBand, string> = {
  high_risk: 'High Risk',
  moderate: 'Moderate',
  on_track: 'On Track',
  no_data: 'Not enough data',
};

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function isDetail(v: unknown): v is StreakDetail {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.days === 'number' &&
    typeof d.active7 === 'number' &&
    typeof d.window7 === 'number' &&
    typeof d.weekdayActive === 'number' &&
    typeof d.weekdayTotal === 'number' &&
    typeof d.weekday === 'number'
  );
}

/** Plain-language reasons shown under the gauge. */
export function explainPrediction(p: StreakPrediction): string[] {
  const d = p.detail;
  if (p.probability === null) {
    const have = d ? Math.min(d.days, MIN_DATA_DAYS) : 0;
    const left = MIN_DATA_DAYS - have;
    return [
      `We need ${MIN_DATA_DAYS} full days of history to predict tomorrow.`,
      left > 0
        ? `${left} more ${left === 1 ? 'day' : 'days'} to go.`
        : 'Your first prediction arrives within the hour.',
    ];
  }
  if (!d) return [];
  const lines = [`Active ${d.active7} of the last ${d.window7} days.`];
  if (d.weekdayTotal > 0) {
    lines.push(`${WEEKDAYS[d.weekday] ?? 'That weekday'}: ${d.weekdayActive} of ${d.weekdayTotal}.`);
  }
  if (d.activeToday) lines.push('Already done something today.');
  return lines;
}

/** Spoken summary for screen readers. */
export function predictionA11yLabel(p: StreakPrediction): string {
  const band = streakBand(p.probability);
  if (band === 'no_data') return 'Streak outlook: not enough data yet.';
  return `Streak outlook: ${p.probability} percent chance you complete a quest tomorrow. ${BAND_LABEL[band]}.`;
}

interface Row {
  streak_probability: number | null;
  streak_prediction_for: string | null;
  streak_prediction_at: string | null;
  streak_prediction_detail: unknown;
}

export function mapPrediction(row: Row | null): StreakPrediction {
  return {
    probability: row?.streak_probability ?? null,
    forDay: row?.streak_prediction_for ?? null,
    updatedAt: row?.streak_prediction_at ?? null,
    detail: isDetail(row?.streak_prediction_detail) ? row.streak_prediction_detail : null,
  };
}

export function useStreakPrediction(userId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'streak-prediction', userId],
    enabled: userId !== null,
    // The server refreshes hourly; refetching sooner gains nothing.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<StreakPrediction> => {
      const { data, error } = await supabase
        .from('gamification')
        .select('streak_probability, streak_prediction_for, streak_prediction_at, streak_prediction_detail')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return mapPrediction((data as Row | null) ?? null);
    },
  });
}
