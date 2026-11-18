// LoadingDots: three dots that rise and glow in turn. Replaces the system
// spinner inside buttons and small busy spots, where a skeleton block
// would not fit. Runs on the UI thread (Reanimated).

import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const CYCLE_MS = 900;

export interface LoadingDotsProps {
  color: string;
  size?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

function Dot({
  clock,
  index,
  color,
  size,
}: {
  clock: SharedValue<number>;
  index: number;
  color: string;
  size: number;
}) {
  const animated = useAnimatedStyle(() => {
    // Each dot peaks a third of a cycle after the one before it.
    const phase = (clock.value + 1 - index / 3) % 1;
    const wave = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    return {
      opacity: interpolate(wave, [0, 1], [0.35, 1]),
      transform: [
        { translateY: interpolate(wave, [0, 1], [0, -size * 0.6]) },
        { scale: interpolate(wave, [0, 1], [0.85, 1.1]) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        index > 0 && { marginLeft: size * 0.8 },
        animated,
      ]}
    />
  );
}

export function LoadingDots({
  color,
  size = 7,
  style,
  accessibilityLabel = 'Loading',
}: LoadingDotsProps) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [clock]);

  return (
    <View
      style={[styles.row, { height: size * 2.4 }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
    >
      {[0, 1, 2].map((i) => (
        <Dot key={i} clock={clock} index={i} color={color} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

export default LoadingDots;
