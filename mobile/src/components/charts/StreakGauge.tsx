// Circular gauge for the streak outlook: a 240-degree arc that fills to the
// predicted chance of keeping the streak tomorrow, colored red / yellow /
// green by risk band, with the percentage and band label in the middle.
// "Not enough data" draws only the empty track and a dash.
//
// The fill animates once on mount (JS-driven, about 700 ms) unless the
// user has reduce motion on. One <Circle> per arc, drawn with a dash
// array, so it renders the same on Android and on web.

import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Txt from '../Txt';
import { BAND_LABEL, streakBand, type StreakBand } from '../../features/analytics/streakPrediction';
import { colors, isDarkPalette, radius, spacing, withAlpha } from '../../theme/tokens';
import { RISK_COLORS } from '../../theme/themes';
import { useTheme } from '../../theme/useTheme';

const SWEEP = 240; // degrees of arc
const START = 150; // degrees, clockwise from 3 o'clock: the gap sits at the bottom
const DURATION_MS = 700;

export interface StreakGaugeProps {
  /** 0-100, or null for "Not enough data". */
  probability: number | null;
  size?: number;
  strokeWidth?: number;
}

export function bandColor(band: StreakBand): string {
  const set = isDarkPalette() ? RISK_COLORS.dark : RISK_COLORS.light;
  switch (band) {
    case 'high_risk':
      return set.high;
    case 'moderate':
      return set.moderate;
    case 'on_track':
      return set.onTrack;
    default:
      return colors.inkFaint;
  }
}

function useAnimatedFraction(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce || target === 0) {
          setValue(target);
          return;
        }
        const start = Date.now();
        const tick = () => {
          if (cancelled) return;
          const t = Math.min(1, (Date.now() - start) / DURATION_MS);
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(target * eased);
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [target]);
  return value;
}

export function StreakGauge({ probability, size = 176, strokeWidth = 14 }: StreakGaugeProps) {
  const { t } = useTranslation();
  useTheme();
  const band = streakBand(probability);
  const color = bandColor(band);
  const target = probability === null ? 0 : Math.min(Math.max(probability, 0), 100) / 100;
  const fraction = useAnimatedFraction(target);

  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const arc = (circumference * SWEEP) / 360;
  const filled = arc * fraction;

  return (
    <View style={styles.wrap} accessible={false}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={withAlpha(colors.ink, 0.12)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
            fill="none"
            rotation={START}
            origin={`${c}, ${c}`}
          />
          {band !== 'no_data' && filled > 0.5 ? (
            <Circle
              cx={c}
              cy={c}
              r={r}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              fill="none"
              rotation={START}
              origin={`${c}, ${c}`}
            />
          ) : null}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Txt variant="display" color={band === 'no_data' ? colors.inkFaint : colors.ink}>
            {probability === null ? '—' : `${Math.round(fraction * 100)}%`}
          </Txt>
          <Txt variant="caption" color={colors.inkSoft}>
            {t('streakOutlook.tomorrow')}
          </Txt>
        </View>
      </View>
      <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.16), borderColor: color }]}>
        <Txt variant="bodySemi" color={color}>
          {BAND_LABEL[band]}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    marginTop: -spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});

export default StreakGauge;
