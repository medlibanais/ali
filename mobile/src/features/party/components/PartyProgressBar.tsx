// Shared progress bar: members done / members in the party. Every
// member renders it from the same realtime-refreshed party state, so a
// tap on one phone moves the bar on all of them.

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Txt from '../../../components/Txt';
import { colors, radius, spacing, themed, withAlpha } from '../../../theme/tokens';
import { useTheme } from '../../../theme/useTheme';

export interface PartyProgressBarProps {
  done: number;
  total: number;
  color: string;
  complete: boolean;
}

export function PartyProgressBar({ done, total, color, complete }: PartyProgressBarProps) {
  useTheme();
  const ratio = total === 0 ? 0 : Math.min(1, done / total);
  const progress = useSharedValue(ratio);
  const glow = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(ratio, { damping: 16, stiffness: 120 });
    if (ratio > 0) {
      glow.value = withSequence(
        withTiming(1, { duration: 160 }),
        withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) }),
      );
    }
  }, [ratio, progress, glow]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
    opacity: 0.85 + glow.value * 0.15,
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Party progress: ${done} of ${total} done`}
      accessibilityValue={{ min: 0, max: total, now: done }}
    >
      <View style={styles.labels}>
        <Txt variant="label">{complete ? 'Complete' : 'Party progress'}</Txt>
        <Txt variant="bodySemi">
          {done}/{total}
        </Txt>
      </View>
      <View style={[styles.track, { backgroundColor: withAlpha(color, 0.18) }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    labels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: spacing.sm,
    },
    track: {
      height: 14,
      borderRadius: radius.pill,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.line,
    },
    fill: {
      height: '100%',
      borderRadius: radius.pill,
    },
  }),
);

export default PartyProgressBar;
