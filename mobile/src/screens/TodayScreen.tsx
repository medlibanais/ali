// Today screen. Split into memoized sections that each select only the
// state they draw, so completing a quest re-renders:
//   - that quest's row (TodayQuestItem picks its own quest by id),
//   - that pillar's bubble (LivePillarBubble in PillarOrbit),
//   - the list container only if the order changes (rows inside are skipped),
//   - the progress strip, whose numbers changed.
// The header, the orbit and its avatar are left alone, so the avatar keeps
// floating without a hitch. All callbacks passed down are stable.

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import i18n, { appLocale } from '../i18n';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sanitizeAvatarConfig } from '../avatar/types';
import { VALID_OPTION_IDS } from '../avatar/options';
import Backdrop from '../components/Backdrop';
import EmptyState from '../components/EmptyState';
import { FadeInUp, PressableScale } from '../components/Motion';
import PillarOrbit from '../components/PillarOrbit';
import type { PillarId } from '../components/PillarBubble';
import QuestRow from '../components/QuestRow';
import Screen from '../components/Screen';
import { TodaySkeleton } from '../components/ScreenSkeletons';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { BellGlyph, ChevronGlyph, PillarGlyph } from '../components/icons';
import type { Quest } from '../api/types';
import XpBar from '../features/celebrations/XpBar';
import { useUnreadCount } from '../features/notifications/api';
import { markFirstScreenPainted } from '../lib/bootSplash';
import { bestStreakLabel, streakLabel } from '../lib/format';
import { playHaptic } from '../lib/haptics';
import { launchHero } from '../lib/hero';
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
import { fetchProfile } from '../store/slices/userSlice';
import {
  completeQuest,
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
import { showAlert } from '../lib/alert';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Today'>,
  NativeStackScreenProps<AppStackParamList>
>;

function greeting(firstName: string | null | undefined): string {
  const hour = new Date().getHours();
  const part =
    hour < 12 ? i18n.t('today.goodMorning') : hour < 18 ? i18n.t('today.goodAfternoon') : i18n.t('today.goodEvening');
  return firstName ? `${part}, ${firstName}.` : `${part}.`;
}

function dateLine(): string {
  return new Date().toLocaleDateString(appLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ------------------------------------------------------------ sections

const TodayHeader = memo(function TodayHeader({
  onBellPress,
}: {
  onBellPress: () => void;
}) {
  const { t } = useTranslation();
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
            unread > 0 ? t('today.notificationsUnread', { unread }) : t('today.notifications')
          }
          onPress={onBellPress}
          pressedScale={0.9}
          style={styles.bell}
        >
          <BellGlyph color={colors.ink} />
          {unread > 0 ? <View style={styles.bellDot} /> : null}
        </PressableScale>
      </View>
      {/* XP particles fly into this bar when a quest is completed. */}
      <XpBar />
    </FadeInUp>
  );
});

const TodayOrbit = memo(function TodayOrbit({
  expandedPillar,
  onPillarPress,
  onAvatarPress,
}: {
  expandedPillar: PillarId | null;
  onPillarPress: (pillar: PillarId) => void;
  onAvatarPress: () => void;
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
        onAvatarPress={onAvatarPress}
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
  const { t } = useTranslation();
  useTheme();
  // Re-renders only when the listed ids, their order or the counts change.
  const list = useAppSelector<TodayList>(
    (state) => selectTodayList(state, expandedPillar),
    sameTodayList,
  );
  const hiddenCount = list.inScopeCount - list.ids.length;
  const scopeLabel =
    expandedPillar === null ? t('today.upNext') : t('today.today', { pillar: PILLAR_LABELS[expandedPillar] });

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
          accessibilityLabel={expandedPillar !== null ? t('today.showAllPillars') : t('today.seeAllQuests')}
          onPress={expandedPillar !== null ? onClearPillar : onSeeAll}
          hitSlop={10}
        >
          <Txt variant="bodySemi" color={colors.accent}>
            {expandedPillar !== null ? t('today.showAll') : t('today.seeAll')}
          </Txt>
        </Pressable>
      </View>

      {list.inScopeCount === 0 ? (
        <EmptyState
          title={
            expandedPillar === null
              ? t('today.noQuestsYetToday')
              : t('today.noQuestsToday', { pillar: PILLAR_LABELS[expandedPillar].toLowerCase() })
          }
          body={
            expandedPillar === null
              ? t('today.pullDownToRefresh')
              : t('today.thisPillarHasNo')
          }
        />
      ) : (
        <>
          {list.openCount === 0 ? (
            <Txt variant="body" color={colors.inkSoft} align="center" style={styles.allDone}>
              {expandedPillar === null
                ? t('today.everythingIsDoneFor')
                : t('today.allQuestsAreDone', { pillar: PILLAR_LABELS[expandedPillar].toLowerCase() })}
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
          accessibilityLabel={t('today.seeMoreQuests', { count: hiddenCount })}
          onPress={onSeeAll}
          style={styles.allQuests}
        >
          <Txt variant="bodySemi" color={colors.accent}>
            {t('today.more', { count: hiddenCount })}
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
  const { t } = useTranslation();
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
        {t('today.yourProgress')}
      </Txt>
      <FadeInUp delay={320} style={styles.strip}>
        <View style={[styles.stripCell, styles.stripFirst]}>
          <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
            {currentTitle ?? titleForLevel(level)}
          </Txt>
          <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
            {t('common.xp', { count: totalXp, formatted: totalXp.toLocaleString(appLocale()) })}
          </Txt>
        </View>
        <View style={styles.stripDivider} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={
            currentStreak > 0
              ? t('today.tapToUseA', { streak: streakLabel(currentStreak) })
              : streakLabel(currentStreak)
          }
          disabled={currentStreak === 0}
          onPress={onFreeze}
          style={styles.stripCell}
        >
          <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
            {t('today.streak')}
          </Txt>
          <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
            {currentStreak > 0 ? streakLabel(currentStreak) : bestStreakLabel(bestStreak)}
          </Txt>
        </PressableScale>
        <View style={styles.stripDivider} />
        <View style={styles.stripCell}>
          <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
            {t('today.lifeScore')}
          </Txt>
          <Txt variant="bodySemi" style={styles.stripValue} numberOfLines={1}>
            {`${Math.round(score)}`}
          </Txt>
          <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
            {t('today.ofDone', { doneCount, activeCount })}
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

// ------------------------------------------------------------ screen

export function TodayScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const initialLoading = useAppSelector(selectInitialLoading);
  const refreshing = useAppSelector((state) => state.quests.refreshing);
  const [expandedPillar, setExpandedPillar] = useState<PillarId | null>(null);

  const load = useCallback(
    (silent: boolean) => {
      dispatch(fetchProfile());
      dispatch(fetchDailyQuests({ silent }));
      dispatch(fetchGamification());
    },
    [dispatch],
  );

  useEffect(() => {
    // Offline completions sync in the background (OfflineBanner).
    load(false);
  }, [load]);

  // A tapped streak alert opens Today with its weakest pillar expanded.
  const pillarParam = route.params?.pillar;
  useEffect(() => {
    if (!pillarParam) return;
    setExpandedPillar(pillarParam);
    navigation.setParams({ pillar: undefined });
  }, [pillarParam, navigation]);

  // The native splash stays up until this screen's first frame is laid out.
  const onFirstLayout = useCallback(() => markFirstScreenPainted('today'), []);

  const onRefresh = useCallback(() => {
    load(true);
  }, [load]);

  const confirmFreeze = useCallback(() => {
    showAlert(
      t('today.freezeYourStreak'),
      t('today.todayCountsAsProtected'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('today.freeze'),
          onPress: async () => {
            const { error } = await supabase.rpc('use_streak_freeze');
            if (error) {
              const msg = error.message.includes('freeze_already_used')
                ? t('today.youAlreadyUsedThis')
                : error.message.includes('already_active_today')
                  ? t('today.youAreAlreadyActive')
                  : t('today.couldNotFreezeThe');
              showToast({ message: msg });
            } else {
              showToast({
                message: t('today.streakFrozenForToday'),
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
        // XP particles, level-up and Perfect Day are queued by the
        // celebration middleware (store/celebrationMiddleware.ts).
        // Level-ups and badges ride on the undo toast (their notification
        // center entries skip the banner so they don't replace it).
        const extras = [
          result.payload.level_up ? t('today.level', { level: result.payload.level }) : null,
          result.payload.new_badges?.length
            ? t('today.newBadges_one', { count: result.payload.new_badges.length })
            : null,
        ].filter(Boolean);
        showToast({
          message: result.payload.offline
            ? t('today.savedOffline', { xp, title: quest.title })
            : [t('today.xpIsDone', { xp, title: quest.title }), ...extras].join(' '),
          actionLabel: t('today.undo'),
          countdownSeconds: 10,
          durationMs: 10000,
          onAction: () => {
            playHaptic('questUndo');
            dispatch(undoQuest(questId));
          },
        });
        if (result.payload.level_up) {
          dispatch(fetchGamification());
        }
      } else {
        playHaptic('error');
        showToast({
          message: result.payload?.message ?? t('today.couldNotCompleteThis'),
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
  // The avatar flies from the orbit into the Profile header (Hero).
  const openProfile = useCallback(() => {
    playHaptic('tap');
    // Measure the avatar while it is still on screen, then switch tabs.
    launchHero('avatar').then(() => navigation.navigate('Profile'));
  }, [navigation]);

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
      <View onLayout={onFirstLayout} style={styles.paintMarker} pointerEvents="none" />
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
          <TodayOrbit
            expandedPillar={expandedPillar}
            onPillarPress={togglePillar}
            onAvatarPress={openProfile}
          />
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
            {t('today.pullDownToRefresh2')}
          </Txt>
        </>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  paintMarker: {
    height: 0,
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
  progressLabel: {
    marginTop: spacing.xl,
    marginStart: spacing.xs,
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
    marginStart: spacing.sm,
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
  }),
);

export default TodayScreen;
