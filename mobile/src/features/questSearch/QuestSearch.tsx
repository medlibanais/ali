import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import LoadingDots from '../../components/LoadingDots';
import Txt from '../../components/Txt';
import { CloseGlyph, PillarGlyph, SearchGlyph } from '../../components/icons';
import {
  colors,
  fonts,
  PILLAR_LABELS,
  pillarPastels,
  radius,
  spacing,
  themed,
} from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { relevanceBand, relevanceLabel, type QuestSearchResult } from './logic';
import type { QuestSearchState } from './useQuestSearch';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  searching: boolean;
}

export function QuestSearchBar({ value, onChangeText, searching }: SearchBarProps) {
  const { t } = useTranslation();
  useTheme();
  return (
    <View style={styles.bar}>
      <View style={styles.leading} pointerEvents="none">
        {searching ? (
          <LoadingDots color={colors.accent} size={4} accessibilityLabel={t('questSearch.searching')} />
        ) : (
          <SearchGlyph size={20} color={colors.inkSoft} />
        )}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={t('questSearch.searchAllQuestsE')}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={t('questSearch.searchTheQuestLibrary')}
        accessibilityHint={t('questSearch.findsQuestsByMeaning')}
        returnKeyType="search"
        autoCorrect={false}
        maxLength={200}
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={t('questSearch.clearSearch')}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
        >
          <CloseGlyph size={18} color={colors.inkSoft} />
        </Pressable>
      ) : null}
    </View>
  );
}

function RelevancePill({ relevance }: { relevance: number }) {
  const band = relevanceBand(relevance);
  const tint =
    band === 'strong' ? colors.accent : band === 'good' ? colors.gold : colors.inkFaint;
  return (
    <View style={[styles.pill, { borderColor: tint }]}>
      <Txt variant="caption" color={tint}>
        {relevanceLabel(relevance)}
      </Txt>
    </View>
  );
}

function ResultCard({ quest }: { quest: QuestSearchResult }) {
  const { t } = useTranslation();
  const pastel = pillarPastels(quest.pillar).base;
  const minutes = quest.timeEstimateMinutes ? t('questSearch.min', { timeEstimateMinutes: quest.timeEstimateMinutes }) : '';
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={t('questSearch.questXpRelevancePercent', { title: quest.title, pillar: PILLAR_LABELS[quest.pillar], xpReward: quest.xpReward, relevance: quest.relevance, description: quest.description })}
    >
      <View style={styles.cardHead}>
        <View style={[styles.glyph, { backgroundColor: pastel }]}>
          <PillarGlyph pillar={quest.pillar} size={16} color={colors.ink} />
        </View>
        <View style={styles.cardTitle}>
          <Txt variant="bodySemi" numberOfLines={2}>
            {quest.title}
          </Txt>
          <Txt variant="caption" color={colors.inkSoft}>
            {`${PILLAR_LABELS[quest.pillar]} · ${quest.difficulty} · ${quest.xpReward} XP${minutes}`}
          </Txt>
        </View>
        <RelevancePill relevance={quest.relevance} />
      </View>
      <Txt variant="body" color={colors.inkSoft} style={styles.desc}>
        {quest.description}
      </Txt>
    </View>
  );
}

export function QuestSearchResults({ search }: { search: QuestSearchState }) {
  const { t } = useTranslation();
  useTheme();
  if (search.error) {
    return (
      <View style={styles.message}>
        <Txt variant="body" color={colors.danger}>
          {search.error}
        </Txt>
        <Pressable
          onPress={search.retry}
          accessibilityRole="button"
          accessibilityLabel={t('questSearch.tryTheSearchAgain')}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Txt variant="bodySemi" color={colors.accent}>
            {t('questSearch.tryAgain')}
          </Txt>
        </Pressable>
      </View>
    );
  }
  if (!search.query) {
    return (
      <Txt variant="caption" color={colors.inkSoft} style={styles.message}>
        {t('questSearch.typeAtLeast3')}
      </Txt>
    );
  }
  if (search.results.length === 0) {
    return (
      <Txt variant="body" color={colors.inkSoft} style={styles.message}>
        {search.searching ? t('questSearch.searchingTheQuestLibrary') : t('questSearch.noQuestsFound')}
      </Txt>
    );
  }
  return (
    <View accessibilityRole="list" accessibilityLabel={t('questSearch.topQuestsFor', { length: search.results.length, query: search.query })}>
      <Txt variant="label" color={colors.inkSoft} style={styles.heading}>
        {t('questSearch.questLibraryBestMatches')}
      </Txt>
      {search.results.map((q) => (
        <ResultCard key={q.id} quest={q} />
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: radius.pill,
      backgroundColor: colors.card,
      marginBottom: spacing.md,
    },
    leading: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      minHeight: 44,
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.ink,
      paddingVertical: 0,
    },
    clear: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.6,
    },
    heading: {
      marginBottom: spacing.sm,
    },
    card: {
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: spacing.md,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    glyph: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginEnd: spacing.md,
    },
    cardTitle: {
      flex: 1,
      marginEnd: spacing.sm,
    },
    pill: {
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    desc: {
      marginTop: spacing.sm,
    },
    message: {
      marginVertical: spacing.md,
    },
    retry: {
      minHeight: 44,
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
  }),
);
