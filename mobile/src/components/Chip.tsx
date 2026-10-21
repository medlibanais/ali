import React from 'react';
import { StyleSheet, View } from 'react-native';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { PressableScale } from './Motion';
import Txt from './Txt';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Small colored dot before the label (pillar filters). */
  dotColor?: string;
}

export function Chip({ label, selected, onPress, dotColor }: ChipProps) {
  useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      pressedScale={0.94}
      style={[styles.chip, selected && styles.selected]}
    >
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Txt
        variant="bodySemi"
        color={selected ? colors.card : colors.ink}
        style={styles.text}
      >
        {label}
      </Txt>
    </PressableScale>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    // Pill: sized by its label, never stretched by the row around it.
    chip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      height: 36,
      borderRadius: radius.pill,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.lg - 2,
      marginRight: spacing.sm,
      marginBottom: spacing.sm,
    },
    selected: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 7,
    },
    text: {
      fontSize: 14,
    },
  }),
);

export default Chip;
