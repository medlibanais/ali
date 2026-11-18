// The filled checkbox of a done quest. When it appears because the user
// just completed the quest, the circle pops and the tick draws itself as
// an SVG stroke (UI thread). Already-done quests render still.

import React, { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const TICK = 'M3 8.5 L6.5 12 L13 4.5';
const TICK_LEN = 15;

export interface DrawnCheckProps {
  /** Draw in on mount (read once). */
  animate: boolean;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function DrawnCheck({ animate, size = 14, color = colors.onAccent, style }: DrawnCheckProps) {
  const reduceMotion = useReducedMotion();
  const play = useRef(animate && !reduceMotion).current;
  const draw = useSharedValue(play ? 0 : 1);
  const pop = useSharedValue(play ? 0.6 : 1);

  useEffect(() => {
    if (!play) return;
    pop.value = withSequence(
      withTiming(1.18, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(1, { mass: 1, stiffness: 260, damping: 14 }),
    );
    draw.value = withDelay(90, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
  }, [play, draw, pop]);

  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const tickProps = useAnimatedProps(() => ({
    strokeDashoffset: TICK_LEN * (1 - draw.value),
  }));

  return (
    <Animated.View style={[style, boxStyle]}>
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <AnimatedPath
          d={TICK}
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={`${TICK_LEN} ${TICK_LEN}`}
          animatedProps={tickProps}
        />
      </Svg>
    </Animated.View>
  );
}

export default DrawnCheck;
