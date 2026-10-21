// Insights: a short, readable summary of the week or month. One headline
// number, a few plain-language takeaways, one trend chart and the pillar
// bars. Everything reads real data (daily_scores, gamification, ai_insights).

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Hairline from '../components/Hairline';
import PillarBar from '../components/PillarBar';
import Screen from '../components/Screen';
import SegmentedControl from '../components/SegmentedControl';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import LineChart from '../components/charts/LineChart';
import {
  pillarAverages,
  summarizePeriod,
  useAiInsights,
  useScoresLastDays,
  useStreakInfo,
  type DayScore,
  type PeriodSummary,
} from '../features/analytics/api';
import ShareStorySheet from '../features/share/ShareStorySheet';
import { titleForLevel } from '../lib/levels';
import { useAppSelector } from '../store/hooks';
import { colors, PILLAR_LABELS, radius, spacing, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Period = 'week' | 'month';
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function shortLabel(iso: string, period: Period): string {
  const d = new Date(`${iso}T12:00:00`);
  return period === 'week'
    ? d.toLocaleDateString(undefined, { weekday: 'short' })
    : `${d.getMonth() + 1}/${d.getDate()}`;
}

function verdict(s: PeriodSummary, period: Period): string {
  if (s.activeDays === 0) {
    return `No quests finished ${period === 'week' ? 'this week' : 'this month'} yet. One small quest today gets things moving.`;
  }
  if (s.prevAvgScore === null) {
    return 'Your first stretch on the books. Keep showing up and the comparisons appear here.';
  }
  const diff = s.avgScore - s.prevAvgScore;
  if (diff >= 5) return `Better than last ${period}. Whatever you changed, it is working.`;
  if (diff <= -5) return `A bit lower than last ${period}. Pick your easiest quest today and build from there.`;
  return `Steady compared with last ${period}. Consistency is how habits stick.`;
}

function takeaways(s: PeriodSummary, period: Period): string[] {
  const out: string[] = [];
  if (s.totalDays > 0) {
    out.push(`You showed up on ${s.activeDays} of ${s.totalDays} days and finished ${s.completionRate}% of your quests.`);
  }
  if (s.strongest) {
    out.push(`${PILLAR_LABELS[s.strongest.pillar]} is your strongest pillar (${s.strongest.value}/100).`);
  }
  if (s.weakest) {
    out.push(
      `${PILLAR_LABELS[s.weakest.pillar]} needs the most love (${s.weakest.value}/100). One ${PILLAR_LABELS[s.weakest.pillar].toLowerCase()} quest tomorrow makes a difference.`,
    );
  }
  if (period === 'month' && s.bestWeekday !== null) {
    out.push(`${WEEKDAYS[s.bestWeekday]} is usually your best day.`);
  }
  return out;
}

function Headline({ s, period }: { s: PeriodSummary; period: Period }) {
  const diff = s.prevAvgScore === null ? null : s.avgScore - s.prevAvgScore;
  const up = diff !== null && diff >= 0;
  return (
    <Card style={styles.card}>
      <Txt variant="label" color={colors.inkSoft}>
        {period === 'week' ? 'Average score this week' : 'Average score this month'}
      </Txt>
      <View style={styles.headlineRow}>
        <Txt variant="display" style={styles.bigNumber}>
          {`${s.avgScore}`}
        </Txt>
        {diff !== null ? (
          <View
            style={[
              styles.changePill,
              { backgroundColor: withAlpha(up ? colors.accent : colors.danger, 0.12) },
            ]}
          >
            <Txt variant="bodySemi" color={up ? colors.accent : colors.danger}>
              {`${up ? '▲' : '▼'} ${Math.abs(diff)} vs last ${period}`}
            </Txt>
          </View>
        ) : null}
      </View>
      <Txt variant="body" color={colors.inkSoft}>
        {verdict(s, period)}
      </Txt>
    </Card>
  );
}

function Takeaways({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Txt variant="heading" style={styles.cardTitle}>
        What stands out
      </Txt>
      {items.map((t, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: colors.accent }]} />
          <Txt variant="body" style={styles.bulletText}>
            {t}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

function Pillars({ days }: { days: DayScore[] }) {
  const avgs = pillarAverages(days.filter((d) => d.assigned > 0)).sort((a, b) => b.value - a.value);
  return (
    <Card style={styles.card}>
      <Txt variant="heading" style={styles.cardTitle}>
        Your pillars
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.cardSubtitle}>
        Average score per pillar, highest first
      </Txt>
      {avgs.map((p) => (
        <PillarBar key={p.pillar} pillar={p.pillar} value={p.value} />
      ))}
    </Card>
  );
}

function Momentum({ streak, best, level }: { streak: number; best: number; level: number }) {
  return (
    <Card style={styles.card}>
      <View style={styles.statsRow}>
        <Stat value={`${streak}`} label="day streak" color={colors.gold} />
        <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
        <Stat value={`${best}`} label="best streak" />
        <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
        <Stat value={`${level}`} label={titleForLevel(level)} />
      </View>
    </Card>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="display" color={color} style={styles.statValue}>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.inkSoft} align="center" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

export function InsightsScreen() {
  useTheme();
  const [period, setPeriod] = useState<Period>('week');
  const [shareOpen, setShareOpen] = useState(false);
  const gamification = useAppSelector((state) => state.gamification);

  // Two periods of data each, so we can compare with the previous one.
  const days14 = useScoresLastDays(14);
  const days60 = useScoresLastDays(60);
  const streak = useStreakInfo();
  const aiInsights = useAiInsights();

  const { current, previous } = useMemo(() => {
    const len = period === 'week' ? 7 : 30;
    const rows = (period === 'week' ? days14.data : days60.data) ?? [];
    const today = new Date();
    const cutoff = new Date(today.getTime() - (len - 1) * 86400000).toISOString().slice(0, 10);
    return {
      current: rows.filter((d) => d.date >= cutoff),
      previous: rows.filter((d) => d.date < cutoff),
    };
  }, [period, days14.data, days60.data]);

  const weekSummary = useMemo(() => {
    const rows = days14.data ?? [];
    const cutoff = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    return summarizePeriod(rows.filter((d) => d.date >= cutoff), []);
  }, [days14.data]);

  const summary = useMemo(() => summarizePeriod(current, previous), [current, previous]);
  const items = takeaways(summary, period);
  const coach = (aiInsights.data ?? []).slice(0, 2);

  const loading = days14.isLoading || (period === 'month' && days60.isLoading);
  const level = streak.data?.level ?? gamification.level;

  return (
    <Screen scroll>
      <View style={styles.titleRow}>
        <Txt variant="title">Insights</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share your progress as a story"
          onPress={() => setShareOpen(true)}
          style={({ pressed }) => [
            styles.sharePill,
            { borderColor: colors.accent, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Txt variant="bodySemi" color={colors.accent}>
            Share
          </Txt>
        </Pressable>
      </View>

      <SegmentedControl<Period> options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />

      {loading ? (
        <View style={styles.section}>
          <Skeleton height={140} style={styles.card} />
          <Skeleton height={160} style={styles.card} />
          <Skeleton height={180} style={styles.card} />
        </View>
      ) : (
        <View style={styles.section}>
          <Headline s={summary} period={period} />
          <Takeaways items={items} />

          <Card style={styles.card}>
            <Txt variant="heading" style={styles.cardTitle}>
              Your score, day by day
            </Txt>
            <Txt variant="caption" color={colors.inkFaint} style={styles.cardSubtitle}>
              Tap a point to see the exact score. The dashed line is your average.
            </Txt>
            <LineChart
              data={current.map((d) => ({ label: shortLabel(d.date, period), value: d.overall }))}
              height={170}
              emptyLabel="No scores yet"
            />
          </Card>

          <Pillars days={current} />

          <Momentum
            streak={streak.data?.current ?? gamification.currentStreak}
            best={streak.data?.best ?? 0}
            level={level}
          />

          <Card style={styles.card}>
            <Txt variant="heading" style={styles.cardTitle}>
              From your coach
            </Txt>
            {coach.length > 0 ? (
              coach.map((insight, i) => (
                <View key={i}>
                  <Txt variant="bodySemi">{insight.pattern}</Txt>
                  <Txt variant="body" color={colors.inkSoft} style={styles.coachBody}>
                    {insight.insight}
                  </Txt>
                  <Txt variant="body" color={colors.accent}>
                    {insight.suggestion}
                  </Txt>
                  {i < coach.length - 1 ? <Hairline style={styles.coachRule} /> : null}
                </View>
              ))
            ) : (
              <EmptyState
                title="Notes arrive on Sunday"
                body="Your coach reads the week's data and writes a few plain observations here."
              />
            )}
          </Card>

          <Button title="Share my progress as a story" onPress={() => setShareOpen(true)} />
        </View>
      )}

      <ShareStorySheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        weekAvg={weekSummary.activeDays > 0 ? weekSummary.avgScore : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  sharePill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    marginBottom: spacing.md,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  bigNumber: {
    fontSize: 52,
    lineHeight: 58,
    marginRight: spacing.md,
  },
  changePill: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 9,
    marginRight: spacing.sm,
  },
  bulletText: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 30,
    lineHeight: 36,
  },
  statDivider: {
    width: 1,
    height: 36,
  },
  coachBody: {
    marginVertical: spacing.xs,
  },
  coachRule: {
    marginVertical: spacing.md,
  },
});

export default InsightsScreen;
