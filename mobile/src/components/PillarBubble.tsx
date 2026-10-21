// PillarBubble: a pastel pillar orb with an SVG progress ring, the pillar
// icon in its soft core and the pillar name underneath (Figma "Pillar
// bubble" component). Used by PillarOrbit on the Today screen.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Txt from './Txt';
import { PillarGlyph } from './icons';
import { PressableScale } from './Motion';
import { colors, PILLAR_LABELS, pillarPastels, softShadow, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export type PillarId = 'health' | 'family' | 'work' | 'fun' | 'spirituality';

export interface PillarBubbleProps {
  pillar: PillarId;
  score: number; // 0-100
  size?: number;
  /** Quest progress for this pillar today, read out by screen readers. */
  done?: number;
  total?: number;
  expanded: boolean;
  onPress: (pillar: PillarId) => void;
  /** Smaller label for dense rows (Profile's pillar row). */
  compact?: boolean;
}

export function PillarBubble({
  pillar,
  score,
  size = 84,
  done,
  total,
  expanded,
  onPress,
  compact = false,
}: PillarBubbleProps) {
  useTheme();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { ink, base, tint } = pillarPastels(pillar);

  const strokeWidth = Math.max(5, Math.round(size * 0.08));
  const ringRadius = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * ringRadius;
  const progress = (clamped / 100) * circumference;
  const core = size - strokeWidth * 2 - 10;
  const hasCount = total !== undefined && total > 0;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={
        `${PILLAR_LABELS[pillar]}, ${clamped} percent` +
        (hasCount ? `, ${done ?? 0} of ${total} quests done` : '')
      }
      accessibilityState={{ selected: expanded }}
      onPress={() => onPress(pillar)}
      pressedScale={0.92}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={[styles.pressable, { width: size, height: size }]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          expanded && styles.lifted,
        ]}
      >
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={ringRadius}
            stroke={tint}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {clamped > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={ringRadius}
              stroke={expanded ? ink : base}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${progress} ${circumference - progress}`}
              strokeDashoffset={circumference / 4}
              strokeLinecap="round"
            />
          ) : null}
        </Svg>
        <View
          style={[
            styles.core,
            {
              width: core,
              height: core,
              borderRadius: core / 2,
              backgroundColor: expanded ? base : tint,
            },
          ]}
          pointerEvents="none"
        >
          <PillarGlyph
            pillar={pillar}
            size={Math.round(core * 0.42)}
            color={expanded ? colors.card : ink}
          />
        </View>
      </View>
      <Txt
        variant="label"
        color={colors.ink}
        style={[styles.label, compact && styles.labelCompact]}
        numberOfLines={1}
      >
        {PILLAR_LABELS[pillar]}
      </Txt>
    </PressableScale>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pressable: {
      alignItems: 'center',
    },
    circle: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      ...softShadow(2),
    },
    lifted: {
      transform: [{ scale: 1.08 }],
    },
    core: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      position: 'absolute',
      bottom: -22,
      width: 110,
      // react-native-web caps a numberOfLines text at its parent's width;
      // the label is wider than the bubble on purpose.
      maxWidth: 110,
      textAlign: 'center',
    },
    labelCompact: {
      bottom: -19,
      width: 84,
      maxWidth: 84,
      fontSize: 11,
      lineHeight: 14,
    },
  }),
);

export default PillarBubble;
