// PillarOrbit: full-body avatar centered, five PillarBubbles on an orbit.
// Angles are degrees, 0° = right, clockwise: health top, then work,
// family, fun, spirituality around the circle.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import AvatarView from '../avatar/AvatarView';
import { moodForScore, type AvatarConfig } from '../avatar/types';
import PillarBubble, { type PillarId } from './PillarBubble';
import { PILLARS } from '../theme/tokens';
import { themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const ORBIT_ANGLES: Record<PillarId, number> = {
  health: -90,
  work: -18,
  family: 54,
  fun: 126,
  spirituality: 198,
};

const ORBIT_ORDER: PillarId[] = ['health', 'work', 'family', 'fun', 'spirituality'];

export interface PillarOrbitProps {
  avatarConfig: AvatarConfig;
  scores: Record<PillarId, number>;
  expandedPillar: PillarId | null;
  onPillarPress: (pillar: PillarId) => void;
  orbitRadius?: number;
  avatarSize?: number;
  bubbleSize?: number;
}

export function PillarOrbit({
  avatarConfig,
  scores,
  expandedPillar,
  onPillarPress,
  orbitRadius = 140,
  avatarSize = 220,
  bubbleSize = 76,
}: PillarOrbitProps) {
  useTheme();
  const containerSize = (orbitRadius + bubbleSize / 2) * 2;
  const center = containerSize / 2;
  // The avatar's expression reflects the day (average of the five scores).
  const average =
    PILLARS.reduce((sum, pillar) => sum + (scores[pillar] ?? 0), 0) /
    PILLARS.length;
  const mood = moodForScore(average);

  return (
    <View style={styles.outer}>
      <View
        style={{ width: containerSize, height: containerSize }}
        accessibilityLabel="Pillar orbit"
      >
        <View
          style={[
            styles.avatar,
            {
              left: center - avatarSize / 2,
              top: center - avatarSize / 2,
            },
          ]}
        >
          <AvatarView
            config={avatarConfig}
            size={avatarSize}
            mood={mood}
            mode="full-body"
          />
        </View>
        {ORBIT_ORDER.map((pillar) => {
          const angle = (ORBIT_ANGLES[pillar] * Math.PI) / 180;
          const left = center + Math.cos(angle) * orbitRadius - bubbleSize / 2;
          const top = center + Math.sin(angle) * orbitRadius - bubbleSize / 2;
          return (
            <View key={pillar} style={[styles.bubble, { left, top }]}>
              <PillarBubble
                pillar={pillar}
                score={scores[pillar] ?? 0}
                size={bubbleSize}
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
    avatar: {
      position: 'absolute',
    },
    bubble: {
      position: 'absolute',
    },
  }),
);

export default PillarOrbit;
