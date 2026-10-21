import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { radius, softSurface, spacing, themed } from '../theme/tokens';
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
      ...softSurface(1),
      borderRadius: radius.lg,
    },
    padded: {
      padding: spacing.xl - 4,
    },
  }),
);

export default Card;
