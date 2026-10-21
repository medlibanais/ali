// SVG bar chart: single or stacked series, cap line, tap tooltips.

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import Txt from '../Txt';
import { borderWidth, colors, PILLARS, radius, spacing, themed } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export interface BarDatum {
  label: string;
  value: number;
  hint?: string;
  /** Stacked segments (pillar -> value) for stacked mode. */
  segments?: { key: string; value: number }[];
}

export interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  capLine?: { value: number; label: string };
  maxValue?: number;
  emptyLabel?: string;
}

export function BarChart({
  data,
  height = 170,
  color,
  capLine,
  maxValue,
  emptyLabel = 'No data yet',
}: BarChartProps) {
  useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const stroke = color ?? colors.accent;

  const geometry = useMemo(() => {
    if (width <= 0 || data.length === 0) return null;
    const padTop = 16;
    const padBottom = 22;
    const innerH = height - padTop - padBottom;
    const max =
      maxValue ??
      Math.max(
        capLine?.value ?? 0,
        ...data.map((d) =>
          d.segments
            ? d.segments.reduce((s, seg) => s + seg.value, 0)
            : d.value,
        ),
        1,
      );
    const slot = width / data.length;
    const barW = Math.min(28, slot * 0.62);
    const bars = data.map((d, i) => {
      const total = d.segments
        ? d.segments.reduce((s, seg) => s + seg.value, 0)
        : d.value;
      const h = (total / max) * innerH;
      return {
        x: slot * i + (slot - barW) / 2,
        y: padTop + innerH - h,
        w: barW,
        h,
        total,
        ...d,
      };
    });
    const capY = capLine ? padTop + innerH * (1 - capLine.value / max) : null;
    return { bars, capY, innerH, padTop };
  }, [width, data, height, capLine, maxValue]);

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Txt variant="caption" color={colors.inkFaint}>
          {emptyLabel}
        </Txt>
      </View>
    );
  }

  const segmentColor = (key: string): string => {
    if ((PILLARS as string[]).includes(key)) {
      return colors.pillar[key as (typeof PILLARS)[number]];
    }
    return stroke;
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {geometry ? (
        <>
          <Svg width={width} height={height}>
            {geometry.bars.map((bar, i) =>
              bar.segments ? (
                (() => {
                  let accY = geometry.padTop + geometry.innerH;
                  return bar.segments.map((seg, si) => {
                    const segH =
                      bar.total > 0 ? (seg.value / bar.total) * bar.h : 0;
                    accY -= segH;
                    return (
                      <Rect
                        key={`${i}-${si}`}
                        x={bar.x}
                        y={accY}
                        width={bar.w}
                        height={Math.max(segH, 0)}
                        rx={si === bar.segments!.length - 1 ? 3 : 0}
                        fill={segmentColor(seg.key)}
                        opacity={selected === null || selected === i ? 1 : 0.4}
                      />
                    );
                  });
                })()
              ) : (
                <Rect
                  key={i}
                  x={bar.x}
                  y={bar.y}
                  width={bar.w}
                  height={Math.max(bar.h, 1)}
                  rx={3}
                  fill={stroke}
                  opacity={selected === null || selected === i ? 1 : 0.4}
                />
              ),
            )}
            {geometry.capY !== null && capLine ? (
              <>
                <Line
                  x1={0}
                  x2={width}
                  y1={geometry.capY}
                  y2={geometry.capY}
                  stroke={colors.danger}
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                />
              </>
            ) : null}
          </Svg>
          <View style={StyleSheet.absoluteFill}>
            {geometry.bars.map((bar, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${bar.label}: ${bar.total}`}
                onPress={() => setSelected(i === selected ? null : i)}
                style={{
                  position: 'absolute',
                  left: bar.x - 6,
                  top: 0,
                  width: bar.w + 12,
                  height,
                }}
              />
            ))}
          </View>
          {selected !== null && geometry.bars[selected] ? (
            <View style={styles.tooltip} pointerEvents="none">
              <Txt variant="caption" color={colors.onAccent} align="center">
                {`${geometry.bars[selected].label}: ${geometry.bars[selected].total}`}
              </Txt>
              {geometry.bars[selected].hint ? (
                <Txt variant="caption" color={colors.onAccent} align="center">
                  {geometry.bars[selected].hint}
                </Txt>
              ) : null}
            </View>
          ) : null}
          {capLine ? (
            <Txt variant="caption" color={colors.danger} style={styles.capNote}>
              {capLine.label}
            </Txt>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      borderStyle: 'dashed',
    },
    tooltip: {
      position: 'absolute',
      top: 0,
      alignSelf: 'center',
      backgroundColor: colors.ink,
      borderRadius: radius.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      minWidth: 120,
    },
    capNote: {
      position: 'absolute',
      right: 4,
      top: 2,
    },
  }),
);

export default BarChart;
