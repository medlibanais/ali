// Motion: small, shared animation helpers that keep the app feeling fluid.
// - FadeInUp: content eases into place when it mounts (slow in, slow out,
//   under 300 ms). `fromX` lets it enter from the side of whatever was
//   tapped (origin awareness); `delay` staggers a list.
// - PressableScale: a Pressable that sinks when pressed (anticipation) and
//   springs back with a small overshoot (follow-through). The spring starts
//   from wherever the scale is, so it can be interrupted at any moment, and
//   sliding the finger off cancels the press.
// Both stay still when the phone asks for reduced motion.
// The native driver is not available on web, so it is only used natively.
// Timings live in lib/motion.ts.

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { DURATION, EASE_STANDARD } from '../lib/motion';

const easeStandard = Easing.bezier(...EASE_STANDARD);

export const useNative = Platform.OS !== 'web';

export interface FadeInUpProps {
  children: React.ReactNode;
  /** Delay in ms, handy for staggering a list. */
  delay?: number;
  /** Starting offset below, in px. */
  distance?: number;
  /** Starting offset sideways, in px: enter from the side that was tapped. */
  fromX?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeInUp({
  children,
  delay = 0,
  distance = 12,
  fromX = 0,
  style,
}: FadeInUpProps) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION.max - 20,
      delay,
      easing: easeStandard,
      useNativeDriver: useNative,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [fromX, 0],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Scale while pressed. */
  pressedScale?: number;
  children?: React.ReactNode;
}

export function PressableScale({
  style,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  const to = (value: number) => {
    if (reduceMotion) return;
    // Sink fast with no wobble; release with a little bounce.
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: value === 1 ? 8 : 0,
      useNativeDriver: useNative,
    }).start();
  };

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (!rest.disabled) to(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
    >
      {(state) => (
        <Animated.View
          style={[
            typeof style === 'function' ? style(state) : style,
            { transform: [{ scale }] },
          ]}
        >
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** A slow, endless up-and-down drift. Returns a translateY value. */
export function useFloat(amplitude = 4, duration = 2600, delay = 0) {
  const t = useRef(new Animated.Value(0)).current;
  // Less motion asked for: hold still (an endless loop draws every frame).
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) {
      t.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );
    const run = Animated.sequence([Animated.delay(delay), loop]);
    run.start();
    return () => run.stop();
  }, [t, duration, delay, reduceMotion]);
  // Same node across re-renders: a new interpolation on every render would
  // make Animated detach and re-attach the transform mid-loop.
  return useMemo(
    () => t.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] }),
    [t, amplitude],
  );
}
