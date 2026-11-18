// Hero: the views behind lib/hero.ts.
//   - useHeroSource(key) (HeroSource.ts): ref for the view a hero flies FROM.
//   - <HeroTarget heroKey>: wraps the view a hero flies TO. On focus, if a
//     hero was launched for its key, it starts at the source's position
//     and size and springs into place on the UI thread (Reanimated).

import React, { useCallback, useRef } from 'react';
import { View, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { heroOffset, heroPending, measureView, takeHero } from '../lib/hero';

export { useHeroSource } from './HeroSource';

/** Soft, slightly bouncy: lands like it has weight. */
const SPRING = { damping: 17, stiffness: 150, mass: 0.9 };

/** Wait until the view has a size (first visit to a lazy tab). */
async function measureWhenReady(view: () => View | null) {
  for (let i = 0; i < 8; i++) {
    const rect = await measureView(view());
    if (rect) return rect;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  return null;
}

export function HeroTarget({
  heroKey,
  style,
  children,
}: {
  heroKey: string;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  const ref = useRef<View>(null);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  // Mounting mid-flight (first visit): start hidden so it never flashes
  // in its final spot before jumping to the start of the flight.
  const opacity = useSharedValue(heroPending(heroKey) ? 0 : 1);

  useFocusEffect(
    useCallback(() => {
      const origin = takeHero(heroKey);
      if (!origin) return undefined;
      let cancelled = false;
      // Hidden until we know where to start, so it never flashes in place.
      opacity.value = 0;
      (async () => {
        const [from, to] = await Promise.all([
          origin,
          measureWhenReady(() => ref.current),
        ]);
        if (cancelled) return;
        if (!from || !to) {
          opacity.value = withTiming(1, { duration: 160 });
          return;
        }
        const { dx, dy, scale: s } = heroOffset(from, to);
        tx.value = dx;
        ty.value = dy;
        scale.value = s;
        opacity.value = 1;
        tx.value = withSpring(0, SPRING);
        ty.value = withSpring(0, SPRING);
        scale.value = withSpring(1, SPRING);
      })();
      return () => {
        cancelled = true;
        tx.value = 0;
        ty.value = 0;
        scale.value = 1;
        opacity.value = 1;
      };
    }, [heroKey, opacity, scale, tx, ty]),
  );

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View ref={ref} collapsable={false} style={[style, animated, { zIndex: 10 }]}>
      {children}
    </Animated.View>
  );
}
