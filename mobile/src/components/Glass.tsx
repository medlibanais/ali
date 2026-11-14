// Glass: a frosted panel. The ambient glow painted by Screen (and any
// content scrolling underneath) shows through, blurred and dimmed, so
// panels feel layered instead of pasted onto a flat black canvas.
// expo-blur uses backdrop-filter on web and a native blur on iOS; on
// Android it falls back to the translucent tint alone, which still reads
// as glass over the ambient glow.

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, isDarkPalette, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface GlassProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Blur strength, 0..100. */
  intensity?: number;
  /** Opacity of the surface tint over the blur, 0..1. */
  tint?: number;
}

export function Glass({ children, style, intensity = 40, tint = 0.55 }: GlassProps) {
  useTheme();
  const dark = isDarkPalette();
  return (
    <View style={[styles.wrap, style]}>
      <BlurView
        intensity={intensity}
        tint={dark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.card, tint) }]}
      />
      {/* A faint top sheen sells the glass edge. */}
      <View
        pointerEvents="none"
        style={[
          styles.sheen,
          { backgroundColor: withAlpha(dark ? colors.ink : colors.card, dark ? 0.07 : 0.5) },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});

export default Glass;
