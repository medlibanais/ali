// In-party cheers: each emoji pops in, floats up and fades out over the
// screen of every member. Reanimated runs it on the UI thread.

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { colors, themed, withAlpha } from '../../../theme/tokens';
import { useTheme } from '../../../theme/useTheme';
import type { PartyCheer } from '../logic';

const FLOAT_MS = 1600;

function Bubble({
  cheer,
  label,
  onDone,
}: {
  cheer: PartyCheer;
  label: string;
  onDone: (id: string) => void;
}) {
  // Spread bubbles across the width so bursts don't stack.
  const left = useMemo(() => {
    let h = 0;
    for (let i = 0; i < cheer.id.length; i += 1) h = (h * 31 + cheer.id.charCodeAt(i)) % 997;
    return 8 + (h % 72);
  }, [cheer.id]);
  const scale = useSharedValue(0.2);
  const rise = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.35, { damping: 6, stiffness: 220 }),
      withTiming(1, { duration: 180 }),
    );
    rise.value = withTiming(-220, { duration: FLOAT_MS, easing: Easing.out(Easing.cubic) });
    fade.value = withDelay(
      FLOAT_MS - 500,
      withTiming(0, { duration: 500 }, (finished) => {
        if (finished) runOnJS(onDone)(cheer.id);
      }),
    );
  }, [cheer.id, fade, onDone, rise, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: rise.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.bubble, { left: `${left}%` }, style]}>
      <Text style={styles.emoji}>{cheer.emoji}</Text>
      <Text style={styles.from} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

export interface CheerBurstProps {
  cheers: PartyCheer[];
  nameOf: (userId: string) => string;
  onDone: (id: string) => void;
}

/** Full-screen overlay; never takes touches. */
export function CheerBurst({ cheers, nameOf, onDone }: CheerBurstProps) {
  useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {cheers.map((c) => (
        <Bubble key={c.id} cheer={c} label={nameOf(c.from)} onDone={onDone} />
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  bubble: {
    position: 'absolute',
    bottom: 120,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 44,
  },
  from: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    backgroundColor: withAlpha(colors.card, 0.85),
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    maxWidth: 120,
  },
  }),
);

export default CheerBurst;
