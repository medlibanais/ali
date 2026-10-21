// PillarBubble: circular pillar badge with an SVG progress ring.
// Pure SVG (no chart libs). Used by PillarOrbit on the Today screen.

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Txt from './Txt';
import { PillarGlyph } from './icons';
import { colors, themed, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export type PillarId = 'health' | 'family' | 'work' | 'fun' | 'spirituality';

const LABELS: Record<PillarId, string> = {
  health: 'HEALTH',
  family: 'FAMILY',
  work: 'WORK',
  fun: 'FUN',
  spirituality: 'SPIRIT',
};

export interface PillarBubbleProps {
  pillar: PillarId;
  score: number; // 0-100
  size?: number;
  /** Quest progress for this pillar today, shown under the score. */
  done?: number;
  total?: number;
  expanded: boolean;
  onPress: (pillar: PillarId) => void;
}

export function PillarBubble({
  pillar,
  score,
  size = 76,
  done,
  total,
  expanded,
  onPress,
}: PillarBubbleProps) {
  useTheme();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = colors.pillar[pillar];

  const strokeWidth = 5;
  const radius_ = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * radius_;
  const progress = (clamped / 100) * circumference;
  const showCount = total !== undefined && total > 0;
  const small = size < 70;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        `${LABELS[pillar]}, ${clamped} percent` +
        (showCount ? `, ${done ?? 0} of ${total} quests done` : '')
      }
      accessibilityState={{ selected: expanded }}
      onPress={() => onPress(pillar)}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={({ pressed }) => [
        styles.pressable,
        { width: size, height: size },
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
            backgroundColor: expanded ? withAlpha(color, 0.14) : colors.card,
          },
          expanded && styles.lifted,
        ]}
      >
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius_}
            stroke={withAlpha(color, 0.16)}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {clamped > 0 ? (
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
          ) : null}
        </Svg>
        <View style={styles.content} pointerEvents="none">
          <PillarGlyph pillar={pillar} size={small ? 14 : 16} color={color} />
          <Txt
            variant="bodySemi"
            color={colors.ink}
            style={[styles.score, small && styles.scoreSmall]}
          >
            {`${clamped}%`}
          </Txt>
          {showCount ? (
            <Txt variant="caption" color={colors.inkFaint} style={styles.count}>
              {`${done ?? 0}/${total}`}
            </Txt>
          ) : null}
        </View>
      </View>
      <Txt
        variant="caption"
        color={expanded ? color : colors.inkSoft}
        style={styles.label}
        numberOfLines={1}
      >
        {LABELS[pillar]}
      </Txt>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pressable: {
      alignItems: 'center',
    },
    pressed: {
      opacity: 0.85,
    },
    circle: {
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.ink,
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    lifted: {
      transform: [{ scale: 1.08 }],
    },
    content: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    score: {
      fontSize: 15,
      lineHeight: 18,
      marginTop: 1,
    },
    scoreSmall: {
      fontSize: 13,
      lineHeight: 15,
    },
    count: {
      fontSize: 10,
      lineHeight: 12,
    },
    label: {
      position: 'absolute',
      bottom: -16,
      width: 80,
      textAlign: 'center',
      fontSize: 10,
      letterSpacing: 1.1,
    },
  }),
);

export default PillarBubble;
