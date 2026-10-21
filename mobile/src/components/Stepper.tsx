import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { MinusGlyph, PlusGlyph } from './icons';
import Txt from './Txt';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
}: StepperProps) {
  useTheme();
  const canDecrease = value - step >= min;
  const canIncrease = value + step <= max;

  const adjust = (delta: number) => {
    const next = Math.round((value + delta) * 10) / 10;
    if (next >= min && next <= max) {
      onChange(next);
    }
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        accessibilityState={{ disabled: !canDecrease }}
        onPress={() => adjust(-step)}
        disabled={!canDecrease}
        style={({ pressed }) => [
          styles.button,
          !canDecrease && styles.buttonDisabled,
          pressed && canDecrease && styles.pressed,
        ]}
      >
        <MinusGlyph color={canDecrease ? colors.inkSoft : colors.inkFaint} />
      </Pressable>
      <View style={styles.valueWrap}>
        <Txt variant="title" align="center">
          {formatValue(value)}
          {unit ? ` ${unit}` : ''}
        </Txt>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        accessibilityState={{ disabled: !canIncrease }}
        onPress={() => adjust(step)}
        disabled={!canIncrease}
        style={({ pressed }) => [
          styles.button,
          !canIncrease && styles.buttonDisabled,
          pressed && canIncrease && styles.pressed,
        ]}
      >
        <PlusGlyph color={canIncrease ? colors.inkSoft : colors.inkFaint} />
      </Pressable>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    button: {
      width: 44,
      height: 44,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: {
      backgroundColor: colors.paperAlt,
    },
    pressed: {
      opacity: 0.96,
    },
    valueWrap: {
      flex: 1,
      paddingHorizontal: spacing.md,
    },
  }),
);

export default Stepper;
