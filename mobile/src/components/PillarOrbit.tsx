// PillarOrbit: the heart of the Today screen. The user's avatar sits in the
// middle and the five pillars orbit around it, each joined to the avatar by
// a spoke whose strength follows that pillar's progress today.
// Angles are degrees, 0° = right, clockwise: health top, then work,
// family, fun, spirituality around the circle.

import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import AvatarView from '../avatar/AvatarView';
import { moodForScore, type AvatarConfig } from '../avatar/types';
import Avatar from './Avatar';
import PillarBubble, { type PillarId } from './PillarBubble';
import { colors, PILLARS, themed, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const ORBIT_ANGLES: Record<PillarId, number> = {
  health: -90,
  work: -18,
  family: 54,
  fun: 126,
  spirituality: 198,
};

const ORBIT_ORDER: PillarId[] = ['health', 'work', 'family', 'fun', 'spirituality'];

// Screen applies 24px side padding; keep the orbit inside it on small phones.
const SCREEN_GUTTER = 48;
const MAX_SIZE = 380;
const MIN_SIZE = 270;
// Room under the lowest bubbles for their labels.
const LABEL_ROOM = 20;

export interface PillarOrbitProps {
  avatarConfig: AvatarConfig;
  /** Real or AI photo. When set it replaces the drawn avatar in the center. */
  photoUrl?: string | null;
  name?: string | null;
  scores: Record<PillarId, number>;
  /** Today's quest counts per pillar, shown inside each bubble. */
  progress?: Partial<Record<PillarId, { done: number; total: number }>>;
  expandedPillar: PillarId | null;
  onPillarPress: (pillar: PillarId) => void;
}

export function PillarOrbit({
  avatarConfig,
  photoUrl,
  name,
  scores,
  progress,
  expandedPillar,
  onPillarPress,
}: PillarOrbitProps) {
  useTheme();
  const { width } = useWindowDimensions();
  const size = Math.round(
    Math.max(MIN_SIZE, Math.min(MAX_SIZE, width - SCREEN_GUTTER)),
  );
  const bubbleSize = Math.round(Math.max(60, Math.min(78, size * 0.2)));
  const orbitRadius = size / 2 - bubbleSize / 2 - 2;
  const center = size / 2;
  const discRadius = size * 0.22;
  const avatarHeight = Math.round(size * 0.42);
  const photoSize = Math.round(discRadius * 1.8);

  // The avatar's expression reflects the day (average of the five scores).
  const average =
    PILLARS.reduce((sum, pillar) => sum + (scores[pillar] ?? 0), 0) /
    PILLARS.length;
  const mood = moodForScore(average);

  const positions = ORBIT_ORDER.map((pillar) => {
    const angle = (ORBIT_ANGLES[pillar] * Math.PI) / 180;
    return {
      pillar,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
    };
  });

  return (
    <View style={styles.outer}>
      <View
        style={{ width: size, height: size + LABEL_ROOM }}
        accessibilityLabel="Your avatar with your five pillars around it"
      >
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={center}
            cy={center}
            r={orbitRadius}
            stroke={colors.line}
            strokeWidth={1}
            strokeDasharray="3 5"
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={discRadius}
            fill={colors.paperAlt}
          />
          {positions.map(({ pillar, cos, sin }) => {
            const score = Math.max(0, Math.min(100, scores[pillar] ?? 0));
            const selected = expandedPillar === pillar;
            const from = discRadius + 4;
            // Bubbles above the avatar carry their label underneath, toward it.
            const to = orbitRadius - bubbleSize / 2 - (sin < -0.5 ? LABEL_ROOM : 2);
            if (to <= from) return null;
            return (
              <Line
                key={pillar}
                x1={center + cos * from}
                y1={center + sin * from}
                x2={center + cos * to}
                y2={center + sin * to}
                stroke={withAlpha(
                  colors.pillar[pillar],
                  selected ? 0.9 : 0.18 + (score / 100) * 0.62,
                )}
                strokeWidth={selected ? 3 : 1.5 + (score / 100) * 2}
                strokeLinecap="round"
              />
            );
          })}
        </Svg>

        <View
          style={[styles.center, { width: size, height: size }]}
          pointerEvents="none"
        >
          {photoUrl ? (
            <Avatar
              uri={photoUrl}
              name={name}
              size={photoSize}
              ringColor={colors.accent}
            />
          ) : (
            <AvatarView
              config={avatarConfig}
              size={avatarHeight}
              mood={mood}
              mode="full-body"
            />
          )}
        </View>

        {positions.map(({ pillar, cos, sin }) => {
          const left = center + cos * orbitRadius - bubbleSize / 2;
          const top = center + sin * orbitRadius - bubbleSize / 2;
          return (
            <View key={pillar} style={[styles.bubble, { left, top }]}>
              <PillarBubble
                pillar={pillar}
                score={scores[pillar] ?? 0}
                size={bubbleSize}
                done={progress?.[pillar]?.done}
                total={progress?.[pillar]?.total}
                expanded={expandedPillar === pillar}
                onPress={onPillarPress}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    outer: {
      width: '100%',
      alignItems: 'center',
    },
    center: {
      position: 'absolute',
      left: 0,
      top: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bubble: {
      position: 'absolute',
    },
  }),
);

export default PillarOrbit;
