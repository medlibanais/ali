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

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CompletionRow {
  quest_id: string;
  completed_at: string;
  xp_awarded: number;
  undone_at: string | null;
  quests: { pillar: Pillar } | { pillar: Pillar }[] | null;
}

export function useScoresRange(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'scores', from, to],
    queryFn: async (): Promise<DayScore[]> => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select('*')
        .gte('score_date', from)
        .lte('score_date', to)
        .order('score_date');
      if (error) throw error;
      return ((data ?? []) as ScoreRow[]).map(mapRow);
    },
  });
}

export function useScoresLastDays(days: number) {
  const to = dateKey(new Date());
  const from = dateKey(new Date(Date.now() - (days - 1) * 86400000));
  return useScoresRange(from, to);
}

export function useCompletionsRange(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'completions', from, to],
    queryFn: async (): Promise<CompletionRow[]> => {
      const { data, error } = await supabase
        .from('quest_completions')
        .select('quest_id, completed_at, xp_awarded, undone_at, quests(pillar)')
        .is('undone_at', null)
        .gte('completed_at', `${from}T00:00:00Z`)
        .lte('completed_at', `${to}T23:59:59.999Z`)
        .order('completed_at');
      if (error) throw error;
      return (data ?? []) as CompletionRow[];
    },
  });
}

export interface StreakInfo {
  current: number;
  best: number;
  level: number;
  totalXp: number;
  breaks: string[]; // dates with assigned quests but zero completions (last 12w)
}

export function useStreakInfo() {
  return useQuery({
    queryKey: ['analytics', 'streak'],
    queryFn: async (): Promise<StreakInfo> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { data: g } = await supabase
        .from('gamification')
        .select('level, total_xp, current_streak, best_streak')
        .eq('user_id', user.id)
        .maybeSingle();
      const from = dateKey(new Date(Date.now() - 83 * 86400000));
      const { data: rows } = await supabase
        .from('daily_scores')
        .select('score_date, assigned_count, completed_count')
        .gte('score_date', from)
        .order('score_date');
      const breaks = ((rows ?? []) as ScoreRow[])
        .filter((r) => r.assigned_count > 0 && r.completed_count === 0)
        .map((r) => r.score_date);
      return {
        current: g?.current_streak ?? 0,
        best: g?.best_streak ?? 0,
        level: g?.level ?? 1,
        totalXp: g?.total_xp ?? 0,
        breaks,
      };
    },
  });
}

export interface AiInsight {
  pattern: string;
  insight: string;
  suggestion: string;
}

export function useAiInsights() {
  return useQuery({
    queryKey: ['analytics', 'ai-insights'],
    queryFn: async (): Promise<AiInsight[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('ai_insights')
        .select('insights, week_start')
        .eq('user_id', user.id)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      const list = (data?.insights as AiInsight[] | undefined) ?? [];
      return Array.isArray(list) ? list : [];
    },
  });
}

// ---- Derived series helpers (pure functions, unit-testable) ----

export function dailyXpSeries(days: DayScore[]): { date: string; xp: number }[] {
  return days.map((d) => ({ date: d.date, xp: d.xp }));
}

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

export function effortShare(
  days: DayScore[],
  completions: CompletionRow[],
): { pillar: Pillar; count: number }[] {
  const pillars: Pillar[] = ['health', 'family', 'work', 'fun', 'spirituality'];
  const counts = new Map<Pillar, number>(pillars.map((p) => [p, 0]));
  for (const c of completions) {
    const q = Array.isArray(c.quests) ? c.quests[0] : c.quests;
    if (q?.pillar) counts.set(q.pillar, (counts.get(q.pillar) ?? 0) + 1);
  }
  void days;
  return pillars.map((p) => ({ pillar: p, count: counts.get(p) ?? 0 }));
}

export function weekdayPerformance(days: DayScore[]): number[] {
  // index 0 = Sunday .. 6 = Saturday (JS getDay)
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const d of days) {
    const wd = new Date(`${d.date}T12:00:00Z`).getDay();
    if (d.assigned > 0) {
      sums[wd] += d.overall;
      counts[wd] += 1;
    }
  }
  return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : 0));
}

export function completionHourHistogram(completions: CompletionRow[]): number[] {
  // 24 buckets by local hour
  const buckets = new Array(24).fill(0);
  for (const c of completions) {
    const h = new Date(c.completed_at).getHours();
    buckets[h] += 1;
  }
  return buckets;
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

export function wowChange(current: DayScore[], previous: DayScore[]): number | null {
  const rate = (rows: DayScore[]) => {
    const a = rows.reduce((s, d) => s + d.assigned, 0);
    const c = rows.reduce((s, d) => s + d.completed, 0);
    return a > 0 ? (100 * c) / a : 0;
  };
  const prev = rate(previous);
  if (prev === 0) return null;
  return Math.round(((rate(current) - prev) / prev) * 100);
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
      .map((d) => new Date(`${d.date}T12:00:00Z`).getDay()),
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


