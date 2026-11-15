// A slider that works the same on phones and the web, with no native
// module: drag the thumb, tap the track, or use the accessibility
// increment/decrement actions. `onChange` fires while dragging (for live
// previews) and `onCommit` once when the finger lifts (for undo history).

import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { colors, mix, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Txt from './Txt';

export interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Words under the two ends of the track. */
  low?: string;
  high?: string;
  /** Text shown for the value, on the right of the label. */
  valueText?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  /** Extra styling of the filled part, e.g. a color for a hue slider. */
  tint?: string;
}

const THUMB = 26;
const TOUCH = 44;

export function Slider({ label, value, min = -1, max = 1, step = 0.05, low, high, valueText, onChange, onCommit, tint }: SliderProps) {
  useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const startRef = useRef(0);
  const latest = useRef(value);
  latest.current = value;
  const cb = useRef({ onChange, onCommit });
  cb.current = { onChange, onCommit };

  const snap = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    return Math.round(Math.round((clamped - min) / step) * step * 1000 + min * 1000) / 1000;
  };
  const fromX = (x: number) => snap(min + (Math.max(0, Math.min(1, (x - THUMB / 2) / Math.max(1, widthRef.current - THUMB))) * (max - min)));
  const snapRef = useRef({ snap, fromX });
  snapRef.current = { snap, fromX };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a sideways drag takes the gesture, so the list still scrolls.
        // Capture, so the drag wins over the tap handler inside.
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3,
        onPanResponderGrant: () => {
          startRef.current = latest.current;
        },
        onPanResponderMove: (_e, g) => {
          const span = Math.max(1, widthRef.current - THUMB);
          const next = snapRef.current.snap(startRef.current + (g.dx / span) * (max - min));
          if (next !== latest.current) {
            latest.current = next;
            cb.current.onChange(next);
          }
        },
        onPanResponderRelease: () => cb.current.onCommit?.(latest.current),
        onPanResponderTerminate: () => cb.current.onCommit?.(latest.current),
        onPanResponderTerminationRequest: () => false,
      }),
    [min, max],
  );

  const set = (next: number) => {
    const v = snap(next);
    if (v === value) return;
    onChange(v);
    onCommit?.(v);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  // Web: arrow keys move a focused slider.
  const webKeys =
    Platform.OS === 'web'
      ? ({
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            set(value + dir * step);
          },
        } as object)
      : null;

  const t = (value - min) / (max - min);
  const span = Math.max(0, width - THUMB);
  const thumbX = t * span;
  // Two-sided sliders fill from the middle, amounts from the left.
  const zeroX = min < 0 ? ((0 - min) / (max - min)) * span + THUMB / 2 : THUMB / 2;
  const fillLeft = Math.min(zeroX, thumbX + THUMB / 2);
  const fillWidth = Math.abs(thumbX + THUMB / 2 - zeroX);
  const shown = valueText ?? `${Math.round(value * 100)}`;
  // Screen readers get whole numbers: percent for 0..1 ranges.
  const unit = max > 1 ? 1 : 100;

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Txt variant="caption" color={colors.ink}>{label}</Txt>
        <Txt variant="caption" color={colors.inkSoft}>{shown}</Txt>
      </View>
      <View {...pan.panHandlers}>
      <Pressable
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: Math.round(min * unit), max: Math.round(max * unit), now: Math.round(value * unit), text: shown }}
        aria-valuemin={Math.round(min * unit)}
        aria-valuemax={Math.round(max * unit)}
        aria-valuenow={Math.round(value * unit)}
        aria-valuetext={shown}
        {...webKeys}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step * 2 : -step * 2))}
        onPress={(e) => {
          const x = e.nativeEvent.locationX;
          if (typeof x === 'number' && Number.isFinite(x)) set(fromX(x));
        }}
        onLayout={onLayout}
        style={styles.touch}
      >
        <View style={styles.track} pointerEvents="none" />
        {min < 0 ? <View style={[styles.tick, { left: zeroX - 1 }]} pointerEvents="none" /> : null}
        <View style={[styles.fill, { left: fillLeft, width: fillWidth }, tint ? { backgroundColor: tint } : null]} pointerEvents="none" />
        <View style={[styles.thumb, { left: thumbX }, tint ? { borderColor: tint } : null]} pointerEvents="none" />
      </Pressable>
      </View>
      {low || high ? (
        <View style={styles.ends}>
          <Txt variant="caption" color={colors.inkFaint} style={styles.end}>{low ?? ''}</Txt>
          <Txt variant="caption" color={colors.inkFaint} style={styles.end}>{high ?? ''}</Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      paddingVertical: spacing.xs,
    },
    head: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    touch: {
      height: TOUCH,
      justifyContent: 'center',
    },
    track: {
      position: 'absolute',
      left: THUMB / 2,
      right: THUMB / 2,
      height: 6,
      borderRadius: 3,
      backgroundColor: mix(colors.line, colors.inkFaint, 0.25),
    },
    tick: {
      position: 'absolute',
      width: 2,
      height: 14,
      borderRadius: 1,
      backgroundColor: colors.inkFaint,
    },
    fill: {
      position: 'absolute',
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    thumb: {
      position: 'absolute',
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      backgroundColor: colors.card,
      borderWidth: 3,
      borderColor: colors.accent,
    },
    ends: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -6,
    },
    end: {
      fontSize: 11,
      lineHeight: 14,
    },
  }),
);

export default Slider;
