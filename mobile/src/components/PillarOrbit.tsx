// PillarOrbit: the heart of the Today screen. The user's avatar sits in a
// white-rimmed circle in the middle and the five pillars float around it
// like guardians on a dashed ring, each orb showing its progress today.
// Angles are degrees, 0° = right, clockwise: spirituality on top, then
// health, family, work and fun around the ellipse (Figma "Today" frame).

import React from 'react';
import { Animated, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import AvatarView from '../avatar/AvatarView';
import { moodForScore, type AvatarConfig } from '../avatar/types';
import { useFloat } from './Motion';
import PillarBubble, { type PillarId } from './PillarBubble';
import Txt from './Txt';
import { StarGlyph } from './icons';
import { colors, PILLARS, radius, softShadow, themed, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const ORBIT_ANGLES: Record<PillarId, number> = {
  spirituality: -90,
  health: -18,
  family: 54,
  work: 126,
  fun: 198,
};

const ORBIT_ORDER: PillarId[] = ['spirituality', 'health', 'family', 'work', 'fun'];

// Sized from the 390pt Figma frame and scaled to the screen.
const DESIGN_WIDTH = 390;
const MAX_WIDTH = 460;
const RX = 148;
const RY = 165;
const ORB = 84;
const AVATAR = 172;
const RIM = 6;
// Room under the lowest orbs for their labels.
const LABEL_ROOM = 26;

export interface PillarOrbitProps {
  avatarConfig: AvatarConfig;
  /** Real or AI photo. When set it replaces the drawn avatar in the center. */
  photoUrl?: string | null;
  name?: string | null;
  level?: number;
  scores: Record<PillarId, number>;
  /** Today's quest counts per pillar, read out by screen readers. */
  progress?: Partial<Record<PillarId, { done: number; total: number }>>;
  expandedPillar: PillarId | null;
  onPillarPress: (pillar: PillarId) => void;
}

/** One guardian orb, drifting on its own rhythm. */
function FloatingOrb({
  index,
  left,
  top,
  children,
}: {
  index: number;
  left: number;
  top: number;
  children: React.ReactNode;
}) {
  const lift = useFloat(5, 3000 + index * 260, index * 380);
  return (
    <Animated.View
      style={[styles.orb, { left, top, transform: [{ translateY: lift }] }]}
    >
      {children}
    </Animated.View>
  );
}

export function PillarOrbit({
  avatarConfig,
  photoUrl,
  name,
  level,
  scores,
  progress,
  expandedPillar,
  onPillarPress,
}: PillarOrbitProps) {
  useTheme();
  const { width } = useWindowDimensions();
  const k = Math.min(MAX_WIDTH, width) / DESIGN_WIDTH;
  const rx = RX * k;
  const ry = RY * k;
  const orb = Math.round(ORB * k);
  const avatar = Math.round(AVATAR * k);
  const boxW = Math.round(2 * rx + orb);
  const boxH = Math.round(2 * ry + orb);
  const cx = boxW / 2;
  const cy = boxH / 2;
  const avatarLift = useFloat(3, 3600);

  // The avatar's expression reflects the day (average of the five scores).
  const average =
    PILLARS.reduce((sum, pillar) => sum + (scores[pillar] ?? 0), 0) /
    PILLARS.length;
  const mood = moodForScore(average);

  return (
    <View style={styles.outer}>
      <View
        style={{ width: boxW, height: boxH + LABEL_ROOM }}
        accessibilityLabel="Your avatar with your five pillars guarding it"
      >
        <Svg width={boxW} height={boxH} style={StyleSheet.absoluteFill}>
          {/* dashed guard ring */}
          <Ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            stroke={withAlpha(colors.ink, 0.14)}
            strokeWidth={1.5}
            strokeDasharray="4 7"
            fill="none"
          />
        </Svg>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.avatarRing,
            {
              width: avatar,
              height: avatar,
              borderRadius: avatar / 2,
              left: cx - avatar / 2,
              top: cy - avatar / 2,
              padding: RIM,
              transform: [{ translateY: avatarLift }],
            },
          ]}
        >
          <View style={[styles.avatarClip, { borderRadius: (avatar - RIM * 2) / 2 }]}>
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                style={{ width: avatar - RIM * 2, height: avatar - RIM * 2 }}
                resizeMode="cover"
                accessibilityLabel={name ? `Avatar of ${name}` : 'Your avatar'}
              />
            ) : (
              <AvatarView config={avatarConfig} size={avatar - RIM * 2} mood={mood} />
            )}
          </View>
          {level !== undefined ? (
            <View style={styles.levelBadge}>
              <StarGlyph size={13} />
              <Txt variant="label" color={colors.onAccent} style={styles.levelText}>
                {`Lv ${level}`}
              </Txt>
            </View>
          ) : null}
        </Animated.View>

        {ORBIT_ORDER.map((pillar, index) => {
          const angle = (ORBIT_ANGLES[pillar] * Math.PI) / 180;
          return (
            <FloatingOrb
              key={pillar}
              index={index}
              left={cx + Math.cos(angle) * rx - orb / 2}
              top={cy + Math.sin(angle) * ry - orb / 2}
            >
              <PillarBubble
                pillar={pillar}
                score={scores[pillar] ?? 0}
                size={orb}
                done={progress?.[pillar]?.done}
                total={progress?.[pillar]?.total}
                expanded={expandedPillar === pillar}
                onPress={onPillarPress}
              />
            </FloatingOrb>
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
    avatarRing: {
      position: 'absolute',
      backgroundColor: colors.card,
      ...softShadow(3),
    },
    avatarClip: {
      flex: 1,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    levelBadge: {
      position: 'absolute',
      right: -2,
      bottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      borderWidth: 2,
      borderColor: colors.card,
    },
    levelText: {
      marginLeft: 4,
    },
    orb: {
      position: 'absolute',
    },
  }),
);

export default PillarOrbit;
