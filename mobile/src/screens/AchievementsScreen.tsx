import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import BadgeMedallion from '../components/BadgeMedallion';
import Card from '../components/Card';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import type { Rarity } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchGamification } from '../store/slices/gamificationSlice';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface BadgeDefinition {
  badgeId: string;
  name: string;
  rarity: Rarity;
  condition: string;
}

const BADGES: BadgeDefinition[] = [
  {
    badgeId: 'first_step',
    name: 'First Step',
    rarity: 'common',
    condition: 'Complete your first quest.',
  },
  {
    badgeId: 'week_warrior',
    name: 'Week Warrior',
    rarity: 'uncommon',
    condition: 'Hold a 7 day streak.',
  },
  {
    badgeId: 'perfect_day',
    name: 'Perfect Day',
    rarity: 'uncommon',
    condition: 'Reach a 100% daily score.',
  },
  {
    badgeId: 'prayer_master',
    name: 'Prayer Master',
    rarity: 'rare',
    condition: 'Complete 30 prayers in a month.',
  },
  {
    badgeId: 'fitness_fanatic',
    name: 'Fitness Fanatic',
    rarity: 'rare',
    condition: 'Complete 50 workouts in a month.',
  },
  {
    badgeId: 'family_first',
    name: 'Family First',
    rarity: 'rare',
    condition: 'Call your parents weekly for 8 weeks.',
  },
  {
    badgeId: 'knowledge_seeker',
    name: 'Knowledge Seeker',
    rarity: 'epic',
    condition: 'Log 100 hours of deep work.',
  },
  {
    badgeId: 'iron_mind',
    name: 'Iron Mind',
    rarity: 'epic',
    condition: 'Reach level 50.',
  },
  {
    badgeId: 'legend',
    name: 'Legend',
    rarity: 'legendary',
    condition: 'Reach level 100.',
  },
];

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
  const { achievements, loading } = useAppSelector(
    (state) => state.gamification,
  );

  useEffect(() => {
    dispatch(fetchGamification());
  }, [dispatch]);

  const unlockedById = new Map(
    achievements.map((a) => [a.badge_id, a]),
  );
  const unlockedCount = BADGES.filter((b) =>
    unlockedById.has(b.badgeId),
  ).length;

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        Achievements
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.subtitle}>
        {`${unlockedCount} of ${BADGES.length} unlocked`}
      </Txt>

      {loading && achievements.length === 0 ? (
        <AchievementsSkeleton />
      ) : (
        <Card padded={false}>
          {BADGES.map((badge, index) => {
            const unlocked = unlockedById.get(badge.badgeId);
            return (
              <View key={badge.badgeId}>
                {index > 0 ? <Hairline /> : null}
                <View style={styles.row}>
                  <BadgeMedallion
                    badgeId={badge.badgeId}
                    rarity={badge.rarity}
                    unlocked={Boolean(unlocked)}
                    size={56}
                  />
                  <View style={styles.rowBody}>
                    <View style={styles.rowHeader}>
                      <Txt
                        variant="bodySemi"
                        color={unlocked ? colors.ink : colors.inkSoft}
                      >
                        {badge.name}
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
                      {unlocked?.unlocked_at
                        ? `Unlocked ${formatUnlockDate(unlocked.unlocked_at)}`
                        : badge.condition}
                    </Txt>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});

export default AchievementsScreen;
