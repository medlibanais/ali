import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { borderWidth, colors, isDarkPalette, radius, softShadow, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Glass from './Glass';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

/** Frosted panel: the screen's ambient glow seeps through the surface. */
export function Card({ children, style, padded = true }: CardProps) {
  useTheme();
  return (
    <Glass style={[styles.card, padded && styles.padded, style]} intensity={36} tint={0.6}>
      {children}
    </Glass>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      borderWidth: isDarkPalette() ? borderWidth.hairline : 0,
      borderColor: colors.outline ?? colors.line,
      ...softShadow(1),
    },
    padded: {
      padding: spacing.xl - 4,
    },
  }),
);

export default Card;
