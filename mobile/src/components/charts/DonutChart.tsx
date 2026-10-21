// Donut chart with legend + center label. Pillar colors supported.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Txt from '../Txt';
import { PILLAR_LABELS, PILLARS, colors, spacing, themed } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export interface DonutDatum {
  key: string;
  label?: string;
  value: number;
  color?: string;
}

export function DonutChart({
  data,
  size = 180,
  thickness = 22,
  centerLabel,
  emptyLabel = 'No data yet',
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  emptyLabel?: string;
}) {
  useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <View style={[styles.empty, { height: size / 2 }]}>
        <Txt variant="caption" color={colors.inkFaint}>
          {emptyLabel}
        </Txt>
      </View>
    );
  }

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2},${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.line}
            strokeWidth={thickness}
            fill="none"
          />
          {data.map((d) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const circle = (
              <Circle
                key={d.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={
                  d.color ??
                  ((PILLARS as string[]).includes(d.key)
                    ? colors.pillar[d.key as (typeof PILLARS)[number]]
                    : colors.accent)
                }
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                fill="none"
              />
            );
            offset += dash;
            return circle;
          })}
        </G>
      </Svg>
      {centerLabel ? (
        <View style={[styles.center, { width: size, height: size }]} pointerEvents="none">
          <Txt variant="heading" align="center">
            {centerLabel}
          </Txt>
        </View>
      ) : null}
      <View style={styles.legend}>
        {data.map((d) => (
          <View key={d.key} style={styles.legendRow}>
            <View
              style={[
                styles.legendDot,
                {
                  backgroundColor:
                    d.color ??
                    ((PILLARS as string[]).includes(d.key)
                      ? colors.pillar[d.key as (typeof PILLARS)[number]]
                      : colors.accent),
                },
              ]}
            />
            <Txt variant="caption" color={colors.inkSoft}>
              {`${d.label ?? ((PILLARS as string[]).includes(d.key) ? PILLAR_LABELS[d.key as (typeof PILLARS)[number]] : d.key)} · ${Math.round((100 * d.value) / total)}%`}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: {
      alignItems: 'center',
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: {
      position: 'absolute',
      top: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    legend: {
      marginTop: spacing.md,
      alignSelf: 'stretch',
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: spacing.sm,
    },
  }),
);

export default DonutChart;
