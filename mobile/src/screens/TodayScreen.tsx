import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sanitizeAvatarConfig } from '../avatar/types';
import { VALID_OPTION_IDS } from '../avatar/options';
import Card from '../components/Card';
import ConfettiLite from '../components/ConfettiLite';
import EmptyState from '../components/EmptyState';
import Hairline from '../components/Hairline';
import PillarBar from '../components/PillarBar';
import PillarOrbit from '../components/PillarOrbit';
import type { PillarId } from '../components/PillarBubble';
import QuestRow from '../components/QuestRow';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { PillarGlyph } from '../components/icons';
import type { Quest } from '../api/types';
import { useRedeemInvite } from '../features/friends/api';
import { bestStreakLabel, pluralize, streakLabel } from '../lib/format';
import { registerDeviceForPush } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import type { AppStackParamList, MainTabParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setPendingInviteCode } from '../store/slices/authSlice';
import { fetchProfile } from '../store/slices/userSlice';
import {
  completeQuest,
  drainCompletionQueue,
  fetchDailyQuests,
  undoQuest,
} from '../store/slices/questsSlice';
import {
  fetchGamification,
  titleForLevel,
} from '../store/slices/gamificationSlice';
import {
  colors,
  PILLAR_LABELS,
  PILLARS,
  Pillar,
  spacing,
  themed,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Today'>,
  NativeStackScreenProps<AppStackParamList>
>;

function greeting(firstName: string | null | undefined): string {
  const hour = new Date().getHours();
  const part =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${part}, ${firstName}.` : `${part}.`;
}

function dateLine(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function TodaySkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton width={120} height={120} borderRadius={60} style={styles.skeletonCenter} />
      <Skeleton width={220} height={24} style={styles.skeletonCenter} />
      <Skeleton width={200} height={200} borderRadius={100} style={styles.skeletonCenter} />
      <Skeleton height={150} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
    </View>
  );
}

export function TodayScreen({ navigation }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { profile } = useAppSelector((state) => state.user);
  const questsState = useAppSelector((state) => state.quests);
  const gamification = useAppSelector((state) => state.gamification);
  const [confetti, setConfetti] = useState<{
    key: number;
    color: string;
  } | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<PillarId | null>(null);

  const initialLoading =
    questsState.loading && questsState.date === null;

  const load = useCallback(
    (silent: boolean) => {
      dispatch(fetchProfile());
      dispatch(fetchDailyQuests({ silent }));
      dispatch(fetchGamification());
    },
    [dispatch],
  );

  useEffect(() => {
    load(false);
    // Replay any completions queued while offline.
    dispatch(drainCompletionQueue()).then((result) => {
      const synced = (result.payload as { synced: number } | undefined)?.synced ?? 0;
      if (synced > 0) {
        toast.showToast({
          message: `Back online — synced ${synced} offline ${synced === 1 ? 'completion' : 'completions'}.`,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Redeem a pending invite code (deep link / register flow) exactly once.
  const pendingInvite = useAppSelector((state) => state.auth.pendingInviteCode);
  const redeemInvite = useRedeemInvite();
  useEffect(() => {
    if (!pendingInvite) return;
    let cancelled = false;
    redeemInvite
      .mutateAsync(pendingInvite)
      .then((result) => {
        if (cancelled) return;
        if (result.redeemed) {
          toast.showToast({
            message: 'Invite accepted — you are now connected.',
          });
        }
        dispatch(setPendingInviteCode(null));
      })
      .catch(() => {
        if (!cancelled) dispatch(setPendingInviteCode(null));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite]);

  // Push registration is best-effort and silent.
  useEffect(() => {
    registerDeviceForPush().catch(() => undefined);
  }, []);

  const onRefresh = useCallback(() => {
    load(true);
  }, [load]);

  const confirmFreeze = () => {
    Alert.alert(
      'Freeze your streak?',
      'Today counts as protected even without a completion. One freeze per week.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Freeze',
          onPress: async () => {
            const { error } = await supabase.rpc('use_streak_freeze');
            if (error) {
              const msg = error.message.includes('freeze_already_used')
                ? 'You already used this week\'s freeze.'
                : error.message.includes('already_active_today')
                  ? 'You are already active today — no freeze needed.'
                  : 'Could not freeze the streak right now.';
              toast.showToast({ message: msg });
            } else {
              toast.showToast({
                message: 'Streak frozen for today. Back at it tomorrow.',
              });
            }
          },
        },
      ],
    );
  };

  const handleComplete = async (quest: Quest) => {
    const result = await dispatch(completeQuest(quest));
    if (completeQuest.fulfilled.match(result)) {
      const xp = result.payload.xp_awarded;
      const questId = result.payload.quest_id;
      setConfetti({ key: Date.now(), color: colors.pillar[quest.pillar] });
      toast.showToast({
        message: `+${xp} XP. ${quest.title} is done.`,
        actionLabel: 'Undo',
        countdownSeconds: 10,
        durationMs: 10000,
        onAction: () => {
          dispatch(undoQuest(questId));
        },
      });
      if (result.payload.level_up) {
        dispatch(fetchGamification());
      }
    } else {
      toast.showToast({
        message: result.payload?.message ?? 'Could not complete this quest.',
      });
    }
  };

  const openQuest = (quest: Quest) => {
    navigation.navigate('QuestDetail', { quest });
  };

  const score = questsState.dailyLifeScore;
  const activeQuests = questsState.quests.filter((q) => !q.skipped);
  const avatarConfig = sanitizeAvatarConfig(
    profile?.avatar_config,
    VALID_OPTION_IDS,
  );
  const orbitScores: Record<PillarId, number> = {
    health: questsState.pillarScores.health ?? 0,
    family: questsState.pillarScores.family ?? 0,
    work: questsState.pillarScores.work ?? 0,
    fun: questsState.pillarScores.fun ?? 0,
    spirituality: questsState.pillarScores.spirituality ?? 0,
  };
  const grouped: { pillar: Pillar; items: Quest[] }[] = PILLARS.map(
    (pillar) => ({
      pillar,
      items: activeQuests
        .filter((q) => q.pillar === pillar)
        .sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1)),
    }),
  ).filter((group) => group.items.length > 0);

  const visibleGroups =
    expandedPillar === null
      ? []
      : grouped.filter((g) => g.pillar === expandedPillar);

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={questsState.refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {initialLoading ? (
        <TodaySkeleton />
      ) : (
        <>
          <View style={styles.header}>
            <Txt variant="title">{greeting(profile?.first_name)}</Txt>
            <Txt variant="caption" color={colors.inkFaint}>
              {dateLine()}
            </Txt>
            <Txt variant="body" color={colors.inkSoft} style={styles.scoreLine}>
              {`Life score ${Math.round(score)} · ${pluralize(gamification.currentStreak, 'day')} streak`}
            </Txt>
          </View>

          <View style={styles.orbitWrap}>
            <PillarOrbit
              avatarConfig={avatarConfig}
              scores={orbitScores}
              expandedPillar={expandedPillar}
              onPillarPress={(id) =>
                setExpandedPillar((cur) => (cur === id ? null : id))
              }
            />
          </View>

          <Card style={styles.statsCard} padded={false}>
            <View style={styles.statRow}>
              <View style={styles.statCell}>
                <Txt variant="label">Streak</Txt>
                <Txt variant="heading" color={colors.gold} style={styles.statValue}>
                  {streakLabel(gamification.currentStreak)}
                </Txt>
                <Txt variant="caption" color={colors.inkFaint}>
                  {bestStreakLabel(gamification.bestStreak)}
                </Txt>
                {gamification.currentStreak > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Use a streak freeze"
                    onPress={confirmFreeze}
                    style={({ pressed }) => [
                      styles.freezeChip,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Txt variant="caption" color={colors.accent}>
                      Freeze (1/week)
                    </Txt>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Txt variant="label">Level</Txt>
                <Txt variant="heading" style={styles.statValue}>
                  {`${gamification.level}, ${gamification.currentTitle ?? titleForLevel(gamification.level)}`}
                </Txt>
              </View>
            </View>
          </Card>

          <Card style={styles.pillarCard}>
            <Txt variant="label" style={styles.cardLabel}>
              Pillars today
            </Txt>
            {PILLARS.map((pillar) => (
              <PillarBar
                key={pillar}
                pillar={pillar}
                value={questsState.pillarScores[pillar] ?? 0}
              />
            ))}
          </Card>

          {expandedPillar === null ? (
            <Txt
              variant="body"
              color={colors.inkFaint}
              align="center"
              style={styles.hint}
            >
              Tap a pillar to see today&apos;s quests.
            </Txt>
          ) : (
            <>
              <View style={styles.questHeader}>
                <Txt variant="label">
                  {`Today's ${PILLAR_LABELS[expandedPillar].toLowerCase()} quests`}
                </Txt>
                <Txt variant="caption" color={colors.inkFaint}>
                  {`${activeQuests.filter((q) => q.pillar === expandedPillar && q.completed).length} of ${activeQuests.filter((q) => q.pillar === expandedPillar).length} done`}
                </Txt>
              </View>

              {visibleGroups.length === 0 ? (
                <EmptyState
                  title={`No ${PILLAR_LABELS[expandedPillar].toLowerCase()} quests today`}
                  body="This pillar has no quests scheduled today. Another pillar might."
                />
              ) : (
                visibleGroups.map((group) => {
                  const done = group.items.filter((q) => q.completed).length;
                  return (
                    <View key={group.pillar} style={styles.group}>
                      <View style={styles.groupHeader}>
                        <PillarGlyph pillar={group.pillar} size={18} />
                        <Txt variant="bodySemi" style={styles.groupTitle}>
                          {PILLAR_LABELS[group.pillar]}
                        </Txt>
                        <Txt variant="caption" color={colors.inkFaint}>
                          {`${done} of ${group.items.length}`}
                        </Txt>
                      </View>
                      {group.items.map((quest) => (
                        <QuestRow
                          key={quest.quest_id}
                          quest={quest}
                          onPress={openQuest}
                        />
                      ))}
                    </View>
                  );
                })
              )}
            </>
          )}

          {questsState.error ? (
            <Txt variant="caption" color={colors.danger} style={styles.error}>
              {questsState.error}
            </Txt>
          ) : null}

          <Hairline style={styles.footerRule} />
          <Txt
            variant="caption"
            color={colors.inkFaint}
            align="center"
            style={styles.footerNote}
          >
            Pull down to refresh your day.
          </Txt>
        </>
      )}

      {confetti ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ConfettiLite
            visible
            accentColor={confetti.color}
            onDone={() => setConfetti(null)}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  header: {
    marginTop: spacing.lg,
  },
  scoreLine: {
    marginTop: spacing.sm,
  },
  orbitWrap: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  hint: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  statsCard: {
    marginTop: spacing.xl,
  },
  statRow: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
    padding: spacing.lg,
  },
  statValue: {
    marginTop: spacing.xs,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.line,
  },
  freezeChip: {
    marginTop: spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.96,
  },
  pillarCard: {
    marginTop: spacing.md,
  },
  cardLabel: {
    marginBottom: spacing.lg,
    textTransform: 'uppercase',
  },
  questHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  groupTitle: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  error: {
    marginTop: spacing.md,
  },
  footerRule: {
    marginTop: spacing.xl,
  },
  footerNote: {
    marginVertical: spacing.lg,
  },
  skeletonWrap: {
    paddingTop: spacing.xl,
  },
  skeletonCenter: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  skeletonBlock: {
    marginBottom: spacing.md,
  },
  }),
);

export default TodayScreen;
