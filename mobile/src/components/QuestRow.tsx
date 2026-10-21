import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Quest } from '../api/types';
import {
  colors,
  PILLAR_LABELS,
  pillarPastels,
  radius,
  softSurface,
  spacing,
  themed,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CheckGlyph, StarGlyph } from './icons';
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

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress ? () => onPress(quest) : undefined}
      disabled={!onPress || dimmed}
      pressedScale={0.98}
      style={[styles.row, dimmed && styles.dimmed]}
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
            { borderColor: pastel.base },
            pressed && { backgroundColor: pastel.tint },
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
              { backgroundColor: pastel.tint },
            ]}
          >
            <Txt
              variant="caption"
              color={pillarColor}
              style={styles.tagText}
            >
              {showPillarLabel
                ? `${PILLAR_LABELS[quest.pillar]} · ${DIFFICULTY_LABELS[quest.difficulty]}`
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
      <View style={styles.xpPill}>
        <StarGlyph size={15} />
        <Txt variant="label" color={colors.ink} style={styles.xp}>
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
      width: 24,
      height: 24,
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
      marginTop: spacing.xs,
    },
    tag: {
      marginBottom: 2,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 2,
      marginRight: spacing.sm,
    },
    coachTag: {
      backgroundColor: colors.paperAlt,
    },
    tagText: {
      fontSize: 12,
      lineHeight: 16,
    },
    xpPill: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: spacing.md,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.paperAlt,
    },
    xp: {
      marginLeft: 5,
    },
  }),
);

export default QuestRow;
