import React from 'react';
import { ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, softShadow, spacing, themed, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { PressableScale } from './Motion';
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
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
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
    </PressableScale>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    base: {
      minHeight: 52,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    primary: {
      backgroundColor: colors.accent,
      ...softShadow(2),
      shadowColor: colors.accent,
    },
    secondary: {
      backgroundColor: withAlpha(colors.accent, 0.1),
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    disabled: {
      opacity: 0.45,
    },
  }),
);

export default Button;
