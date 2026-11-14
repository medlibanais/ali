import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Quest } from '../api/types';
import {
  blockTiles,
  colors,
  PILLAR_LABELS,
  pillarPastels,
  radius,
  softSurface,
  spacing,
  themed,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CheckGlyph, SparklesGlyph, StarGlyph } from './icons';
import { PressableScale } from './Motion';
import Txt from './Txt';

export interface QuestRowProps {
  quest: Quest;
  onPress?: (quest: Quest) => void;
  /** When set, the checkbox completes the quest in place. */
  onComplete?: (quest: Quest) => void;
  showPillarLabel?: boolean;
}

const DIFFICULTY_LABELS: Record<Quest['difficulty'], string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export function QuestRow({
  quest,
  onPress,
  onComplete,
  showPillarLabel = false,
}: QuestRowProps) {
  useTheme();
  const pillarColor = colors.pillar[quest.pillar];
  const pastel = pillarPastels(quest.pillar);
  const dimmed = quest.skipped === true;
  // Block tiles: the whole row takes the pillar color with black text.
  const block = blockTiles();
  const tileInk = colors.onAccent;
  const blockRow = block
    ? { backgroundColor: pillarColor, borderWidth: 0 }
    : null;

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress ? () => onPress(quest) : undefined}
      disabled={!onPress || dimmed}
      pressedScale={0.98}
      style={[styles.row, blockRow, dimmed && styles.dimmed]}
    >
      {onComplete && !quest.completed && !dimmed ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: false }}
          accessibilityLabel={`Complete ${quest.title}`}
          onPress={() => onComplete(quest)}
          hitSlop={11}
          style={({ pressed }) => [
            styles.check,
            block
              ? { borderColor: tileInk, backgroundColor: 'transparent' }
              : { borderColor: pastel.base },
            pressed && { backgroundColor: block ? withAlpha(tileInk, 0.15) : pastel.tint },
          ]}
        />
      ) : (
        <View
          style={[
            styles.check,
            block && { borderColor: tileInk, backgroundColor: 'transparent' },
            quest.completed && styles.checkDone,
            quest.completed && block && { backgroundColor: tileInk, borderColor: tileInk },
          ]}
        >
          {quest.completed ? <CheckGlyph size={14} /> : null}
        </View>
      )}
      <View style={styles.body}>
        <Txt
          variant="bodySemi"
          color={block ? tileInk : quest.completed ? colors.inkSoft : colors.ink}
          numberOfLines={1}
        >
          {quest.title}
        </Txt>
        <View style={styles.metaRow}>
          <Txt
            variant="caption"
            color={block ? withAlpha(tileInk, 0.68) : colors.inkSoft}
            style={styles.metaText}
            numberOfLines={1}
          >
            {showPillarLabel
              ? `${PILLAR_LABELS[quest.pillar]} · ${DIFFICULTY_LABELS[quest.difficulty]}`
              : DIFFICULTY_LABELS[quest.difficulty]}
            {quest.time_estimate_minutes ? ` · ${quest.time_estimate_minutes} min` : ''}
          </Txt>
          {quest.is_ai_generated ? (
            <View style={[styles.coachTag, block && { backgroundColor: withAlpha(tileInk, 0.12) }]}>
              <SparklesGlyph size={12} color={block ? tileInk : colors.accent} />
              <Txt
                variant="caption"
                color={block ? tileInk : colors.accent}
                style={styles.coachText}
              >
                Coach pick
              </Txt>
            </View>
          ) : null}
          {dimmed ? (
            <Txt variant="caption" color={block ? tileInk : colors.inkFaint} style={styles.metaText}>
              {' · Skipped'}
            </Txt>
          ) : null}
        </View>
      </View>
      <View style={[styles.xpPill, block && { backgroundColor: tileInk }]}>
        <StarGlyph size={13} />
        <Txt variant="bodySemi" color={block ? colors.ink : colors.ink} style={styles.xp}>
          {`+${quest.xp_reward} XP`}
        </Txt>
      </View>
    </PressableScale>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md + 2,
      paddingHorizontal: spacing.lg,
      ...softSurface(1),
      borderRadius: radius.md + 2,
      marginBottom: spacing.md,
    },
    dimmed: {
      opacity: 0.55,
    },
    check: {
      width: 26,
      height: 26,
      borderWidth: 2,
      borderColor: colors.inkFaint,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
      backgroundColor: colors.card,
    },
    checkDone: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    body: {
      flex: 1,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      marginTop: 3,
    },
    metaText: {
      fontSize: 13,
      lineHeight: 18,
    },
    coachTag: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: spacing.sm,
      paddingHorizontal: spacing.sm - 1,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(colors.accent, 0.12),
    },
    coachText: {
      fontSize: 12,
      lineHeight: 16,
      marginLeft: 4,
    },
    xpPill: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: spacing.md,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.paper,
    },
    xp: {
      marginLeft: 4,
      fontSize: 13,
      lineHeight: 17,
    },
  }),
);

export default QuestRow;
