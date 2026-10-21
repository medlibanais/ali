import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sanitizeAvatarConfig } from '../avatar/types';
import { VALID_OPTION_IDS } from '../avatar/options';
import ConfettiLite from '../components/ConfettiLite';
import EmptyState from '../components/EmptyState';
import Hairline from '../components/Hairline';
import PillarOrbit from '../components/PillarOrbit';
import type { PillarId } from '../components/PillarBubble';
import QuestRow from '../components/QuestRow';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { BellGlyph, ChevronGlyph, PillarGlyph } from '../components/icons';
import type { Quest } from '../api/types';
import { useRedeemInvite } from '../features/friends/api';
import { useUnreadCount } from '../features/notifications/api';
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
  radius,
  spacing,
  themed,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Today'>,
  NativeStackScreenProps<AppStackParamList>
>;

// Quests listed under the orbit before "See all quests".
const UP_NEXT_LIMIT = 4;

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
      <Skeleton width={220} height={24} style={styles.skeletonCenter} />
      <Skeleton width={280} height={280} borderRadius={140} style={styles.skeletonCenter} />
      <Skeleton height={56} style={styles.skeletonBlock} />
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
  const unread = useUnreadCount();
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
      // Level-ups and badges ride on the undo toast (their notification
      // center entries skip the banner so they don't replace it).
      const extras = [
        result.payload.level_up ? `Level ${result.payload.level}!` : null,
        result.payload.new_badges?.length
          ? `${pluralize(result.payload.new_badges.length, 'new badge')}.`
          : null,
      ].filter(Boolean);
      toast.showToast({
        message: [`+${xp} XP. ${quest.title} is done.`, ...extras].join(' '),
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
  const photoUrl =
    profile?.avatar_mode === 'photo'
      ? profile.photo_url ?? profile.avatar_url ?? null
      : null;
  const orbitScores: Record<PillarId, number> = {
    health: questsState.pillarScores.health ?? 0,
    family: questsState.pillarScores.family ?? 0,
    work: questsState.pillarScores.work ?? 0,
    fun: questsState.pillarScores.fun ?? 0,
    spirituality: questsState.pillarScores.spirituality ?? 0,
  };
  const orbitProgress = Object.fromEntries(
    PILLARS.map((pillar) => {
      const items = activeQuests.filter((q) => q.pillar === pillar);
      return [
        pillar,
        { done: items.filter((q) => q.completed).length, total: items.length },
      ];
    }),
  ) as Record<PillarId, { done: number; total: number }>;

  // Quests shown under the orbit: today's open quests (all pillars, or the
  // tapped one), most important first, then what is already done.
  const inScope = activeQuests.filter(
    (q) => expandedPillar === null || q.pillar === expandedPillar,
  );
  const byPriority = (a: Quest, b: Quest) =>
    (a.priority ?? 1) - (b.priority ?? 1);
  const openQuests = inScope.filter((q) => !q.completed).sort(byPriority);
  const doneQuests = inScope.filter((q) => q.completed).sort(byPriority);
  const listed = [...openQuests, ...doneQuests].slice(
    0,
    expandedPillar === null ? UP_NEXT_LIMIT : inScope.length,
  );
  const hiddenCount = inScope.length - listed.length;
  const scopeLabel =
    expandedPillar === null
      ? 'Up next'
      : `${PILLAR_LABELS[expandedPillar]} today`;

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
            <View style={styles.headerTop}>
              <View style={styles.headerTitle}>
                <Txt variant="caption" color={colors.inkFaint}>
                  {dateLine()}
                </Txt>
                <Txt variant="title" style={styles.greeting}>
                  {greeting(profile?.first_name)}
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
                }
                onPress={() => navigation.navigate('Notifications')}
                style={({ pressed }) => [styles.bell, pressed && { opacity: 0.6 }]}
              >
                <BellGlyph />
                {unread > 0 ? (
                  <View style={styles.bellBadge}>
                    <Txt variant="caption" color={colors.onAccent}>
                      {unread > 9 ? '9+' : `${unread}`}
                    </Txt>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          <View style={styles.orbitWrap}>
            <PillarOrbit
              avatarConfig={avatarConfig}
              photoUrl={photoUrl}
              name={profile?.first_name}
              scores={orbitScores}
              progress={orbitProgress}
              expandedPillar={expandedPillar}
              onPillarPress={(id) =>
                setExpandedPillar((cur) => (cur === id ? null : id))
              }
            />
          </View>

          <View style={styles.statStrip}>
            <View style={styles.statCell}>
              <Txt variant="bodySemi" color={colors.accent}>
                {`${Math.round(score)}`}
              </Txt>
              <Txt variant="caption" color={colors.inkFaint}>
                Life score
              </Txt>
            </View>
            <View style={styles.statDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                gamification.currentStreak > 0
                  ? `${streakLabel(gamification.currentStreak)}. Tap to use a streak freeze`
                  : streakLabel(gamification.currentStreak)
              }
              disabled={gamification.currentStreak === 0}
              onPress={confirmFreeze}
              style={({ pressed }) => [styles.statCell, pressed && styles.pressed]}
            >
              <Txt variant="bodySemi" color={colors.gold} numberOfLines={1}>
                {streakLabel(gamification.currentStreak)}
              </Txt>
              <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
                {gamification.currentStreak > 0
                  ? 'Tap to freeze'
                  : bestStreakLabel(gamification.bestStreak)}
              </Txt>
            </Pressable>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Txt variant="bodySemi" numberOfLines={1}>
                {`Level ${gamification.level}`}
              </Txt>
              <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
                {gamification.currentTitle ?? titleForLevel(gamification.level)}
              </Txt>
            </View>
          </View>

          <View style={styles.questHeader}>
            <View style={styles.questHeaderTitle}>
              {expandedPillar ? (
                <PillarGlyph pillar={expandedPillar} size={18} />
              ) : null}
              <Txt
                variant="label"
                style={[styles.questHeaderText, expandedPillar && styles.questHeaderTextIcon]}
              >
                {scopeLabel}
              </Txt>
            </View>
            <Txt variant="caption" color={colors.inkFaint}>
              {`${doneQuests.length} of ${inScope.length} done`}
            </Txt>
          </View>

          {expandedPillar !== null ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpandedPillar(null)}
              style={({ pressed }) => [styles.clearFilter, pressed && styles.pressed]}
            >
              <Txt variant="caption" color={colors.accent}>
                Show all pillars
              </Txt>
            </Pressable>
          ) : null}

          {inScope.length === 0 ? (
            <EmptyState
              title={
                expandedPillar === null
                  ? 'No quests yet today'
                  : `No ${PILLAR_LABELS[expandedPillar].toLowerCase()} quests today`
              }
              body={
                expandedPillar === null
                  ? 'Pull down to refresh, or ask your coach for a quest.'
                  : 'This pillar has no quests scheduled today. Another pillar might.'
              }
            />
          ) : (
            <>
              {openQuests.length === 0 ? (
                <Txt
                  variant="body"
                  color={colors.inkSoft}
                  align="center"
                  style={styles.allDone}
                >
                  {expandedPillar === null
                    ? 'Everything is done for today. Your future self thanks you.'
                    : `All ${PILLAR_LABELS[expandedPillar].toLowerCase()} quests are done.`}
                </Txt>
              ) : null}
              {listed.map((quest) => (
                <QuestRow
                  key={quest.quest_id}
                  quest={quest}
                  onPress={openQuest}
                  onComplete={handleComplete}
                  showPillarLabel={expandedPillar === null}
                />
              ))}
            </>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Quests')}
            style={({ pressed }) => [styles.allQuests, pressed && styles.pressed]}
          >
            <Txt variant="bodySemi" color={colors.accent}>
              {hiddenCount > 0
                ? `See all quests (${hiddenCount} more)`
                : 'See all quests'}
            </Txt>
            <ChevronGlyph color={colors.accent} />
          </Pressable>

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
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
  },
  bell: {
    padding: spacing.sm,
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  greeting: {
    marginTop: spacing.xs,
  },
  orbitWrap: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  statStrip: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  statDivider: {
    width: 1,
    marginVertical: spacing.sm,
    backgroundColor: colors.line,
  },
  pressed: {
    opacity: 0.7,
  },
  questHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  questHeaderText: {
    textTransform: 'uppercase',
  },
  questHeaderTextIcon: {
    marginLeft: spacing.sm,
  },
  clearFilter: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  allDone: {
    marginBottom: spacing.md,
  },
  allQuests: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: spacing.sm,
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
