import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export function Card({ children, style, padded = true }: CardProps) {
  useTheme();
  return (
    <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
    },
    padded: {
      padding: spacing.lg,
    },
  }),
);

export default Card;
