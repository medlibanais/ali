import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Txt from './Txt';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.onAccent : colors.accent}
        />
      ) : (
        <Txt
          variant="bodySemi"
          color={
            variant === 'primary'
              ? colors.onAccent
              : variant === 'secondary'
                ? colors.accent
                : colors.inkSoft
          }
        >
          {title}
        </Txt>
      )}
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    base: {
      minHeight: 48,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    primary: {
      backgroundColor: colors.accent,
    },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: borderWidth.hairline,
      borderColor: colors.accent,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    pressed: {
      opacity: 0.96,
    },
    disabled: {
      opacity: 0.45,
    },
  }),
);

export default Button;
