import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '../../lib/supabase';
import type {
  DailyScoreResponse,
  MonthlyReportResponse,
  PillarTrend,
  WeeklyReportResponse,
} from '../../api/types';
import { PILLARS, PILLAR_LABELS, type Pillar } from '../../theme/tokens';

export interface AnalyticsState {
  daily: DailyScoreResponse | null;
  dailyLoading: boolean;
  dailyError: string | null;
  weekly: WeeklyReportResponse | null;
  weeklyLoading: boolean;
  weeklyError: string | null;
  monthly: MonthlyReportResponse | null;
  monthlyLoading: boolean;
  monthlyError: string | null;
}

const initialState: AnalyticsState = {
  daily: null,
  dailyLoading: false,
  dailyError: null,
  weekly: null,
  weeklyLoading: false,
  weeklyError: null,
  monthly: null,
  monthlyLoading: false,
  monthlyError: null,
};

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

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchScoresInRange(from: string, to: string): Promise<ScoreRow[]> {
  const { data, error } = await supabase
    .from('daily_scores')
    .select('*')
    .gte('score_date', from)
    .lte('score_date', to)
    .order('score_date');
  if (error) throw error;
  return (data ?? []) as ScoreRow[];
}

function aggregate(rows: ScoreRow[]) {
  const assigned = rows.reduce((s, r) => s + r.assigned_count, 0);
  const completed = rows.reduce((s, r) => s + r.completed_count, 0);
  const xp = rows.reduce((s, r) => s + r.xp_earned, 0);
  const rate = assigned > 0 ? Math.round((100 * completed) / assigned) : 0;
  const pillarAvg = (p: Pillar) =>
    rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r[p], 0) / rows.length)
      : 0;
  return { assigned, completed, xp, rate, pillarAvg };
}

export const fetchDailyScore = createAsyncThunk<
  DailyScoreResponse,
  void,
  { rejectValue: string }
>('analytics/fetchDaily', async (_, { rejectWithValue }) => {
  try {
    const date = toDateKey(new Date());
    const rows = await fetchScoresInRange(date, date);
    const row = rows[0];

    // Per-pillar completion counts come from today's quests.
    const { data: quests, error } = await supabase
      .from('quests')
      .select('pillar, skipped, quest_completions(undone_at)')
      .eq('assigned_date', date);
    if (error) throw error;

    const pillars: DailyScoreResponse['pillars'] = {};
    let weakest: Pillar | null = null;
    let weakestScore = 101;
    for (const p of PILLARS) {
      const inPillar = (quests ?? []).filter(
        (q: { pillar: string; skipped: boolean }) => q.pillar === p && !q.skipped,
      );
      if (inPillar.length === 0) continue;
      const done = inPillar.filter(
        (q: { quest_completions: { undone_at: string | null }[] }) =>
          q.quest_completions.some((c) => c.undone_at === null),
      ).length;
      const score = Math.round((100 * done) / inPillar.length);
      pillars[p] = { score, completed: done, total: inPillar.length };
      if (done < inPillar.length && score < weakestScore) {
        weakest = p;
        weakestScore = score;
      }
    }

    return {
      date,
      overall_score: row?.overall ?? 0,
      pillars,
      suggestion: weakest
        ? `Next up: ${PILLAR_LABELS[weakest]} has quests waiting.`
        : null,
    };
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : 'Could not load today\'s breakdown.',
    );
  }
});

export const fetchWeeklyReport = createAsyncThunk<
  WeeklyReportResponse,
  void,
  { rejectValue: string }
>('analytics/fetchWeekly', async (_, { rejectWithValue }) => {
  try {
    const monday = mondayOfWeek(new Date());
    const lastMonday = new Date(monday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(monday);
    lastSunday.setDate(lastSunday.getDate() - 1);
    const today = new Date();

    const [thisWeek, lastWeek] = await Promise.all([
      fetchScoresInRange(toDateKey(monday), toDateKey(today)),
      fetchScoresInRange(toDateKey(lastMonday), toDateKey(lastSunday)),
    ]);

    const cur = aggregate(thisWeek);
    const prev = aggregate(lastWeek);

    const pillar_scores: Partial<Record<Pillar, PillarTrend>> = {};
    for (const p of PILLARS) {
      const score = cur.pillarAvg(p);
      const prevScore = prev.pillarAvg(p);
      const change = prevScore > 0 ? Math.round(((score - prevScore) / prevScore) * 100) : 0;
      pillar_scores[p] = {
        score,
        trend: change > 5 ? 'up' : change < -5 ? 'down' : 'neutral',
        change_percent: change,
      };
    }

    const activeDays = thisWeek.filter((r) => r.assigned_count > 0).length;
    const avgScore =
      thisWeek.length > 0
        ? Math.round(thisWeek.reduce((s, r) => s + r.overall, 0) / thisWeek.length)
        : 0;

    return {
      week: `${toDateKey(monday)} to ${toDateKey(today)}`,
      completion_rate: cur.rate,
      total_xp: cur.xp,
      pillar_scores,
      ai_insights: [],
      prediction:
        activeDays > 0
          ? { next_week_score: avgScore, confidence: 0.4 }
          : null,
    };
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : 'Could not load the weekly report.',
    );
  }
});

export const fetchMonthlyReport = createAsyncThunk<
  MonthlyReportResponse,
  void,
  { rejectValue: string }
>('analytics/fetchMonthly', async (_, { rejectWithValue }) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [thisMonth, lastMonth, gamRes, achRes] = await Promise.all([
      fetchScoresInRange(toDateKey(monthStart), toDateKey(now)),
      fetchScoresInRange(toDateKey(prevStart), toDateKey(prevEnd)),
      supabase.from('gamification').select('best_streak').single(),
      supabase
        .from('achievements')
        .select('badge_id, unlocked_at')
        .gte('unlocked_at', monthStart.toISOString()),
    ]);

    const cur = aggregate(thisMonth);
    const prev = aggregate(lastMonth);
    const scores = thisMonth.map((r) => r.overall);
    const change =
      prev.rate > 0
        ? Math.round(((cur.rate - prev.rate) / prev.rate) * 100)
        : null;

    return {
      month: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      completion_rate: cur.rate,
      completion_change_percent: change,
      average_daily_score:
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0,
      highest_daily_score: scores.length > 0 ? Math.max(...scores) : 0,
      lowest_daily_score: scores.length > 0 ? Math.min(...scores) : 0,
      total_xp: cur.xp,
      days_active: thisMonth.filter((r) => r.completed_count > 0).length,
      streaks: { best_streak: gamRes.data?.best_streak ?? 0 },
      badges_unlocked: (achRes.data ?? []).map((a: { badge_id: string }) => a.badge_id),
    };
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : 'Could not load the monthly report.',
    );
  }
});

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    clearAnalytics() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDailyScore.pending, (state) => {
        state.dailyLoading = true;
        state.dailyError = null;
      })
      .addCase(fetchDailyScore.fulfilled, (state, action) => {
        state.dailyLoading = false;
        state.daily = action.payload;
      })
      .addCase(fetchDailyScore.rejected, (state, action) => {
        state.dailyLoading = false;
        state.dailyError = action.payload ?? 'Could not load today\'s breakdown.';
      })
      .addCase(fetchWeeklyReport.pending, (state) => {
        state.weeklyLoading = true;
        state.weeklyError = null;
      })
      .addCase(fetchWeeklyReport.fulfilled, (state, action) => {
        state.weeklyLoading = false;
        state.weekly = action.payload;
      })
      .addCase(fetchWeeklyReport.rejected, (state, action) => {
        state.weeklyLoading = false;
        state.weeklyError = action.payload ?? 'Could not load the weekly report.';
      })
      .addCase(fetchMonthlyReport.pending, (state) => {
        state.monthlyLoading = true;
        state.monthlyError = null;
      })
      .addCase(fetchMonthlyReport.fulfilled, (state, action) => {
        state.monthlyLoading = false;
        state.monthly = action.payload;
      })
      .addCase(fetchMonthlyReport.rejected, (state, action) => {
        state.monthlyLoading = false;
        state.monthlyError = action.payload ?? 'Could not load the monthly report.';
      });
  },
});

export const { clearAnalytics } = analyticsSlice.actions;

export default analyticsSlice.reducer;
