import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Txt from './Txt';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Txt
        variant="body"
        color={selected ? colors.accent : colors.inkSoft}
        style={styles.text}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chip: {
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginRight: spacing.sm,
      marginBottom: spacing.sm,
      minHeight: 36,
      justifyContent: 'center',
    },
    selected: {
      borderColor: colors.accent,
      backgroundColor: colors.paperAlt,
    },
    pressed: {
      opacity: 0.96,
    },
    text: {
      fontSize: 14,
    },
  }),
);

export default Chip;
