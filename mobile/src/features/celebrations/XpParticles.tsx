// XP particles: small SVG sparks burst out of the tapped checkbox with a
// random velocity, then a damped spring (real mass/stiffness/damping, on the
// UI thread) pulls each one into the XP bar. Only transforms and opacity
// animate, and each spark's SVG is static, so a burst costs ~14 views.

import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Txt from '../../components/Txt';
import type { Point, XpBurst } from '../../store/slices/celebrationsSlice';
import { colors, fonts } from '../../theme/tokens';
import { findXpBarTarget, notifyXpArrived } from './anchors';
import ConfettiBurst from './ConfettiBurst';
import { particleCount } from './logic';

const SIZE = 16;
const HALF = SIZE / 2;
const SPARK =
  'M8 0C8.8 5 11 7.2 16 8C11 8.8 8.8 11 8 16C7.2 11 5 8.8 0 8C5 7.2 7.2 5 8 0Z';
const SPRING = { mass: 1, stiffness: 110, damping: 17 } as const;
const STAGGER_MS = 22;
const FADE_AT_MS = 560;
const ARRIVE_MS = 520;

interface SparkSpec {
  vx: number;
  vy: number;
  delay: number;
  scale: number;
  color: string;
}

const Spark = memo(function Spark({
  from,
  to,
  spec,
  onDone,
}: {
  from: Point;
  to: Point;
  spec: SparkSpec;
  onDone?: () => void;
}) {
  const x = useSharedValue(from.x - HALF);
  const y = useSharedValue(from.y - HALF);
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(1);
  const spin = useSharedValue(0);

  useEffect(() => {
    const d = spec.delay;
    x.value = withDelay(d, withSpring(to.x - HALF, { ...SPRING, velocity: spec.vx }));
    y.value = withDelay(d, withSpring(to.y - HALF, { ...SPRING, velocity: spec.vy }));
    spin.value = withDelay(d, withTiming(spec.vx > 0 ? 220 : -220, { duration: 900 }));
    scale.value = withDelay(
      d,
      withSequence(
        withTiming(spec.scale, { duration: 140, easing: Easing.out(Easing.back(2)) }),
        withDelay(FADE_AT_MS - 140, withTiming(0.35, { duration: 260 })),
      ),
    );
    opacity.value = withDelay(
      d + FADE_AT_MS,
      withTiming(0, { duration: 260 }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      }),
    );
    // Shared values are stable; the burst runs exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${spin.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={[styles.spark, style]} pointerEvents="none">
      <Svg width={SIZE} height={SIZE} viewBox="0 0 16 16">
        <Path d={SPARK} fill={spec.color} />
      </Svg>
    </Animated.View>
  );
});

const XpLabel = memo(function XpLabel({ at, xp }: { at: Point; xp: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.6 ? 1 : 1 - (t.value - 0.6) / 0.4,
    transform: [{ translateY: -46 * t.value }, { scale: 0.85 + 0.25 * Math.min(1, t.value * 4) }],
  }));
  return (
    <Animated.View
      style={[styles.label, { left: at.x - 60, top: at.y - 34 }, style]}
      pointerEvents="none"
    >
      <Txt variant="bodySemi" color={colors.gold} align="center" style={styles.labelText}>
        {`+${xp} XP`}
      </Txt>
    </Animated.View>
  );
});

export const XpParticles = memo(function XpParticles({
  burst,
  onDone,
}: {
  burst: XpBurst;
  onDone: (id: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [target, setTarget] = useState<Point | null>(null);
  const from = useMemo<Point>(
    () => burst.origin ?? { x: width / 2, y: height * 0.55 },
    // The origin is fixed for the life of the burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst.id],
  );

  useEffect(() => {
    let alive = true;
    findXpBarTarget((bar) => {
      if (!alive) return;
      const top = insets.top + 20;
      // Bar scrolled out of view (or not on this screen): aim at the top edge.
      const aim = bar && bar.y >= top - 8 && bar.y <= height ? bar : { x: bar?.x ?? width / 2, y: top };
      setTarget(aim);
    });
    const arrive = setTimeout(notifyXpArrived, ARRIVE_MS);
    return () => {
      alive = false;
      clearTimeout(arrive);
    };
    // Measured once, when the burst starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst.id]);

  const specs = useMemo<SparkSpec[]>(() => {
    const n = particleCount(burst.xp);
    return Array.from({ length: n }, (_, i) => {
      // Fan out mostly sideways and down, so the spring's pull up to the
      // bar draws a visible arc instead of a straight line.
      const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.6;
      const speed = 520 + Math.random() * 620;
      return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 260,
        delay: i * STAGGER_MS,
        scale: 0.8 + Math.random() * 0.6,
        color: i % 3 === 0 ? burst.color : colors.gold,
      };
    });
  }, [burst.id, burst.xp, burst.color]);

  const finish = useMemo(() => () => onDone(burst.id), [onDone, burst.id]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* A small confetti pop at the checkbox, under the sparks. */}
      <ConfettiBurst count={12} shape="radial" speed={300} durationMs={900} at={from} color={burst.color} />
      <XpLabel at={from} xp={burst.xp} />
      {target
        ? specs.map((spec, i) => (
            <Spark
              key={i}
              from={from}
              to={target}
              spec={spec}
              onDone={i === specs.length - 1 ? finish : undefined}
            />
          ))
        : null}
    </View>
  );
});

const styles = StyleSheet.create({
  spark: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  },
  label: {
    position: 'absolute',
    width: 120,
  },
  labelText: {
    fontFamily: fonts.heavy,
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 4,
  },
});

export default XpParticles;
