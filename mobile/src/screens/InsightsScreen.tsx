// Insights: every chart reads real data (daily_scores, quest_completions,
// gamification). Today / Week / Month tabs + range chips for the trend line.

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Card from '../components/Card';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import Hairline from '../components/Hairline';
import RadarChart from '../components/RadarChart';
import Screen from '../components/Screen';
import SegmentedControl from '../components/SegmentedControl';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import BarChart from '../components/charts/BarChart';
import DonutChart from '../components/charts/DonutChart';
import Heatmap from '../components/charts/Heatmap';
import LineChart from '../components/charts/LineChart';
import {
  completionHourHistogram,
  effortShare,
  funnel,
  pillarAverages,
  useAiInsights,
  useCompletionsRange,
  useScoresLastDays,
  useStreakInfo,
  weekdayPerformance,
  wowChange,
  type DayScore,
} from '../features/analytics/api';
import { levelProgress, titleForLevel, xpToNextLevel } from '../lib/levels';
import { pluralize } from '../lib/format';
import { useAppSelector } from '../store/hooks';
import {
  colors,
  PILLAR_LABELS,
  PILLARS,
  Pillar,
  spacing,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Section = 'today' | 'week' | 'month';
const SECTION_OPTIONS: { value: Section; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const RANGE_OPTIONS = [7, 30, 90];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
  });
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={styles.chartCard}>
      <Txt variant="label" style={styles.chartTitle}>
        {title}
      </Txt>
      {subtitle ? (
        <Txt variant="caption" color={colors.inkFaint} style={styles.chartSubtitle}>
          {subtitle}
        </Txt>
      ) : null}
      {children}
    </Card>
  );
}

function ChangeCard({ change, period }: { change: number | null; period: string }) {
  if (change === null) {
    return (
      <Card style={styles.changeCard}>
        <Txt variant="body" color={colors.inkSoft}>
          {`Not enough data for a ${period}-over-${period} comparison yet.`}
        </Txt>
      </Card>
    );
  }
  const up = change >= 0;
  return (
    <Card style={styles.changeCard}>
      <Txt variant="label">{`${period}-over-${period}`}</Txt>
      <Txt
        variant="display"
        color={up ? colors.accent : colors.danger}
        style={styles.changeValue}
      >
        {`${up ? '+' : ''}${change}%`}
      </Txt>
      <Txt variant="caption" color={colors.inkSoft}>
        {up
          ? 'You are beating your previous pace. Protect the streak.'
          : 'Slower than the previous stretch. One quest today starts the recovery.'}
      </Txt>
    </Card>
  );
}

function StreakCard({
  streak,
  days,
}: {
  streak: { current: number; best: number; breaks: string[] };
  days: DayScore[];
}) {
  const thisWeekBreaks = streak.breaks.filter((b) =>
    days.some((d) => d.date === b),
  );
  return (
    <Card style={styles.chartCard}>
      <Txt variant="label" style={styles.chartTitle}>
        Streak timeline
      </Txt>
      <View style={styles.streakRow}>
        <View style={styles.streakCell}>
          <Txt variant="display" color={colors.gold} style={styles.streakNumber}>
            {`${streak.current}`}
          </Txt>
          <Txt variant="caption" color={colors.inkSoft}>
            current streak
          </Txt>
        </View>
        <View style={styles.streakDivider} />
        <View style={styles.streakCell}>
          <Txt variant="display" style={styles.streakNumber}>
            {`${streak.best}`}
          </Txt>
          <Txt variant="caption" color={colors.inkSoft}>
            best streak
          </Txt>
        </View>
      </View>
      {thisWeekBreaks.length > 0 ? (
        <Txt variant="caption" color={colors.danger} style={styles.streakBreaks}>
          {`Breaks in range: ${thisWeekBreaks.map(dateLabel).join(', ')}`}
        </Txt>
      ) : (
        <Txt variant="caption" color={colors.accent} style={styles.streakBreaks}>
          No breaks in range. Clean run.
        </Txt>
      )}
    </Card>
  );
}

function FunnelCard({ days }: { days: DayScore[] }) {
  const f = funnel(days);
  if (f.assigned === 0) {
    return (
      <ChartCard title="Completion funnel">
        <EmptyState
          title="Nothing assigned yet"
          body="Quests appear each morning; the funnel fills as you work through them."
        />
      </ChartCard>
    );
  }
  const rows = [
    { label: 'Assigned', value: f.assigned, color: colors.inkSoft },
    { label: 'Completed', value: f.completed, color: colors.accent },
    { label: 'Skipped', value: f.skipped, color: colors.gold },
  ];
  return (
    <ChartCard
      title="Completion funnel"
      subtitle={`${f.assigned > 0 ? Math.round((100 * f.completed) / f.assigned) : 0}% completion in range`}
    >
      {rows.map((row) => (
        <View key={row.label} style={styles.funnelRow}>
          <Txt variant="body" style={styles.funnelLabel}>
            {row.label}
          </Txt>
          <View style={styles.funnelTrack}>
            <View
              style={[
                styles.funnelFill,
                {
                  width: `${f.assigned > 0 ? (100 * row.value) / f.assigned : 0}%`,
                  backgroundColor: row.color,
                },
              ]}
            />
          </View>
          <Txt variant="bodySemi" style={styles.funnelValue}>
            {`${row.value}`}
          </Txt>
        </View>
      ))}
    </ChartCard>
  );
}

export function InsightsScreen() {
  useTheme();
  const [section, setSection] = useState<Section>('week');
  const [range, setRange] = useState(7);
  const gamification = useAppSelector((state) => state.gamification);

  const days90 = useScoresLastDays(90);
  const days7 = useScoresLastDays(7);
  const days14 = useScoresLastDays(14);
  const days30 = useScoresLastDays(30);
  const completions7 = useCompletionsRange(
    new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
  );
  const completionsToday = useCompletionsRange(
    new Date().toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
  );
  const streak = useStreakInfo();
  const aiInsights = useAiInsights();

  const allDays = days90.data ?? [];
  const todayRow = allDays[allDays.length - 1];
  const trendDays =
    range === 7 ? (days7.data ?? []) : range === 30 ? (days30.data ?? []) : allDays;

  const thisWeek = days7.data ?? [];
  const lastWeek = useMemo(() => {
    const rows = days14.data ?? [];
    return rows.slice(0, Math.max(0, rows.length - 7));
  }, [days14.data]);

  const weeklyPillarAvg = useMemo(() => pillarAverages(thisWeek), [thisWeek]);
  const lastWeekPillarAvg = useMemo(() => pillarAverages(lastWeek), [lastWeek]);
  const weeklyRadar = Object.fromEntries(
    weeklyPillarAvg.map((p) => [p.pillar, p.value]),
  ) as Record<Pillar, number>;
  const lastWeekRadar = Object.fromEntries(
    lastWeekPillarAvg.map((p) => [p.pillar, p.value]),
  ) as Record<Pillar, number>;
  const todayRadar: Partial<Record<Pillar, number>> = todayRow
    ? {
        health: todayRow.health,
        family: todayRow.family,
        work: todayRow.work,
        fun: todayRow.fun,
        spirituality: todayRow.spirituality,
      }
    : {};

  const hourHistogram = useMemo(
    () => completionHourHistogram(completionsToday.data ?? []),
    [completionsToday.data],
  );
  const histogramData = hourHistogram
    .map((count, hour) => ({ label: `${hour}`, value: count }))
    .filter((d) => d.value > 0);

  const weeklyDonut = useMemo(
    () =>
      effortShare(thisWeek, completions7.data ?? []).map((d) => ({
        key: d.pillar,
        value: d.count,
      })),
    [thisWeek, completions7.data],
  );

  // Stacked completions per pillar per day (from real completion rows).
  const stackedByDay = useMemo(() => {
    const byDate = new Map<string, Map<Pillar, number>>();
    for (const c of completions7.data ?? []) {
      const date = c.completed_at.slice(0, 10);
      const q = Array.isArray(c.quests) ? c.quests[0] : c.quests;
      if (!q?.pillar) continue;
      if (!byDate.has(date)) byDate.set(date, new Map());
      const m = byDate.get(date)!;
      m.set(q.pillar, (m.get(q.pillar) ?? 0) + 1);
    }
    return thisWeek.map((d) => {
      const m = byDate.get(d.date);
      return {
        label: dayLabel(d.date),
        value: d.completed,
        segments: PILLARS.map((p) => ({
          key: p as string,
          value: m?.get(p) ?? 0,
        })).filter((s) => s.value > 0),
      };
    });
  }, [completions7.data, thisWeek]);

  const weekdayPerf = useMemo(() => weekdayPerformance(allDays), [allDays]);
  const weekdayData = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
    (label, i) => ({ label, value: weekdayPerf[i] ?? 0 }),
  );

  const cumulativeXpSeries = useMemo(() => {
    let acc = 0;
    return (days30.data ?? []).map((d) => {
      acc += d.xp;
      return { label: dateLabel(d.date), value: acc, hint: `+${d.xp} that day` };
    });
  }, [days30.data]);

  const weekChange = wowChange(thisWeek, lastWeek);
  const monthChange = wowChange(days30.data ?? [], (days90.data ?? []).slice(0, 30));

  const loading =
    days90.isLoading || days7.isLoading || streak.isLoading;

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        Insights
      </Txt>

      <SegmentedControl<Section>
        options={SECTION_OPTIONS}
        value={section}
        onChange={setSection}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Skeleton height={160} style={styles.skeletonBlock} />
          <Skeleton height={160} style={styles.skeletonBlock} />
          <Skeleton height={160} style={styles.skeletonBlock} />
        </View>
      ) : null}

      {!loading && section === 'today' ? (
        <View style={styles.section}>
          <Card style={styles.scoreCard}>
            <Txt variant="label">Daily Life Score</Txt>
            <Txt variant="display" style={styles.bigScore}>
              {todayRow?.overall ?? 0}
            </Txt>
            <Txt variant="caption" color={colors.inkSoft}>
              {todayRow
                ? `${todayRow.completed} of ${todayRow.assigned} quests done today`
                : 'Complete a quest and your breakdown appears here.'}
            </Txt>
          </Card>

          <ChartCard title="Pillar balance, today">
            <RadarChart values={todayRadar} size={220} />
          </ChartCard>

          <ChartCard
            title="Completions by hour"
            subtitle="When you actually got things done today"
          >
            {histogramData.length > 0 ? (
              <BarChart data={histogramData} height={150} />
            ) : (
              <EmptyState
                title="No completions yet"
                body="Finish a quest and its hour lands here."
              />
            )}
          </ChartCard>
        </View>
      ) : null}

      {!loading && section === 'week' ? (
        <View style={styles.section}>
          <ChangeCard change={weekChange} period="week" />

          <ChartCard
            title="Pillar radar"
            subtitle="Today (solid), this week's average (dashed), last week (dotted area)"
          >
            <RadarChart
              values={todayRadar}
              overlays={[
                { values: weeklyRadar, color: colors.pillar.work },
                { values: lastWeekRadar, color: colors.inkFaint, fillOpacity: 0.05 },
              ]}
              size={220}
            />
          </ChartCard>

          <ChartCard title="Daily Life Score, 7 days">
            <LineChart
              data={thisWeek.map((d) => ({
                label: dayLabel(d.date),
                value: d.overall,
              }))}
              height={160}
              emptyLabel="No scores this week"
            />
          </ChartCard>

          <ChartCard title="XP per day" subtitle="Dashed line: the 500 XP daily cap">
            <BarChart
              data={thisWeek.map((d) => ({
                label: dayLabel(d.date),
                value: d.xp,
              }))}
              height={160}
              capLine={{ value: 500, label: '500 cap' }}
            />
          </ChartCard>

          <ChartCard title="Completions per pillar per day">
            <BarChart
              data={stackedByDay}
              height={160}
              emptyLabel="No completions this week"
            />
          </ChartCard>

          <ChartCard title="Effort share by pillar">
            <DonutChart
              data={weeklyDonut}
              centerLabel={`${weeklyDonut.reduce((s, d) => s + d.value, 0)} done`}
              emptyLabel="No completions this week"
            />
          </ChartCard>

          {streak.data ? <StreakCard streak={streak.data} days={thisWeek} /> : null}

          <FunnelCard days={thisWeek} />

          <ChartCard title="Coach insights">
            {(aiInsights.data ?? []).length > 0 ? (
              (aiInsights.data ?? []).map((insight, i) => (
                <View key={i} style={styles.insightCard}>
                  <Txt variant="bodySemi">{insight.pattern}</Txt>
                  <Txt variant="caption" color={colors.inkSoft} style={styles.insightBody}>
                    {insight.insight}
                  </Txt>
                  <Txt variant="caption" color={colors.accent}>
                    {insight.suggestion}
                  </Txt>
                  {i < (aiInsights.data ?? []).length - 1 ? (
                    <Hairline style={styles.insightRule} />
                  ) : null}
                </View>
              ))
            ) : (
              <EmptyState
                title="Patterns form over the week"
                body="Your coach studies the week's data every Sunday and writes its observations here."
              />
            )}
          </ChartCard>
        </View>
      ) : null}

      {!loading && section === 'month' ? (
        <View style={styles.section}>
          <ChangeCard change={monthChange} period="month" />

          <ChartCard title="Daily Life Score trend">
            <View style={styles.rangeRow}>
              {RANGE_OPTIONS.map((r) => (
                <Chip
                  key={r}
                  label={`${r} days`}
                  selected={range === r}
                  onPress={() => setRange(r)}
                />
              ))}
            </View>
            <LineChart
              data={trendDays.map((d) => ({
                label: dateLabel(d.date),
                value: d.overall,
              }))}
              height={170}
              emptyLabel="No scores in range"
            />
          </ChartCard>

          <ChartCard title="Consistency, 12 weeks">
            <Heatmap
              days={allDays.map((d) => ({ date: d.date, value: d.overall }))}
            />
          </ChartCard>

          <ChartCard
            title="Day-of-week performance"
            subtitle="Average score per weekday, all time in range"
          >
            <BarChart data={weekdayData} height={160} maxValue={100} />
          </ChartCard>

          <ChartCard
            title="Level journey"
            subtitle={`Level ${streak.data?.level ?? gamification.level}, ${titleForLevel(streak.data?.level ?? gamification.level)} · ${xpToNextLevel(streak.data?.totalXp ?? gamification.totalXp)} XP to next`}
          >
            <View style={styles.levelTrack}>
              <View
                style={[
                  styles.levelFill,
                  {
                    width: `${levelProgress(streak.data?.totalXp ?? gamification.totalXp) * 100}%`,
                  },
                ]}
              />
            </View>
            <LineChart
              data={cumulativeXpSeries}
              height={150}
              showAverage={false}
              emptyLabel="No XP yet this month"
            />
          </ChartCard>

          <FunnelCard days={days30.data ?? []} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
  },
  loadingWrap: {
    marginTop: spacing.xl,
  },
  skeletonBlock: {
    marginBottom: spacing.md,
  },
  scoreCard: {
    marginBottom: spacing.md,
  },
  bigScore: {
    fontSize: 48,
    lineHeight: 52,
    marginTop: spacing.sm,
  },
  chartCard: {
    marginBottom: spacing.md,
  },
  chartTitle: {
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  chartSubtitle: {
    marginBottom: spacing.md,
  },
  changeCard: {
    marginBottom: spacing.md,
  },
  changeValue: {
    fontSize: 40,
    lineHeight: 44,
    marginTop: spacing.xs,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  levelTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(colors.accent, 0.15),
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  levelFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakCell: {
    flex: 1,
    alignItems: 'center',
  },
  streakDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.line,
  },
  streakNumber: {
    fontSize: 34,
    lineHeight: 38,
  },
  streakBreaks: {
    marginTop: spacing.md,
  },
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  funnelLabel: {
    width: 84,
  },
  funnelTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.paperAlt,
    overflow: 'hidden',
  },
  funnelFill: {
    height: 10,
    borderRadius: 5,
  },
  funnelValue: {
    width: 40,
    textAlign: 'right',
  },
  insightCard: {
    marginBottom: spacing.xs,
  },
  insightBody: {
    marginVertical: spacing.xs,
  },
  insightRule: {
    marginTop: spacing.md,
  },
});

export default InsightsScreen;
