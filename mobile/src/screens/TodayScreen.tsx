// Today screen. Split into memoized sections that each select only the
// state they draw, so completing a quest re-renders:
//   - that quest's row (TodayQuestItem picks its own quest by id),
//   - that pillar's bubble (LivePillarBubble in PillarOrbit),
//   - the list container only if the order changes (rows inside are skipped),
//   - the progress strip, whose numbers changed.
// The header, the orbit and its avatar are left alone, so the avatar keeps
// floating without a hitch. All callbacks passed down are stable.

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sanitizeAvatarConfig } from '../avatar/types';
import { VALID_OPTION_IDS } from '../avatar/options';
import Backdrop from '../components/Backdrop';
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
import {
  sameTodayList,
  selectActiveCount,
  selectDayMood,
  selectDoneCount,
  selectInitialLoading,
  selectQuestById,
  selectTodayList,
  type TodayList,
} from '../store/selectors/today';
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

// ------------------------------------------------------------ sections

const TodayHeader = memo(function TodayHeader({
  onBellPress,
}: {
  onBellPress: () => void;
}) {
  useTheme();
  const firstName = useAppSelector((state) => state.user.profile?.first_name);
  const unread = useUnreadCount();
  return (
    <FadeInUp style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.headerTitle}>
          <Txt variant="caption" color={colors.inkSoft}>
            {dateLine()}
          </Txt>
          <Txt variant="title" style={styles.greeting}>
            {greeting(firstName)}
          </Txt>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
          }
          onPress={onBellPress}
          pressedScale={0.9}
          style={styles.bell}
        >
          <BellGlyph color={colors.ink} />
          {unread > 0 ? <View style={styles.bellDot} /> : null}
        </PressableScale>
      </View>
    </FadeInUp>
  );
});

const TodayOrbit = memo(function TodayOrbit({
  expandedPillar,
  onPillarPress,
}: {
  expandedPillar: PillarId | null;
  onPillarPress: (pillar: PillarId) => void;
}) {
  // Primitive picks: a refetched profile with the same values is a no-op.
  const rawConfig = useAppSelector((state) => state.user.profile?.avatar_config);
  const firstName = useAppSelector((state) => state.user.profile?.first_name);
  const photoUrl = useAppSelector((state) => {
    const p = state.user.profile;
    if (p?.avatar_mode === 'ai') return p.ai_avatar_url ?? null;
    if (p?.avatar_mode === 'photo') return p.photo_url ?? p.avatar_url ?? null;
    return null;
  });
  const level = useAppSelector((state) => state.gamification.level);
  const mood = useAppSelector(selectDayMood);
  const avatarConfig = useMemo(
    () => sanitizeAvatarConfig(rawConfig, VALID_OPTION_IDS),
    [rawConfig],
  );
  return (
    <FadeInUp delay={80} style={styles.orbitWrap}>
      <PillarOrbit
        avatarConfig={avatarConfig}
        photoUrl={photoUrl}
        name={firstName}
        level={level}
        mood={mood}
        expandedPillar={expandedPillar}
        onPillarPress={onPillarPress}
      />
    </FadeInUp>
  );
});

/** One row of the list, subscribed to its own quest only. */
export const TodayQuestItem = memo(function TodayQuestItem({
  questId,
  index,
  showPillarLabel,
  onOpen,
  onComplete,
}: {
  questId: string;
  index: number;
  showPillarLabel: boolean;
  onOpen: (quest: Quest) => void;
  onComplete: (quest: Quest) => void;
}) {
  const quest = useAppSelector((state) => selectQuestById(state, questId));
  // The entrance stagger is fixed at mount; reordering must not replay it.
  const delay = useRef(220 + index * 50).current;
  if (!quest) return null;
  return (
    <FadeInUp delay={delay}>
      <QuestRow
        quest={quest}
        onPress={onOpen}
        onComplete={onComplete}
        showPillarLabel={showPillarLabel}
      />
    </FadeInUp>
  );
},
// index only sets the entrance delay at mount, so a reorder that shifts it
// is not a reason to re-render.
(prev, next) =>
  prev.questId === next.questId &&
  prev.showPillarLabel === next.showPillarLabel &&
  prev.onOpen === next.onOpen &&
  prev.onComplete === next.onComplete);

export const QuestSection = memo(function QuestSection({
  expandedPillar,
  onClearPillar,
  onSeeAll,
  onOpen,
  onComplete,
}: {
  expandedPillar: PillarId | null;
  onClearPillar: () => void;
  onSeeAll: () => void;
  onOpen: (quest: Quest) => void;
  onComplete: (quest: Quest) => void;
}) {
  useTheme();
  // Re-renders only when the listed ids, their order or the counts change.
  const list = useAppSelector<TodayList>(
    (state) => selectTodayList(state, expandedPillar),
    sameTodayList,
  );
  const hiddenCount = list.inScopeCount - list.ids.length;
  const scopeLabel =
    expandedPillar === null ? 'Up next' : `${PILLAR_LABELS[expandedPillar]} today`;

  return (
    <>
      <View style={styles.questHeader}>
        <View style={styles.questHeaderTitle}>
          {expandedPillar ? <PillarGlyph pillar={expandedPillar} size={20} /> : null}
          <Txt
            variant="heading"
            style={expandedPillar ? styles.questHeaderTextIcon : undefined}
          >
            {scopeLabel}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expandedPillar !== null ? 'Show all pillars' : 'See all quests'}
          onPress={expandedPillar !== null ? onClearPillar : onSeeAll}
          hitSlop={10}
        >
          <Txt variant="bodySemi" color={colors.accent}>
            {expandedPillar !== null ? 'Show all' : 'See all'}
          </Txt>
        </Pressable>
      </View>

      {list.inScopeCount === 0 ? (
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
          {list.openCount === 0 ? (
            <Txt variant="body" color={colors.inkSoft} align="center" style={styles.allDone}>
              {expandedPillar === null
                ? 'Everything is done for today. Your future self thanks you.'
                : `All ${PILLAR_LABELS[expandedPillar].toLowerCase()} quests are done.`}
            </Txt>
          ) : null}
          {list.ids.map((id, index) => (
            <TodayQuestItem
              key={id}
              questId={id}
              index={index}
              showPillarLabel={expandedPillar === null}
              onOpen={onOpen}
              onComplete={onComplete}
            />
          ))}
        </>
      )}

      {hiddenCount > 0 ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`See ${hiddenCount} more quests`}
          onPress={onSeeAll}
          style={styles.allQuests}
        >
          <Txt variant="bodySemi" color={colors.accent}>
            {`${hiddenCount} more ${hiddenCount === 1 ? 'quest' : 'quests'}`}
          </Txt>
          <ChevronGlyph color={colors.accent} />
        </PressableScale>
      ) : null}
    </>
  );
});

const ProgressStrip = memo(function ProgressStrip({
  onFreeze,
}: {
  onFreeze: () => void;
}) {
  useTheme();
  const totalXp = useAppSelector((state) => state.gamification.totalXp);
  const level = useAppSelector((state) => state.gamification.level);
  const currentTitle = useAppSelector((state) => state.gamification.currentTitle);
  const currentStreak = useAppSelector((state) => state.gamification.currentStreak);
  const bestStreak = useAppSelector((state) => state.gamification.bestStreak);
  const score = useAppSelector((state) => state.quests.dailyLifeScore);
  const doneCount = useAppSelector(selectDoneCount);
  const activeCount = useAppSelector(selectActiveCount);

  return (
    <>
      {/* Progress comes after today's to-dos: act first, then reflect. */}
      <Txt variant="label" style={styles.progressLabel}>
        Your progress
      </Txt>
      <FadeInUp delay={320} style={styles.strip}>
        <View style={[styles.stripCell, styles.stripFirst]}>
          <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
            {currentTitle ?? titleForLevel(level)}
          </Txt>
          <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
            {`${totalXp.toLocaleString()} XP`}
          </Txt>
          <View style={styles.xpTrack}>
            <View
              style={[
                styles.xpFill,
                { width: `${Math.round(levelProgress(totalXp) * 100)}%` },
              ]}
            />
          </View>
        </View>
        <View style={styles.stripDivider} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={
            currentStreak > 0
              ? `${streakLabel(currentStreak)}. Tap to use a streak freeze`
              : streakLabel(currentStreak)
          }
          disabled={currentStreak === 0}
          onPress={onFreeze}
          style={styles.stripCell}
        >
          <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
            Streak
          </Txt>
          <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
            {currentStreak > 0 ? streakLabel(currentStreak) : bestStreakLabel(bestStreak)}
          </Txt>
        </PressableScale>
        <View style={styles.stripDivider} />
        <View style={styles.stripCell}>
          <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
            Life score
          </Txt>
          <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
            {`${Math.round(score)}`}
          </Txt>
          <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
            {`${doneCount} of ${activeCount} done`}
          </Txt>
        </View>
      </FadeInUp>
    </>
  );
});

const QuestsError = memo(function QuestsError() {
  useTheme();
  const error = useAppSelector((state) => state.quests.error);
  if (!error) return null;
  return (
    <Txt variant="caption" color={colors.danger} style={styles.error}>
      {error}
    </Txt>
  );
});

export interface ConfettiLayerHandle {
  fire: (color: string) => void;
}

/** Confetti keeps its own state, so a burst does not re-render the screen. */
const ConfettiLayer = memo(
  forwardRef<ConfettiLayerHandle>(function ConfettiLayer(_props, ref) {
    const [burst, setBurst] = useState<{ key: number; color: string } | null>(null);
    useImperativeHandle(ref, () => ({
      fire: (color: string) => setBurst({ key: Date.now(), color }),
    }), []);
    const onDone = useCallback(() => setBurst(null), []);
    if (!burst) return null;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ConfettiLite key={burst.key} visible accentColor={burst.color} onDone={onDone} />
      </View>
    );
  }),
);

// ------------------------------------------------------------ screen

export function TodayScreen({ navigation }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const initialLoading = useAppSelector(selectInitialLoading);
  const refreshing = useAppSelector((state) => state.quests.refreshing);
  const [expandedPillar, setExpandedPillar] = useState<PillarId | null>(null);
  const confettiRef = useRef<ConfettiLayerHandle>(null);

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
        showToast({
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
          showToast({
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

  const confirmFreeze = useCallback(() => {
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
              showToast({ message: msg });
            } else {
              showToast({
                message: 'Streak frozen for today. Back at it tomorrow.',
              });
            }
          },
        },
      ],
    );
  }, [showToast]);

  const handleComplete = useCallback(
    async (quest: Quest) => {
      const result = await dispatch(completeQuest(quest));
      if (completeQuest.fulfilled.match(result)) {
        const xp = result.payload.xp_awarded;
        const questId = result.payload.quest_id;
        confettiRef.current?.fire(colors.pillar[quest.pillar]);
        // Level-ups and badges ride on the undo toast (their notification
        // center entries skip the banner so they don't replace it).
        const extras = [
          result.payload.level_up ? `Level ${result.payload.level}!` : null,
          result.payload.new_badges?.length
            ? `${pluralize(result.payload.new_badges.length, 'new badge')}.`
            : null,
        ].filter(Boolean);
        showToast({
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
        showToast({
          message: result.payload?.message ?? 'Could not complete this quest.',
        });
      }
    },
    [dispatch, showToast],
  );

  const openQuest = useCallback(
    (quest: Quest) => navigation.navigate('QuestDetail', { quest }),
    [navigation],
  );
  const openAllQuests = useCallback(() => navigation.navigate('Quests'), [navigation]);
  const openNotifications = useCallback(
    () => navigation.navigate('Notifications'),
    [navigation],
  );
  const togglePillar = useCallback(
    (id: PillarId) => setExpandedPillar((cur) => (cur === id ? null : id)),
    [],
  );
  const clearPillar = useCallback(() => setExpandedPillar(null), []);

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
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
          <Backdrop
            blobs={[
              { x: 0.05, y: 160, r: 220, color: colors.pillar.health },
              { x: 0.95, y: 260, r: 230, color: colors.pillar.spirituality },
              { x: 0.35, y: 560, r: 240, color: colors.pillar.work },
              { x: 0.9, y: 620, r: 180, color: colors.pillar.family },
            ]}
          />
          <TodayHeader onBellPress={openNotifications} />
          <TodayOrbit expandedPillar={expandedPillar} onPillarPress={togglePillar} />
          <QuestSection
            expandedPillar={expandedPillar}
            onClearPillar={clearPillar}
            onSeeAll={openAllQuests}
            onOpen={openQuest}
            onComplete={handleComplete}
          />
          <ProgressStrip onFreeze={confirmFreeze} />
          <QuestsError />
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
      <ConfettiLayer ref={confettiRef} />
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
  progressLabel: {
    marginTop: spacing.xl,
    marginLeft: spacing.xs,
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
