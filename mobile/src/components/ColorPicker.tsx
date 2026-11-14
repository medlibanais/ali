// Custom color picker: hue, richness and lightness sliders with a live
// swatch. Plain views, so it works on phones and the web alike.

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Slider from './Slider';
import Txt from './Txt';

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export interface ColorPickerProps {
  /** What is being colored, for labels: "Skin tone", "Hair color". */
  title: string;
  value: string;
  onChange: (hex: string) => void;
  onCommit: (hex: string) => void;
}

export function ColorPicker({ title, value, onChange, onCommit }: ColorPickerProps) {
  useTheme();
  // Keep the sliders' own numbers: a grey has no hue to read back.
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(value));
  const update = (patch: Partial<Hsl>, commit: boolean) => {
    const next = { ...hsl, ...patch };
    setHsl(next);
    const hex = hslToHex(next);
    if (commit) onCommit(hex);
    else onChange(hex);
  };
  const hex = hslToHex(hsl);
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <View style={[styles.swatch, { backgroundColor: hex }]} />
        <Txt variant="caption" color={colors.inkSoft}>{`Custom ${title.toLowerCase()} ${hex}`}</Txt>
      </View>
      <Slider
        label={`${title}: hue`}
        min={0}
        max={359}
        step={1}
        value={Math.round(hsl.h)}
        valueText={`${Math.round(hsl.h)}°`}
        tint={hslToHex({ h: hsl.h, s: 0.8, l: 0.5 })}
        onChange={(h) => update({ h }, false)}
        onCommit={(h) => update({ h }, true)}
      />
      <Slider
        label={`${title}: richness`}
        min={0}
        max={1}
        step={0.02}
        value={hsl.s}
        valueText={`${Math.round(hsl.s * 100)}%`}
        low="Grey"
        high="Vivid"
        onChange={(s) => update({ s }, false)}
        onCommit={(s) => update({ s }, true)}
      />
      <Slider
        label={`${title}: lightness`}
        min={0.05}
        max={0.95}
        step={0.02}
        value={hsl.l}
        valueText={`${Math.round(hsl.l * 100)}%`}
        low="Dark"
        high="Light"
        onChange={(l) => update({ l }, false)}
        onCommit={(l) => update({ l }, true)}
      />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    box: {
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.line,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
    },
  }),
);

export default ColorPicker;
