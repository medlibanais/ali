// PillarBubble: a pastel pillar orb with an SVG progress ring, the pillar
// icon in its soft core and the pillar name underneath (Figma "Pillar
// bubble" component). Used by PillarOrbit on the Today screen.
//
// Motion:
// - The tapped bubble lifts on a spring that overshoots a hair and settles
//   (follow-through), and the others step back (Von Restorff: the open
//   pillar is the one that looks different).
// - The ring fills smoothly when a quest is done (slow in, slow out): the
//   secondary action behind the tick on the quest row.
// - A soft highlight on the core gives the flat orb some volume (solid
//   drawing).

import React, { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Txt from './Txt';
import { PillarGlyph } from './icons';
import { playHaptic } from '../lib/haptics';
import { EASE_STANDARD, SPRING } from '../lib/motion';
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
  /** Another pillar is open: this one steps back so the open one stands out. */
  muted?: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_EASE = Easing.bezier(...EASE_STANDARD);

export function PillarBubble({
  pillar,
  score,
  size = 84,
  done,
  total,
  expanded,
  onPress,
  compact = false,
  muted = false,
}: PillarBubbleProps) {
  useTheme();
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { ink, base, tint } = pillarPastels(pillar);

  const strokeWidth = Math.max(5, Math.round(size * 0.08));
  const ringRadius = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * ringRadius;
  const core = size - strokeWidth * 2 - 10;
  const hasCount = total !== undefined && total > 0;

  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(clamped / 100);
  const lift = useSharedValue(expanded ? 1 : 0);
  const dim = useSharedValue(muted ? 1 : 0);
  useEffect(() => {
    fill.value = reduceMotion
      ? clamped / 100
      : withTiming(clamped / 100, { duration: 600, easing: RING_EASE });
  }, [clamped, fill, reduceMotion]);
  useEffect(() => {
    lift.value = reduceMotion ? (expanded ? 1 : 0) : withSpring(expanded ? 1 : 0, SPRING.settle);
  }, [expanded, lift, reduceMotion]);
  useEffect(() => {
    dim.value = reduceMotion ? (muted ? 1 : 0) : withTiming(muted ? 1 : 0, { duration: 200 });
  }, [muted, dim, reduceMotion]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fill.value),
  }));
  const liftStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.35 * dim.value,
    transform: [{ scale: 1 + 0.08 * lift.value - 0.04 * dim.value }],
  }));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={
        t('pillarBubble.a11y', { pillar: PILLAR_LABELS[pillar], score: clamped }) +
        (hasCount ? t('pillarBubble.a11yCount', { done: done ?? 0, total }) : '')
      }
      accessibilityState={{ selected: expanded }}
      onPress={() => {
        playHaptic('pillar');
        onPress(pillar);
      }}
      pressedScale={0.92}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={[styles.pressable, { width: size, height: size }]}
    >
      <Animated.View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          liftStyle,
        ]}
      >
        {/* Rotated so the ring starts at 12 o'clock. */}
        <Svg width={size} height={size} style={[StyleSheet.absoluteFill, styles.ringStart]}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={ringRadius}
            stroke={tint}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {clamped > 0 ? (
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={ringRadius}
              stroke={expanded ? ink : base}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              animatedProps={ringProps}
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
          {/* Soft light from the top left: the orb reads as a sphere. */}
          <Svg width={core} height={core} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id={`sheen-${pillar}`} cx="35%" cy="28%" r="60%">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0.38} />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={core * 0.42}
              cy={core * 0.36}
              rx={core * 0.4}
              ry={core * 0.32}
              fill={`url(#sheen-${pillar})`}
            />
          </Svg>
          <PillarGlyph
            pillar={pillar}
            size={Math.round(core * 0.42)}
            color={expanded ? colors.card : ink}
          />
        </View>
      </Animated.View>
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
    ringStart: {
      transform: [{ rotate: '-90deg' }],
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
      fontSize: 10,
      lineHeight: 14,
      // Mono caps run wide; tighter tracking keeps "Spirituality" whole.
      letterSpacing: 0.2,
    },
  }),
);

// Memoized: a bubble only re-renders when its own score, counts or
// selection change (pass a stable onPress).
export default memo(PillarBubble);
