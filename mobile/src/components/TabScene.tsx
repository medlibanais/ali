// TabScene: the custom transition for switching bottom tabs. Bottom tabs
// swap screens instantly by default; here the incoming screen rises a few
// points and fades up from 70% opacity on a spring, on the UI thread.
//
// It listens to the navigator's focus event instead of re-rendering, so
// the wrapped screen is never re-rendered by the transition itself.
//
// Frequency of use: tabs switch all day, so the rise is small and the
// spring is stiff enough to settle in well under 300 ms. With reduced
// motion the screen just appears.

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const RISE = 8;
const SPRING = { damping: 26, stiffness: 380, mass: 0.7 };

function TabScene({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();
  const progress = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (reduceMotion) return;
      progress.value = 0;
      progress.value = withSpring(1, SPRING);
    });
    const unsubscribeBlur = navigation.addListener('blur', () => {
      // Settle instantly so a half-finished rise never shows on return.
      progress.value = withTiming(1, { duration: 0 });
    });
    return () => {
      unsubscribe();
      unsubscribeBlur();
    };
  }, [navigation, progress, reduceMotion]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.8 + 0.2 * progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE }],
  }));

  return <Animated.View style={[styles.fill, animated]}>{children}</Animated.View>;
}

/** Wrap a tab screen component with the TabScene transition. */
export function withTabTransition<P extends object>(
  Screen: React.ComponentType<P>,
): React.ComponentType<P> {
  function Transitioned(props: P) {
    return (
      <TabScene>
        <Screen {...props} />
      </TabScene>
    );
  }
  Transitioned.displayName = `withTabTransition(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return Transitioned;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
