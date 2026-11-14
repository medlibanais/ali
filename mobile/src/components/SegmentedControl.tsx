import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Txt from './Txt';

export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  useTheme();
  return (
    <View style={styles.container}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && styles.pressed,
            ]}
          >
            <Txt
              variant="bodySemi"
              color={selected ? colors.ink : colors.inkSoft}
              style={styles.text}
              numberOfLines={1}
            >
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    // Recessed track with a raised thumb: the selected segment is the
    // lightest surface, so the current choice reads at a glance.
    container: {
      flexDirection: 'row',
      padding: 4,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm + 2,
      backgroundColor: colors.card,
    },
    segment: {
      flex: 1,
      minHeight: 40,
      borderRadius: radius.sm - 2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    segmentSelected: {
      backgroundColor: colors.paperAlt,
      borderWidth: borderWidth.hairline,
      borderColor: colors.outline ?? colors.line,
    },
    pressed: {
      opacity: 0.96,
    },
    text: {
      fontSize: 14,
    },
  }),
);

export default SegmentedControl;
