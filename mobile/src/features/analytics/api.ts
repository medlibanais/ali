// Analytics data layer: everything computed from daily_scores,
// quest_completions and gamification. No mock series anywhere.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Pillar } from '../../theme/tokens';

export interface DayScore {
  date: string;
  overall: number;
  health: number;
  family: number;
  work: number;
  fun: number;
  spirituality: number;
  assigned: number;
  completed: number;
  skipped: number;
  xp: number;
}

interface ScoreRow {
  score_date: string;
  overall: number;
  health: number;
  family: number;
  work: number;
  fun: number;
  spirituality: number;
  assigned_count: number;
  completed_count: number;
  skipped_count: number;
  xp_earned: number;
}

function mapRow(r: ScoreRow): DayScore {
  return {
    date: r.score_date,
    overall: r.overall,
    health: r.health,
    family: r.family,
    work: r.work,
    fun: r.fun,
    spirituality: r.spirituality,
    assigned: r.assigned_count,
    completed: r.completed_count,
    skipped: r.skipped_count,
    xp: r.xp_earned,
  };
}

export function useScoresRange(userId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'scores', userId, from, to],
    enabled: userId !== null,
    queryFn: async (): Promise<DayScore[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('daily_scores')
        .select('score_date, overall, health, family, work, fun, spirituality, assigned_count, completed_count, skipped_count, xp_earned')
        .eq('user_id', userId)
        .gte('score_date', from)
        .lte('score_date', to)
        .order('score_date');
      if (error) throw error;
      return ((data ?? []) as ScoreRow[]).map(mapRow);
    },
  });
}

export function useStreakInfo(userId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'streak', userId],
    enabled: userId !== null,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('gamification')
        .select('level, current_streak, best_streak')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface AiInsight {
  pattern: string;
  insight: string;
  suggestion: string;
}

export function useAiInsights(userId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'ai-insights', userId],
    enabled: userId !== null,
    queryFn: async (): Promise<AiInsight[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('ai_insights')
        .select('insights')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const list = data?.insights as AiInsight[] | undefined;
      return Array.isArray(list) ? list : [];
    },
  });
}

// ---- Derived series helpers (pure functions, unit-testable) ----

export function pillarAverages(
  days: DayScore[],
): { pillar: Pillar; value: number }[] {
  const pillars: Pillar[] = ['health', 'family', 'work', 'fun', 'spirituality'];
  return pillars.map((p) => ({
    pillar: p,
    value:
      days.length > 0
        ? Math.round(days.reduce((s, d) => s + d[p], 0) / days.length)
        : 0,
  }));
}

export function weekdayPerformance(days: DayScore[]): number[] {
  // index 0 = Sunday .. 6 = Saturday (UTC date key)
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const d of days) {
    const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    if (d.assigned > 0) {
      sums[wd] += d.overall;
      counts[wd] += 1;
    }
  }
  return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : 0));
}

export function funnel(days: DayScore[]): {
  assigned: number;
  completed: number;
  skipped: number;
} {
  return {
    assigned: days.reduce((s, d) => s + d.assigned, 0),
    completed: days.reduce((s, d) => s + d.completed, 0),
    skipped: days.reduce((s, d) => s + d.skipped, 0),
  };
}

// ---- Plain-language summary for the simplified Insights screen ----

export interface PeriodSummary {
  avgScore: number; // average Daily Life Score over days with quests
  prevAvgScore: number | null; // same for the previous period, null if no data
  completionRate: number; // 0-100
  activeDays: number; // days with at least one completion
  totalDays: number;
  strongest: { pillar: Pillar; value: number } | null;
  weakest: { pillar: Pillar; value: number } | null;
  bestWeekday: number | null; // 0 = Sunday, null when not enough data
}


function avgOverall(days: DayScore[]): number | null {
  const scored = days.filter((d) => d.assigned > 0);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((s, d) => s + d.overall, 0) / scored.length);
}

export function summarizePeriod(
  current: DayScore[],
  previous: DayScore[],
): PeriodSummary {
  const f = funnel(current);
  const avgs = pillarAverages(current.filter((d) => d.assigned > 0));
  const ranked = [...avgs].sort((a, b) => b.value - a.value);
  const hasPillarData = ranked.some((p) => p.value > 0);
  const weekday = weekdayPerformance(current);
  const bestValue = Math.max(...weekday);
  const daysWithData = new Set(
    current
      .filter((d) => d.assigned > 0)
      .map((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay()),
  ).size;
  return {
    avgScore: avgOverall(current) ?? 0,
    prevAvgScore: avgOverall(previous),
    completionRate: f.assigned > 0 ? Math.round((100 * f.completed) / f.assigned) : 0,
    activeDays: current.filter((d) => d.completed > 0).length,
    totalDays: current.length,
    strongest: hasPillarData ? ranked[0] : null,
    weakest:
      hasPillarData && ranked[ranked.length - 1].value < ranked[0].value
        ? ranked[ranked.length - 1]
        : null,
    bestWeekday: daysWithData >= 3 && bestValue > 0 ? weekday.indexOf(bestValue) : null,
  };
}


