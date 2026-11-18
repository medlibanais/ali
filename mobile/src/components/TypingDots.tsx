import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/tokens';

interface DotProps {
  delay: number;
  color: string;
  size: number;
  still: boolean;
}

function Dot({ delay, color, size, still }: DotProps) {
  const lift = useSharedValue(0);

  useEffect(() => {
    if (still) return undefined;
    // Runs on the UI thread, so a busy JS thread (words streaming in) does
    // not make the dots stutter.
    lift.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 260 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(lift);
  }, [delay, lift, still]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * size * 0.8 }],
    opacity: 0.45 + lift.value * 0.55,
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        still && styles.still,
        style,
      ]}
    />
  );
}

export interface TypingDotsProps {
  color?: string;
  size?: number;
}

/** Three bouncing dots: the coach is thinking. */
export default function TypingDots({ color = colors.inkSoft, size = 8 }: TypingDotsProps) {
  const reduceMotion = useReducedMotion();
  return (
    <View style={[styles.row, { height: size * 2.4 }]}>
      {[0, 160, 320].map((delay) => (
        <Dot key={delay} delay={delay} color={color} size={size} still={reduceMotion} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  dot: {
    marginHorizontal: 3,
  },
  still: {
    opacity: 0.7,
  },
});
