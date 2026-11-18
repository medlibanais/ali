import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import QuestRow from '../components/QuestRow';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { ChevronGlyph } from '../components/icons';
import { QuestSearchBar, QuestSearchResults } from '../features/questSearch/QuestSearch';
import { useQuestSearch } from '../features/questSearch/useQuestSearch';
import type { Quest } from '../api/types';
import type { AppStackParamList, MainTabParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchDailyQuests } from '../store/slices/questsSlice';
import {
  colors,
  PILLAR_LABELS,
  PILLARS,
  Pillar,
  pillarPastels,
  radius,
  spacing,
  themed,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Quests'>,
  NativeStackScreenProps<AppStackParamList>
>;

type Filter = 'all' | Pillar;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'all', get label() { return i18n.t('quests.all'); } },
  { value: 'health', get label() { return i18n.t('quests.health'); } },
  { value: 'family', get label() { return i18n.t('quests.family'); } },
  { value: 'work', get label() { return i18n.t('quests.work'); } },
  { value: 'fun', get label() { return i18n.t('quests.fun'); } },
  { value: 'spirituality', get label() { return i18n.t('quests.spirituality'); } },
];

function QuestsSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton height={40} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
      <Skeleton height={64} style={styles.skeletonBlock} />
    </View>
  );
}

type Row =
  | { type: 'open'; quest: Quest }
  | { type: 'empty' }
  | { type: 'doneHeader'; count: number }
  | { type: 'done'; quest: Quest };

const rowKey = (row: Row): string =>
  row.type === 'open' || row.type === 'done' ? row.quest.quest_id : row.type;
// Row kinds are recycled separately, so a quest row never reuses the
// "Completed" header's views.
const rowType = (row: Row): Row['type'] => row.type;

/** Average QuestRow height (64 px card + 12 px gap) for FlashList's first layout. */
const ESTIMATED_ROW = 76;

export function QuestsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  // Each pick is its own subscription: undoing a quest elsewhere does not
  // re-render this screen through unrelated state.
  const quests = useAppSelector((state) => state.quests.quests);
  const loading = useAppSelector((state) => state.quests.loading);
  const date = useAppSelector((state) => state.quests.date);
  const [filter, setFilter] = useState<Filter>('all');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const search = useQuestSearch(searchText);
  const searchActive = searchText.trim().length > 0;

  useEffect(() => {
    if (date === null) {
      dispatch(fetchDailyQuests(undefined));
    }
  }, [dispatch, date]);

  const initialLoading = loading && date === null;

  const summary = useMemo(() => {
    const dayQuests = quests.filter((q) => !q.skipped);
    const done = dayQuests.filter((q) => q.completed);
    const xpLeft = dayQuests
      .filter((q) => !q.completed)
      .reduce((sum, q) => sum + q.xp_reward, 0);
    const shares = PILLARS.map((pillar) => ({
      pillar,
      share: dayQuests.length
        ? done.filter((q) => q.pillar === pillar).length / dayQuests.length
        : 0,
    }));
    return { total: dayQuests.length, doneCount: done.length, xpLeft, shares };
  }, [quests]);

  const rows = useMemo((): Row[] => {
    const active = quests.filter((q) => !q.skipped && !q.completed);
    const visible = (filter === 'all' ? active : active.filter((q) => q.pillar === filter)).sort(
      (a, b) =>
        PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar) ||
        (a.priority ?? 1) - (b.priority ?? 1),
    );
    const done = quests.filter(
      (q) => q.completed && (filter === 'all' || q.pillar === filter),
    );
    const out: Row[] = visible.length
      ? visible.map((quest) => ({ type: 'open', quest }))
      : [{ type: 'empty' }];
    if (done.length > 0) {
      out.push({ type: 'doneHeader', count: done.length });
      if (completedOpen) for (const quest of done) out.push({ type: 'done', quest });
    }
    return out;
  }, [quests, filter, completedOpen]);

  // Stable, so memoized QuestRows skip when only another quest changed.
  const openQuest = useCallback(
    (quest: Quest) => navigation.navigate('QuestDetail', { quest }),
    [navigation],
  );
  const toggleCompleted = useCallback(() => setCompletedOpen((open) => !open), []);
  const showPillarLabel = filter === 'all';

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => {
      switch (item.type) {
        case 'open':
          return (
            <QuestRow quest={item.quest} onPress={openQuest} showPillarLabel={showPillarLabel} />
          );
        case 'done':
          return <QuestRow quest={item.quest} />;
        case 'empty':
          return (
            <EmptyState
              title={
                filter === 'all'
                  ? t('quests.nothingLeftToDo')
                  : t('quests.noQuestsLeftToday', { pillar: PILLAR_LABELS[filter as Pillar].toLowerCase() })
              }
              body={t('quests.everythingInThisView')}
            />
          );
        case 'doneHeader':
          return (
            <View style={styles.completedSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quests.completedA11y', { count: item.count })}
                accessibilityState={{ expanded: completedOpen }}
                onPress={toggleCompleted}
                style={({ pressed }) => [styles.completedHeader, pressed && styles.pressed]}
              >
                <Txt variant="bodySemi" color={colors.inkSoft}>
                  {t('quests.completed', { length: item.count })}
                </Txt>
                <View style={completedOpen ? styles.chevronUp : styles.chevronDown}>
                  <ChevronGlyph />
                </View>
              </Pressable>
            </View>
          );
      }
    },
    [openQuest, showPillarLabel, filter, completedOpen, toggleCompleted, t],
  );

  // Fixed above the list, so the search field keeps focus while the body
  // below switches between the list, the skeleton and search results.
  const top = (
    <View style={styles.padded}>
      <Txt variant="caption" color={colors.inkSoft} style={styles.kicker}>
        {t('quests.ofDoneXpLeft', { doneCount: summary.doneCount, length: summary.total, xpLeft: summary.xpLeft })}
      </Txt>
      <Txt variant="title" style={styles.title}>
        {t('quests.todaySQuests')}
      </Txt>
      <View style={styles.progressTrack}>
        {summary.shares.map(({ pillar, share }) =>
          share > 0 ? (
            <View
              key={pillar}
              style={{ flex: share, backgroundColor: pillarPastels(pillar).base }}
            />
          ) : null,
        )}
        <View
          style={{ flex: Math.max(0.0001, 1 - summary.doneCount / Math.max(1, summary.total)) }}
        />
      </View>
      <QuestSearchBar
        value={searchText}
        onChangeText={setSearchText}
        searching={search.searching}
      />
    </View>
  );

  const chips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterContent}
    >
      {FILTER_OPTIONS.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={filter === option.value}
          onPress={() => setFilter(option.value)}
          dotColor={option.value === 'all' ? undefined : pillarPastels(option.value).base}
        />
      ))}
    </ScrollView>
  );

  return (
    <Screen padded={false}>
      {top}
      {searchActive ? (
        <ScrollView
          contentContainerStyle={styles.padded}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <QuestSearchResults search={search} />
        </ScrollView>
      ) : initialLoading ? (
        <View style={styles.padded}>
          <QuestsSkeleton />
        </View>
      ) : (
        // FlashList recycles row views instead of mounting one per quest,
        // and only draws the rows on screen.
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={rowKey}
          getItemType={rowType}
          estimatedItemSize={ESTIMATED_ROW}
          extraData={completedOpen}
          ListHeaderComponent={chips}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  kicker: {
    marginTop: spacing.lg,
  },
  title: {
    marginTop: 2,
  },
  progressTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.paperAlt,
  },
  // flexGrow 0: inside the screen's flexGrow column a horizontal
  // ScrollView otherwise grows to fill the height, stretching the chips.
  filterScroll: {
    flexGrow: 0,
    marginBottom: spacing.md,
    marginHorizontal: -24,
  },
  padded: {
    paddingHorizontal: 24,
  },
  // FlashList only takes padding here; the tab bar floats over the end.
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: spacing.lg,
  },
  filterContent: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  completedSection: {
    marginTop: spacing.lg,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.paperAlt,
    marginBottom: spacing.md,
  },
  chevronUp: {
    transform: [{ rotate: '-90deg' }],
  },
  chevronDown: {
    transform: [{ rotate: '90deg' }],
  },
  pressed: {
    opacity: 0.96,
  },
  skeletonWrap: {
    marginTop: spacing.sm,
  },
  skeletonBlock: {
    marginBottom: spacing.md,
  },
}));

export default QuestsScreen;
