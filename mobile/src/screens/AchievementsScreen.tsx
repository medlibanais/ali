import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import BadgeMedallion from '../components/BadgeMedallion';
import Card from '../components/Card';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import type { Achievement, Rarity } from '../api/types';
import { pluralize } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAppDispatch } from '../store/hooks';
import { fetchAllBadges } from '../store/slices/gamificationSlice';
import { colors, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface TitleProgress {
  title_id: string;
  name: string;
  kind: 'level' | 'pillar';
  pillar: string | null;
  description: string;
  progress: number;
  target: number;
  unlocked_at: string | null;
}

const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

function formatUnlockDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function AchievementsSkeleton() {
  return (
    <View>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={72} style={styles.skeletonBlock} />
      ))}
    </View>
  );
}

export function AchievementsScreen() {
  useTheme();
  const dispatch = useAppDispatch();
  const [badges, setBadges] = useState<Achievement[] | null>(null);
  const [titles, setTitles] = useState<TitleProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // Full catalog from the server (all 15 badges, FR-4.2) + titles (FR-4.3).
    Promise.all([
      dispatch(fetchAllBadges()).unwrap(),
      supabase.rpc('title_progress'),
    ])
      .then(([catalog, titleRes]) => {
        if (!mounted) return;
        setBadges(catalog);
        setTitles((titleRes.data ?? []) as TitleProgress[]);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setBadges([]);
        setError(typeof e === 'string' ? e : 'Could not load achievements.');
      });
    return () => {
      mounted = false;
    };
  }, [dispatch]);

  const list = badges ?? [];
  const unlockedCount = list.filter((b) => b.unlocked_at).length;
  const levelTitles = titles.filter((t) => t.kind === 'level');
  const pillarTitles = titles.filter((t) => t.kind === 'pillar');
  const currentTitle = [...levelTitles].reverse().find((t) => t.unlocked_at);
  const nextTitle = levelTitles.find((t) => !t.unlocked_at);

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        Achievements
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.subtitle}>
        {error ?? `${unlockedCount} of ${list.length} unlocked`}
      </Txt>

      {badges === null ? (
        <AchievementsSkeleton />
      ) : (
        <>
          {titles.length > 0 ? (
            <>
              <Txt variant="label" style={styles.sectionLabel}>
                Titles
              </Txt>
              <Card style={styles.titlesCard}>
                <Txt variant="heading">{currentTitle?.name ?? 'Novice'}</Txt>
                <Txt variant="caption" color={colors.inkFaint} style={styles.rowDetail}>
                  {nextTitle
                    ? `Next: ${nextTitle.name} at level ${nextTitle.target} (${pluralize(
                        Math.max(0, nextTitle.target - nextTitle.progress),
                        'level',
                      )} to go)`
                    : 'Every level title unlocked.'}
                </Txt>
                {pillarTitles.map((t) => (
                  <View key={t.title_id} style={styles.titleRow}>
                    <View style={styles.rowHeader}>
                      <Txt
                        variant="bodySemi"
                        color={t.unlocked_at ? colors.gold : colors.inkSoft}
                      >
                        {t.name}
                      </Txt>
                      <Txt variant="caption" color={colors.inkFaint}>
                        {t.unlocked_at
                          ? `Unlocked ${formatUnlockDate(t.unlocked_at)}`
                          : progressLabel(t)}
                      </Txt>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${Math.round((100 * t.progress) / t.target)}%` },
                        ]}
                      />
                    </View>
                    <Txt variant="caption" color={colors.inkFaint}>
                      {t.description}
                    </Txt>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <Txt variant="label" style={styles.sectionLabel}>
            Badges
          </Txt>
          <Card padded={false}>
            {list.map((badge, index) => {
              const unlocked = Boolean(badge.unlocked_at);
              return (
                <View key={badge.badge_id}>
                  {index > 0 ? <Hairline /> : null}
                  <View style={styles.row}>
                    <BadgeMedallion
                      badgeId={badge.badge_id}
                      rarity={badge.rarity}
                      unlocked={unlocked}
                      size={56}
                    />
                    <View style={styles.rowBody}>
                      <View style={styles.rowHeader}>
                        <Txt
                          variant="bodySemi"
                          color={unlocked ? colors.ink : colors.inkSoft}
                        >
                          {badge.badge_name}
                        </Txt>
                        <Txt variant="caption" color={colors.inkFaint}>
                          {RARITY_LABELS[badge.rarity]}
                        </Txt>
                      </View>
                      <Txt
                        variant="caption"
                        color={unlocked ? colors.gold : colors.inkFaint}
                        style={styles.rowDetail}
                      >
                        {badge.unlocked_at
                          ? `Unlocked ${formatUnlockDate(badge.unlocked_at)}`
                          : `${badge.description}${badge.xp_reward ? ` +${badge.xp_reward} XP` : ''}`}
                      </Txt>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

function progressLabel(t: TitleProgress): string {
  if (t.title_id === 'deep_worker') {
    return `${Math.floor(t.progress / 60)} / ${t.target / 60} h`;
  }
  return `${t.progress} / ${t.target}`;
}

const styles = themed(() =>
  StyleSheet.create({
  title: {
    marginTop: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  rowBody: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDetail: {
    marginTop: spacing.xs,
  },
  skeletonBlock: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
  },
  titlesCard: {
    marginBottom: spacing.xl,
  },
  titleRow: {
    marginTop: spacing.lg,
  },
  track: {
    height: 4,
    borderRadius: 2,
    marginVertical: spacing.xs,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: colors.gold,
  },
  }),
);

export default AchievementsScreen;
