// Insights: a short, readable summary of the week or month. One headline
// number, a few plain-language takeaways, one trend chart and the pillar
// bars. Everything reads real data (daily_scores, gamification, ai_insights).

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Button from '../components/Button';
import Accordion from '../components/Accordion';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Hairline from '../components/Hairline';
import PillarBar from '../components/PillarBar';
import Screen from '../components/Screen';
import SegmentedControl from '../components/SegmentedControl';
import Skeleton from '../components/Skeleton';
import { InsightsSkeleton } from '../components/ScreenSkeletons';
import Txt from '../components/Txt';
import LineChart from '../components/charts/LineChart';
import TimeOfDayHistogram from '../components/charts/TimeOfDayHistogram';
import YearHeatmap from '../components/charts/YearHeatmap';
import StreakGauge from '../components/charts/StreakGauge';
import { PillarGlyph, ShareGlyph, SparklesGlyph } from '../components/icons';
import {
  pillarAverages,
  summarizePeriod,
  useAiInsights,
  useScoresLastDays,
  useStreakInfo,
  type DayScore,
  type PeriodSummary,
} from '../features/analytics/api';
import {
  explainPrediction,
  predictionA11yLabel,
  useStreakPrediction,
} from '../features/analytics/streakPrediction';
import {
  timeOfDayBins,
  usePatternInsights,
  usePatterns,
  type BehavioralPatterns,
  type PatternInsight,
} from '../features/analytics/patterns';
import { todayInTimezone, useYearXp } from '../features/analytics/yearHeatmap';
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

// Predicted chance of completing a quest tomorrow (server, hourly).
function StreakOutlook() {
  const userId = useAppSelector((state) => state.auth.userId);
  const prediction = useStreakPrediction(userId);
  const p = prediction.data;
  return (
    <Card style={styles.card}>
      <Txt variant="heading" style={styles.cardTitle}>
        Streak outlook
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.cardSubtitle}>
        Chance you complete at least one quest tomorrow. Updated every hour.
      </Txt>
      {prediction.isError ? (
        <EmptyState
          title="Could not load your outlook"
          body="Check your connection and open Insights again."
        />
      ) : p ? (
        <View accessible accessibilityRole="summary" accessibilityLabel={predictionA11yLabel(p)}>
          <StreakGauge probability={p.probability} />
          <View style={styles.outlookNotes}>
            {explainPrediction(p).map((line) => (
              <Txt key={line} variant="caption" color={colors.inkSoft} align="center">
                {line}
              </Txt>
            ))}
          </View>
        </View>
      ) : (
        <Skeleton height={220} />
      )}
    </Card>
  );
}

function FactPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={[styles.factPill, { borderColor: withAlpha(color, 0.45), backgroundColor: withAlpha(color, 0.1) }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
        {label}
      </Txt>
      <Txt variant="bodySemi" color={color} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

function PatternFacts({ p }: { p: BehavioralPatterns }) {
  const facts: { label: string; value: string; color: string }[] = [];
  if (p.skip_weekday_name) {
    facts.push({
      label: 'Most skipped',
      value: p.skip_top_pillar
        ? `${p.skip_weekday_name} · ${PILLAR_LABELS[p.skip_top_pillar]}`
        : p.skip_weekday_name,
      color: colors.danger,
    });
  }
  if (p.neglected_pillar) {
    facts.push({
      label: 'Needs love (14 days)',
      value: PILLAR_LABELS[p.neglected_pillar],
      color: colors.pillar[p.neglected_pillar],
    });
  }
  if (facts.length === 0) return null;
  return (
    <View style={styles.factRow}>
      {facts.map((f) => (
        <FactPill key={f.label} {...f} />
      ))}
    </View>
  );
}

function InsightRow({ insight }: { insight: PatternInsight }) {
  const pillarMatch = (['health', 'family', 'work', 'fun', 'spirituality'] as const).find((p) =>
    insight.observation.toLowerCase().includes(p),
  );
  return (
    <View style={styles.insightRow}>
      <View style={[styles.insightIcon, { backgroundColor: withAlpha(colors.accent, 0.12) }]}>
        {pillarMatch ? (
          <PillarGlyph pillar={pillarMatch} size={16} />
        ) : (
          <SparklesGlyph size={16} />
        )}
      </View>
      <View style={styles.insightText}>
        <Txt variant="bodySemi">{insight.observation}</Txt>
        <Txt variant="body" color={colors.accent} style={styles.insightSuggestion}>
          {insight.suggestion}
        </Txt>
      </View>
    </View>
  );
}

// Behavioral patterns: when quests get done, which day slips, which
// pillar is quiet, plus 2 AI insights. Independent of the week/month switch.
function Patterns() {
  const userId = useAppSelector((state) => state.auth.userId);
  const patterns = usePatterns(userId);
  const insights = usePatternInsights(patterns.data ? userId : null);
  const p = patterns.data ?? null;

  return (
    <Card style={styles.card}>
      <Txt variant="heading" style={styles.cardTitle}>
        Your patterns
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.cardSubtitle}>
        When you finish quests, last 8 weeks in your timezone. Tap a bar for details.
      </Txt>
      {patterns.isError ? (
        <EmptyState
          title="Could not load your patterns"
          body="Check your connection and open Insights again."
        />
      ) : !p ? (
        <Skeleton height={214} />
      ) : (
        <>
          <TimeOfDayHistogram bins={timeOfDayBins(p)} />
          <PatternFacts p={p} />
          <Hairline style={styles.coachRule} />
          <Txt variant="label" color={colors.inkSoft} style={styles.noticedTitle}>
            What we noticed
          </Txt>
          {insights.isLoading ? (
            <View>
              <Skeleton height={18} style={styles.skelLine} />
              <Skeleton height={18} width="70%" style={styles.skelLine} />
              <Skeleton height={18} style={styles.skelLine} />
              <Skeleton height={18} width="60%" />
            </View>
          ) : insights.data && insights.data.insights.length > 0 ? (
            insights.data.insights.map((ins) => <InsightRow key={ins.kind} insight={ins} />)
          ) : insights.data?.status === 'not_enough_data' ? (
            <Txt variant="body" color={colors.inkSoft}>
              A few more days of quests and patterns start to show here.
            </Txt>
          ) : (
            <Txt variant="body" color={colors.inkSoft}>
              Insights are not available right now. Your chart above is up to date.
            </Txt>
          )}
        </>
      )}
    </Card>
  );
}

// The last 365 days of XP. Independent of the week/month switch above.
function YearOfActivity() {
  const userId = useAppSelector((state) => state.auth.userId);
  const timezone = useAppSelector((state) => state.user.profile?.timezone ?? null);
  const today = todayInTimezone(timezone);
  const year = useYearXp(userId, today);
  return (
    <Card style={styles.card}>
      <Txt variant="heading" style={styles.cardTitle}>
        Your year
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.cardSubtitle}>
        XP earned each day for the last 365 days. Tap a day for details.
      </Txt>
      {year.isError ? (
        <EmptyState
          title="Could not load your year"
          body="Check your connection and open Insights again."
        />
      ) : year.data ? (
        <YearHeatmap days={year.data} today={today} />
      ) : (
        <Skeleton height={150} />
      )}
    </Card>
  );
}

function Momentum({ streak, best, level }: { streak: number; best: number; level: number }) {
  return (
    <Accordion
      title="Momentum"
      summary={`${streak}-day streak · best ${best} · level ${level}`}
      style={styles.card}
    >
      <View style={styles.statsRow}>
        <Stat value={`${streak}`} label="day streak" color={colors.gold} />
        <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
        <Stat value={`${best}`} label="best streak" />
        <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
        <Stat value={`${level}`} label={titleForLevel(level)} />
      </View>
    </Accordion>
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
          <InsightsSkeleton />
        </View>
      ) : (
        <View style={styles.section}>
          <Headline s={summary} period={period} />
          <Takeaways items={items} />

          <StreakOutlook />

          <Patterns />

          <Pillars days={current} />

          <YearOfActivity />

          <Accordion
            title="Your score, day by day"
            summary="Daily scores against your average"
            style={styles.card}
          >
            <Txt variant="caption" color={colors.inkFaint} style={styles.cardSubtitle}>
              Tap a point to see the exact score. The dashed line is your average.
            </Txt>
            <LineChart
              data={current.map((d) => ({ label: shortLabel(d.date, period), value: d.overall }))}
              height={170}
              emptyLabel="No scores yet"
            />
          </Accordion>

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

          <Button
            title="Share my progress as a story"
            winTitle="Show it off"
            icon={ShareGlyph}
            onPress={() => setShareOpen(true)}
          />
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
  outlookNotes: {
    marginTop: spacing.md,
    gap: spacing.xs,
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
  factRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  factPill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.sm,
    marginTop: spacing.xs,
  },
  noticedTitle: {
    marginBottom: spacing.xs,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  insightIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  insightText: {
    flex: 1,
  },
  insightSuggestion: {
    marginTop: 2,
  },
  skelLine: {
    marginBottom: spacing.xs,
  },
});

export default InsightsScreen;
