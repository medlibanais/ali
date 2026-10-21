// PillarBubble: circular pillar badge with an SVG progress ring.
// Pure SVG (no chart libs). Used by PillarOrbit on the Today screen.

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Txt from './Txt';
import { PillarGlyph } from './icons';
import { radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export type PillarId = 'health' | 'family' | 'work' | 'fun' | 'spirituality';

export const BUBBLE_COLORS: Record<PillarId, string> = {
  health: '#e07a5f',
  family: '#81b29a',
  work: '#3d5a80',
  fun: '#f2cc8f',
  spirituality: '#9d8189',
};

const LABELS: Record<PillarId, string> = {
  health: 'HEALTH',
  family: 'FAMILY',
  work: 'WORK',
  fun: 'FUN',
  spirituality: 'SPIRIT',
};

const BUBBLE_BG = '#26221C';
const TRACK = 'rgba(255,255,255,0.08)';

export interface PillarBubbleProps {
  pillar: PillarId;
  score: number; // 0-100
  size?: number;
  expanded: boolean;
  onPress: (pillar: PillarId) => void;
}

export function PillarBubble({
  pillar,
  score,
  size = 76,
  expanded,
  onPress,
}: PillarBubbleProps) {
  useTheme();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = BUBBLE_COLORS[pillar];

  const strokeWidth = 4;
  const radius_ = (size - strokeWidth * 2 - 4) / 2;
  const circumference = 2 * Math.PI * radius_;
  const progress = (clamped / 100) * circumference;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${LABELS[pillar]}, ${clamped} percent`}
      accessibilityState={{ expanded }}
      onPress={() => onPress(pillar)}
      style={({ pressed }) => [
        styles.pressable,
        { width: Math.max(size, 44), height: Math.max(size, 44) },
        clamped < 50 && styles.dimmed,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BUBBLE_BG,
          },
          expanded && { borderColor: color, borderWidth: 2 },
        ]}
      >
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius_}
            stroke={TRACK}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius_}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeDashoffset={circumference / 4}
            strokeLinecap="round"
          />
        </Svg>
        <View style={styles.content} pointerEvents="none">
          <PillarGlyph pillar={pillar} size={16} color={color} />
          <Txt
            variant="caption"
            color="rgba(255,255,255,0.62)"
            style={styles.label}
          >
            {LABELS[pillar]}
          </Txt>
          <Txt variant="bodySemi" color="#FDFBF6" style={styles.score}>
            {clamped}
          </Txt>
        </View>
      </View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pressable: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    dimmed: {
      opacity: 0.6,
    },
    pressed: {
      opacity: 0.85,
    },
    circle: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    content: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontSize: 8,
      letterSpacing: 1.1,
      marginTop: 2,
    },
    score: {
      fontSize: 15,
      lineHeight: 18,
    },
  }),
);

export default PillarBubble;
