import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Txt from './Txt';

export interface EmptyStateProps {
  title: string;
  body?: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  useTheme();
  return (
    <View style={styles.container}>
      <Txt variant="heading" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt
          variant="caption"
          color={colors.inkSoft}
          align="center"
          style={styles.body}
        >
          {body}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  body: {
    marginTop: spacing.sm,
  },
});

export default EmptyState;
