import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface SkeletonBlockProps {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height,
  borderRadius = radius.sm,
  style,
}: SkeletonBlockProps) {
  useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius, opacity }, style]}
    />
  );
}

const styles = themed(() =>
  StyleSheet.create({
    block: {
      backgroundColor: colors.paperAlt,
    },
  }),
);

export interface SkeletonGroupProps {
  children: React.ReactNode;
}

export function SkeletonGroup({ children }: SkeletonGroupProps) {
  return <View style={groupStyles.container}>{children}</View>;
}

const groupStyles = StyleSheet.create({
  container: {
    width: '100%',
  },
});

export default Skeleton;
