// Skeleton: a placeholder block with a light band sweeping across it,
// shown while data loads. Every screen uses these instead of spinners.
//
// The sweep runs on the UI thread (Reanimated), so it keeps moving even
// while JS is busy parsing the data it is waiting for. All skeletons share
// one clock (useShimmerClock), so blocks stacked on a screen shine in step
// like one surface instead of flickering separately.

import React, { useEffect, useId, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, themed, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** One sweep, edge to edge, in ms. */
const SWEEP_MS = 1400;
/** The light band is this share of the block's width. */
const BAND = 0.6;

export interface SkeletonBlockProps {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/** Shared 0..1 clock for every skeleton on screen. */
function useShimmerClock(): SharedValue<number> {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);
  return progress;
}

const ShimmerContext = React.createContext<SharedValue<number> | null>(null);

/**
 * Wrap a screen's skeleton layout in this so every block shares one sweep.
 * Blocks outside a group still shimmer, each on its own clock.
 */
export function SkeletonGroup({
  children,
  style,
  accessibilityLabel = 'Loading',
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const clock = useShimmerClock();
  return (
    <ShimmerContext.Provider value={clock}>
      <View
        style={style}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: true }}
      >
        {children}
      </View>
    </ShimmerContext.Provider>
  );
}

function ShimmerBand({ clock, width }: { clock: SharedValue<number>; width: number }) {
  const band = Math.max(40, width * BAND);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: -band + clock.value * (width + band) }],
  }));
  const shine = withAlpha(colors.ink, 0.12);
  // useId gives ':r1:'; colons break url(#id) on web.
  const gradientId = `skeleton-shine-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.band, { width: band }, animated]}
    >
      <Svg width={band} height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={shine} stopOpacity={0} />
            <Stop offset="0.5" stopColor={shine} stopOpacity={1} />
            <Stop offset="1" stopColor={shine} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={band} height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

function OwnClockBand({ width }: { width: number }) {
  const clock = useShimmerClock();
  return <ShimmerBand clock={clock} width={width} />;
}

export function Skeleton({
  width = '100%',
  height,
  borderRadius = radius.sm,
  style,
}: SkeletonBlockProps) {
  useTheme();
  const shared = React.useContext(ShimmerContext);
  const [measured, setMeasured] = useState(typeof width === 'number' ? width : 0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== measured) setMeasured(w);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.block, { width, height, borderRadius }, style]}
    >
      {measured > 0 ? (
        shared ? (
          <ShimmerBand clock={shared} width={measured} />
        ) : (
          <OwnClockBand width={measured} />
        )
      ) : null}
    </View>
  );
}

/** A round placeholder (avatars, pillar orbs). */
export function SkeletonCircle({ size, style }: { size: number; style?: ViewStyle }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
}

/** A few lines of text; the last one is shorter, like a real paragraph. */
export function SkeletonText({
  lines = 3,
  lineHeight = 12,
  gap = 8,
  lastLineWidth = '60%',
  style,
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: `${number}%`;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          style={i < lines - 1 ? { marginBottom: gap } : undefined}
        />
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    block: {
      backgroundColor: colors.paperAlt,
      overflow: 'hidden',
    },
    band: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
    },
  }),
);

export default Skeleton;
