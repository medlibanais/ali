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
              index > 0 && styles.segmentDivider,
              selected && styles.segmentSelected,
              pressed && styles.pressed,
            ]}
          >
            <Txt
              variant="bodySemi"
              color={selected ? colors.accent : colors.inkSoft}
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
    container: {
      flexDirection: 'row',
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.paperAlt,
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    segmentDivider: {
      borderLeftWidth: borderWidth.hairline,
      borderLeftColor: colors.line,
    },
    segmentSelected: {
      backgroundColor: colors.card,
    },
    pressed: {
      opacity: 0.96,
    },
    text: {
      fontSize: 13,
    },
  }),
);

export default SegmentedControl;
