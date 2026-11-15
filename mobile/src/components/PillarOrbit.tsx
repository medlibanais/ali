// PillarOrbit: the heart of the Today screen. The user's avatar sits in a
// white-rimmed circle in the middle and the five pillars float around it
// like guardians on a dashed ring, each orb showing its progress today.
// Angles are degrees, 0° = right, clockwise: spirituality on top, then
// health, family, work and fun around the ellipse (Figma "Today" frame).
//
// Rendering: the orbit itself only re-renders when the avatar, mood, level
// or the tapped pillar changes. Each bubble reads its own score and quest
// counts from the store (LivePillarBubble), so completing a quest
// re-renders that one bubble. The avatar breathes faster when the life
// score is low, through a SharedValue (useLifeScoreValue), so a new score
// does not re-render it either. The float animations run on Animated values
// that survive re-renders and use the native driver on iOS/Android.

import React, { memo } from 'react';
import { Animated, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import AvatarView from '../avatar/AvatarView';
import type { AvatarConfig, Mood } from '../avatar/types';
import { useAppSelector } from '../store/hooks';
import { useLifeScoreValue } from '../store/useLifeScoreValue';
import {
  selectPillarDone,
  selectPillarScore,
  selectPillarTotal,
} from '../store/selectors/today';
import { useFloat } from './Motion';
import PillarBubble, { type PillarId } from './PillarBubble';
import Txt from './Txt';
import { StarGlyph } from './icons';
import { colors, radius, softShadow, themed, withAlpha } from '../theme/tokens';
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
  /** The avatar's expression (selectDayMood). */
  mood: Mood;
  expandedPillar: PillarId | null;
  /** Keep this stable (useCallback) so the bubbles can skip re-renders. */
  onPillarPress: (pillar: PillarId) => void;
}

/** A pillar bubble wired to its own slice of the store. */
const LivePillarBubble = memo(function LivePillarBubble({
  pillar,
  size,
  expanded,
  onPress,
}: {
  pillar: PillarId;
  size: number;
  expanded: boolean;
  onPress: (pillar: PillarId) => void;
}) {
  const score = useAppSelector((state) => selectPillarScore(state, pillar));
  const done = useAppSelector((state) => selectPillarDone(state, pillar));
  const total = useAppSelector((state) => selectPillarTotal(state, pillar));
  return (
    <PillarBubble
      pillar={pillar}
      score={score}
      size={size}
      done={done}
      total={total}
      expanded={expanded}
      onPress={onPress}
    />
  );
});

/** The avatar (or photo) and level badge inside the floating rim. */
const OrbitAvatar = memo(function OrbitAvatar({
  avatarConfig,
  photoUrl,
  name,
  level,
  mood,
  size,
}: {
  avatarConfig: AvatarConfig;
  photoUrl?: string | null;
  name?: string | null;
  level?: number;
  mood: Mood;
  size: number;
}) {
  // The breathing pace follows the life score on the UI thread: this
  // SharedValue never changes identity, so the avatar never re-renders
  // for a score change.
  const lifeScore = useLifeScoreValue();
  return (
    <>
      <View style={[styles.avatarClip, { borderRadius: size / 2 }]}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: size, height: size }}
            resizeMode="cover"
            accessibilityLabel={name ? `Avatar of ${name}` : 'Your avatar'}
          />
        ) : (
          <AvatarView config={avatarConfig} size={size} mood={mood} score={lifeScore} />
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
    </>
  );
});

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

function PillarOrbitBase({
  avatarConfig,
  photoUrl,
  name,
  level,
  mood,
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
          <OrbitAvatar
            avatarConfig={avatarConfig}
            photoUrl={photoUrl}
            name={name}
            level={level}
            mood={mood}
            size={avatar - RIM * 2}
          />
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
              <LivePillarBubble
                pillar={pillar}
                size={orb}
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

export const PillarOrbit = memo(PillarOrbitBase);

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
