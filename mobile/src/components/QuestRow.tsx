import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Quest } from '../api/types';
import {
  borderWidth,
  colors,
  PILLAR_LABELS,
  radius,
  spacing,
  themed,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CheckGlyph, PillarGlyph } from './icons';
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
  const dimmed = quest.skipped === true;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ? () => onPress(quest) : undefined}
      disabled={!onPress || dimmed}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && styles.pressed,
        dimmed && styles.dimmed,
      ]}
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
            { borderColor: pillarColor },
            pressed && { backgroundColor: withAlpha(pillarColor, 0.2) },
          ]}
        />
      ) : (
        <View style={[styles.check, quest.completed && styles.checkDone]}>
          {quest.completed ? <CheckGlyph size={14} /> : null}
        </View>
      )}
      <View style={styles.body}>
        <Txt
          variant="bodySemi"
          color={quest.completed ? colors.inkSoft : colors.ink}
          numberOfLines={1}
        >
          {quest.title}
        </Txt>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.tag,
              { backgroundColor: withAlpha(pillarColor, 0.12) },
            ]}
          >
            <Txt
              variant="caption"
              color={pillarColor}
              style={styles.tagText}
            >
              {showPillarLabel
                ? `${PILLAR_LABELS[quest.pillar]}, ${DIFFICULTY_LABELS[quest.difficulty]}`
                : DIFFICULTY_LABELS[quest.difficulty]}
            </Txt>
          </View>
          {quest.is_ai_generated ? (
            <View style={[styles.tag, styles.coachTag]}>
              <Txt
                variant="caption"
                color={colors.accent}
                style={styles.tagText}
              >
                Coach pick
              </Txt>
            </View>
          ) : null}
          {dimmed ? (
            <Txt variant="caption" color={colors.inkFaint} style={styles.tagText}>
              Skipped
            </Txt>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        <PillarGlyph pillar={quest.pillar} size={18} />
        <Txt variant="caption" color={colors.inkSoft} style={styles.xp}>
          {quest.xp_reward} XP
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.card,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
    },
    pressed: {
      opacity: 0.96,
    },
    dimmed: {
      opacity: 0.55,
    },
    check: {
      width: 22,
      height: 22,
      borderWidth: borderWidth.hairline,
      borderColor: colors.inkFaint,
      borderRadius: radius.xs,
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
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    tag: {
      borderRadius: radius.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      marginRight: spacing.sm,
    },
    coachTag: {
      backgroundColor: colors.paperAlt,
    },
    tagText: {
      fontSize: 11,
      letterSpacing: 0.3,
    },
    right: {
      alignItems: 'center',
      marginLeft: spacing.md,
    },
    xp: {
      marginTop: spacing.xs,
      fontSize: 11,
    },
  }),
);

export default QuestRow;
