import React, { useEffect, useMemo, useState } from 'react';
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
import type { Quest } from '../api/types';
import type { AppStackParamList, MainTabParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchDailyQuests } from '../store/slices/questsSlice';
import {
  colors,
  PILLAR_LABELS,
  PILLARS,
  Pillar,
  spacing,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Quests'>,
  NativeStackScreenProps<AppStackParamList>
>;

type Filter = 'all' | Pillar;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'health', label: 'Health' },
  { value: 'family', label: 'Family' },
  { value: 'work', label: 'Work' },
  { value: 'fun', label: 'Fun' },
  { value: 'spirituality', label: 'Spirituality' },
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

export function QuestsScreen({ navigation }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const { quests, loading, date } = useAppSelector((state) => state.quests);
  const [filter, setFilter] = useState<Filter>('all');
  const [completedOpen, setCompletedOpen] = useState(false);

  useEffect(() => {
    if (date === null) {
      dispatch(fetchDailyQuests(undefined));
    }
  }, [dispatch, date]);

  const initialLoading = loading && date === null;

  const visible = useMemo(() => {
    const active = quests.filter((q) => !q.skipped && !q.completed);
    const filtered =
      filter === 'all' ? active : active.filter((q) => q.pillar === filter);
    return filtered.sort(
      (a, b) =>
        PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar) ||
        (a.priority ?? 1) - (b.priority ?? 1),
    );
  }, [quests, filter]);

  const completed = useMemo(() => {
    const done = quests.filter((q) => q.completed);
    return filter === 'all'
      ? done
      : done.filter((q) => q.pillar === filter);
  }, [quests, filter]);

  const openQuest = (quest: Quest) => {
    navigation.navigate('QuestDetail', { quest });
  };

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        Today&apos;s quests
      </Txt>

      {initialLoading ? (
        <QuestsSkeleton />
      ) : (
        <>
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
              />
            ))}
          </ScrollView>

          {visible.length === 0 ? (
            <EmptyState
              title={
                filter === 'all'
                  ? 'Nothing left to do today'
                  : `No ${PILLAR_LABELS[filter as Pillar].toLowerCase()} quests left today`
              }
              body="Everything in this view is either done or skipped. Tomorrow brings a new set."
            />
          ) : (
            visible.map((quest) => (
              <QuestRow
                key={quest.quest_id}
                quest={quest}
                onPress={openQuest}
                showPillarLabel={filter === 'all'}
              />
            ))
          )}

          {completed.length > 0 ? (
            <View style={styles.completedSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: completedOpen }}
                onPress={() => setCompletedOpen((open) => !open)}
                style={({ pressed }) => [
                  styles.completedHeader,
                  pressed && styles.pressed,
                ]}
              >
                <Txt variant="label">
                  {`Completed, ${completed.length}`}
                </Txt>
                <View
                  style={completedOpen ? styles.chevronUp : styles.chevronDown}
                >
                  <ChevronGlyph />
                </View>
              </Pressable>
              {completedOpen
                ? completed.map((quest) => (
                    <QuestRow key={quest.quest_id} quest={quest} />
                  ))
                : null}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  filterScroll: {
    marginBottom: spacing.lg,
    marginHorizontal: -24,
  },
  filterContent: {
    paddingHorizontal: 24,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  completedSection: {
    marginTop: spacing.xl,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
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
});

export default QuestsScreen;
