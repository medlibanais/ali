import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sanitizeAvatarConfig } from '../avatar/types';
import { VALID_OPTION_IDS } from '../avatar/options';
import ConfettiLite from '../components/ConfettiLite';
import EmptyState from '../components/EmptyState';
import { FadeInUp, PressableScale } from '../components/Motion';
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
import { levelProgress } from '../lib/levels';
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
  fonts,
  PILLAR_LABELS,
  PILLARS,
  radius,
  softSurface,
  spacing,
  themed,
  withAlpha,
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

/**
 * Soft pillar-tint blobs behind the top of the screen (Figma: pillar tints,
 * heavily blurred). Radial gradients fade each blob out to nothing.
 */
function BackdropBlobs() {
  const { width } = useWindowDimensions();
  const blobs = [
    { id: 'blobHealth', x: 0.05, y: 160, r: 220, color: colors.pillar.health },
    { id: 'blobSpirit', x: 0.95, y: 260, r: 230, color: colors.pillar.spirituality },
    { id: 'blobWork', x: 0.35, y: 560, r: 240, color: colors.pillar.work },
    { id: 'blobFamily', x: 0.9, y: 620, r: 180, color: colors.pillar.family },
  ];
  return (
    <View style={[styles.blobs, { width, left: -(width - Math.min(width, 720)) / 2 }]} pointerEvents="none">
      <Svg width={width} height={820}>
        <Defs>
          {blobs.map((blob) => (
            <RadialGradient key={blob.id} id={blob.id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={blob.color} stopOpacity="0.16" />
              <Stop offset="1" stopColor={blob.color} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((blob) => (
          <Circle key={blob.id} cx={blob.x * width} cy={blob.y} r={blob.r} fill={`url(#${blob.id})`} />
        ))}
      </Svg>
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
  const doneCount = activeQuests.filter((q) => q.completed).length;
  const avatarConfig = sanitizeAvatarConfig(
    profile?.avatar_config,
    VALID_OPTION_IDS,
  );
  const photoUrl =
    profile?.avatar_mode === 'ai'
      ? profile.ai_avatar_url ?? null
      : profile?.avatar_mode === 'photo'
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
          <BackdropBlobs />
          <FadeInUp style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerTitle}>
                <Txt variant="caption" color={colors.inkSoft}>
                  {dateLine()}
                </Txt>
                <Txt variant="title" style={styles.greeting}>
                  {greeting(profile?.first_name)}
                </Txt>
              </View>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={
                  unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
                }
                onPress={() => navigation.navigate('Notifications')}
                pressedScale={0.9}
                style={styles.bell}
              >
                <BellGlyph color={colors.ink} />
                {unread > 0 ? <View style={styles.bellDot} /> : null}
              </PressableScale>
            </View>
          </FadeInUp>

          <FadeInUp delay={80} style={styles.orbitWrap}>
            <PillarOrbit
              avatarConfig={avatarConfig}
              photoUrl={photoUrl}
              name={profile?.first_name}
              level={gamification.level}
              scores={orbitScores}
              progress={orbitProgress}
              expandedPillar={expandedPillar}
              onPillarPress={(id) =>
                setExpandedPillar((cur) => (cur === id ? null : id))
              }
            />
          </FadeInUp>

          <FadeInUp delay={160} style={styles.strip}>
            <View style={[styles.stripCell, styles.stripFirst]}>
              <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                {gamification.currentTitle ?? titleForLevel(gamification.level)}
              </Txt>
              <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
                {`${gamification.totalXp.toLocaleString()} XP`}
              </Txt>
              <View style={styles.xpTrack}>
                <View
                  style={[
                    styles.xpFill,
                    { width: `${Math.round(levelProgress(gamification.totalXp) * 100)}%` },
                  ]}
                />
              </View>
            </View>
            <View style={styles.stripDivider} />
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={
                gamification.currentStreak > 0
                  ? `${streakLabel(gamification.currentStreak)}. Tap to use a streak freeze`
                  : streakLabel(gamification.currentStreak)
              }
              disabled={gamification.currentStreak === 0}
              onPress={confirmFreeze}
              style={styles.stripCell}
            >
              <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                Streak
              </Txt>
              <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
                {gamification.currentStreak > 0
                  ? streakLabel(gamification.currentStreak)
                  : bestStreakLabel(gamification.bestStreak)}
              </Txt>
            </PressableScale>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                {`Today · score ${Math.round(score)}`}
              </Txt>
              <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
                {`${doneCount} of ${activeQuests.length}`}
              </Txt>
            </View>
          </FadeInUp>

          <View style={styles.questHeader}>
            <View style={styles.questHeaderTitle}>
              {expandedPillar ? (
                <PillarGlyph pillar={expandedPillar} size={20} />
              ) : null}
              <Txt
                variant="heading"
                style={expandedPillar ? styles.questHeaderTextIcon : undefined}
              >
                {scopeLabel}
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                expandedPillar !== null
                  ? setExpandedPillar(null)
                  : navigation.navigate('Quests')
              }
              hitSlop={10}
            >
              <Txt variant="bodySemi" color={colors.accent}>
                {expandedPillar !== null ? 'Show all' : 'See all'}
              </Txt>
            </Pressable>
          </View>

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
              {listed.map((quest, index) => (
                <FadeInUp key={quest.quest_id} delay={220 + index * 50}>
                  <QuestRow
                    quest={quest}
                    onPress={openQuest}
                    onComplete={handleComplete}
                    showPillarLabel={expandedPillar === null}
                  />
                </FadeInUp>
              ))}
            </>
          )}

          {hiddenCount > 0 ? (
            <PressableScale
              accessibilityRole="button"
              onPress={() => navigation.navigate('Quests')}
              style={styles.allQuests}
            >
              <Txt variant="bodySemi" color={colors.accent}>
                {`${hiddenCount} more ${hiddenCount === 1 ? 'quest' : 'quests'}`}
              </Txt>
              <ChevronGlyph color={colors.accent} />
            </PressableScale>
          ) : null}

          {questsState.error ? (
            <Txt variant="caption" color={colors.danger} style={styles.error}>
              {questsState.error}
            </Txt>
          ) : null}

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
  blobs: {
    position: 'absolute',
    top: -40,
  },
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...softSurface(1),
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.pillar.health,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  greeting: {
    marginTop: 2,
  },
  // The orbit is wider than the padded column; let it use the full width.
  orbitWrap: {
    marginTop: spacing.xl,
    marginHorizontal: -spacing.xl,
    alignItems: 'center',
  },
  // Score strip: one soft card, three cells (Figma "score strip").
  strip: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    ...softSurface(2),
  },
  stripCell: {
    flex: 1,
    paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center',
  },
  stripFirst: {
    flex: 1.25,
  },
  stripValue: {
    fontFamily: fonts.heavy,
    fontSize: 17,
    lineHeight: 22,
    marginTop: 2,
  },
  stripDivider: {
    width: 1,
    marginVertical: spacing.xs,
    backgroundColor: colors.line,
  },
  xpTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: spacing.sm,
    backgroundColor: colors.paperAlt,
    overflow: 'hidden',
  },
  xpFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },
  pressed: {
    opacity: 0.7,
  },
  questHeader: {
    marginTop: spacing.xl + 4,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  questHeaderTextIcon: {
    marginLeft: spacing.sm,
  },
  allDone: {
    marginBottom: spacing.md,
  },
  allQuests: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minHeight: 44,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.accent, 0.1),
  },
  error: {
    marginTop: spacing.md,
  },
  footerNote: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
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
