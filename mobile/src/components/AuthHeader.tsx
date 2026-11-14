// AuthHeader: the brand mark, screen title and one line of context shared
// by the sign-in, sign-up and password screens, so every auth screen
// opens the same way: who we are, where you are, what to do.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { SparklesGlyph } from './icons';
import Txt from './Txt';

export interface AuthHeaderProps {
  title: string;
  subtitle: string;
}

export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.brand} accessibilityRole="header" accessibilityLabel="GROW">
        <View style={styles.mark}>
          <SparklesGlyph size={16} color={colors.onAccent} />
        </View>
        <Txt variant="label" color={colors.ink} style={styles.wordmark}>
          GROW
        </Txt>
      </View>
      <Txt variant="display">{title}</Txt>
      <Txt variant="body" color={colors.inkSoft} style={styles.subtitle}>
        {subtitle}
      </Txt>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: {
      marginTop: spacing.xl,
      marginBottom: spacing.xl,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xxl,
    },
    mark: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
      shadowColor: colors.accent,
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
    },
    wordmark: {
      marginLeft: spacing.sm + 2,
      fontSize: 13,
      letterSpacing: 2.4,
    },
    subtitle: {
      marginTop: spacing.sm,
      fontSize: 16,
      lineHeight: 24,
      maxWidth: 340,
    },
  }),
);

export default AuthHeader;
