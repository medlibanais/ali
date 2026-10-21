// Motion: small, shared animation helpers that keep the app feeling fluid.
// - FadeInUp: content eases up into place when a screen mounts.
// - PressableScale: a Pressable that gently sinks when pressed and springs
//   back, instead of flashing its opacity.
// The native driver is not available on web, so it is only used natively.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

export const useNative = Platform.OS !== 'web';

export interface FadeInUpProps {
  children: React.ReactNode;
  /** Delay in ms, handy for staggering a list. */
  delay?: number;
  /** Starting offset in px. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeInUp({
  children,
  delay = 0,
  distance = 14,
  style,
}: FadeInUpProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 480,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: useNative,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
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

  const to = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: value === 1 ? 8 : 0,
      useNativeDriver: useNative,
    }).start();

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
  useEffect(() => {
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
  }, [t, duration, delay]);
  return t.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] });
}
