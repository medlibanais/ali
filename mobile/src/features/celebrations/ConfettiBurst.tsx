// Confetti explosion for the level-up: one shared clock on the UI thread
// drives every piece along a ballistic path (launch velocity + gravity +
// air drag), so the whole burst is a single animation, not 40.

import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { getColors, PILLARS } from '../../theme/tokens';

const GRAVITY = 900; // px/s²
const DRAG = 1.6; // 1/s, slows the launch speed over time

interface PieceSpec {
  vx: number;
  vy: number;
  spin: number;
  w: number;
  h: number;
  color: string;
}

const Piece = memo(function Piece({
  clock,
  spec,
  durationS,
}: {
  clock: SharedValue<number>;
  spec: PieceSpec;
  durationS: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = clock.value * durationS;
    // Velocity decays as e^(-k t): distance = v (1 - e^(-k t)) / k.
    const travel = (1 - Math.exp(-DRAG * t)) / DRAG;
    const x = spec.vx * travel;
    const y = spec.vy * travel + 0.5 * GRAVITY * t * t * 0.55;
    const fade = clock.value > 0.7 ? 1 - (clock.value - 0.7) / 0.3 : 1;
    return {
      // Hidden until its (possibly delayed) launch.
      opacity: clock.value === 0 ? 0 : fade,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${spec.spin * t}deg` },
        // Flutter: the piece turns edge-on and back as it falls.
        { scaleY: Math.cos(t * 9 + spec.spin) },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        { width: spec.w, height: spec.h, marginLeft: -spec.w / 2, marginTop: -spec.h / 2, backgroundColor: spec.color },
        style,
      ]}
    />
  );
});

export interface ConfettiBurstProps {
  /** Number of pieces (each is one small view). */
  count?: number;
  /** 'popper' fans upward; 'radial' explodes in every direction. */
  shape?: 'popper' | 'radial';
  /** Launch speed in px/s (pieces vary from 0.55x to 1.1x of it). */
  speed?: number;
  durationMs?: number;
  /** Where the burst starts, in the parent's coordinates. Default: center. */
  at?: { x: number; y: number };
  /** Main color; the gold and pillar colors are mixed in. */
  color?: string;
  /** Wait before the burst (ms), e.g. until a ring has filled. */
  delayMs?: number;
}

/** Fires once on mount. Touches pass through. */
export const ConfettiBurst = memo(function ConfettiBurst({
  count = 40,
  shape = 'popper',
  speed = 760,
  durationMs = 2200,
  at,
  color,
  delayMs = 0,
}: ConfettiBurstProps) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = withDelay(
      delayMs,
      withTiming(1, { duration: durationMs, easing: Easing.linear }),
    );
  }, [clock, durationMs, delayMs]);

  const specs = useMemo<PieceSpec[]>(() => {
    const c = getColors();
    const palette = [color ?? c.gold, c.gold, c.accent, ...PILLARS.map((p) => c.pillar[p])];
    return Array.from({ length: count }, (_, i) => {
      const angle =
        shape === 'radial'
          ? (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
          : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const v = speed * (0.55 + Math.random() * 0.55);
      return {
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        spin: (Math.random() - 0.5) * 900,
        w: 6 + Math.random() * 4,
        h: 10 + Math.random() * 6,
        color: palette[i % palette.length],
      };
    });
  }, [count, shape, speed, color]);

  const durationS = durationMs / 1000;
  const origin = at ? { left: at.x, top: at.y } : styles.center;
  return (
    <View style={[styles.origin, origin]} pointerEvents="none">
      {specs.map((spec, i) => (
        <Piece key={i} clock={clock} spec={spec} durationS={durationS} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  origin: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  center: {
    left: '50%',
    top: '50%',
  },
  piece: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 2,
  },
});

export default ConfettiBurst;
