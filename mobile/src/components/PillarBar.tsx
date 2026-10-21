import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  colors,
  PILLAR_LABELS,
  Pillar,
  radius,
  spacing,
  themed,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { PillarGlyph } from './icons';
import Txt from './Txt';

export interface PillarBarProps {
  pillar: Pillar;
  value: number; // 0 to 100
  showValue?: boolean;
}

export function PillarBar({ pillar, value, showValue = true }: PillarBarProps) {
  useTheme();
  const clamped = Math.max(0, Math.min(100, value));
  const color = colors.pillar[pillar];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <PillarGlyph pillar={pillar} size={16} />
          <Txt variant="body" style={styles.label}>
            {PILLAR_LABELS[pillar]}
          </Txt>
        </View>
        {showValue ? (
          <Txt variant="caption" color={colors.inkSoft}>
            {Math.round(clamped)}%
          </Txt>
        ) : null}
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${clamped}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    label: {
      marginLeft: spacing.sm,
      fontSize: 14,
    },
    track: {
      height: 6,
      borderRadius: radius.xs,
      backgroundColor: colors.paperAlt,
      overflow: 'hidden',
    },
    fill: {
      height: 6,
      borderRadius: radius.xs,
    },
  }),
);

export default PillarBar;
