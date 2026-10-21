// Compact SVG line/area chart with average line, best/worst markers,
// tap-to-inspect tooltip and a fade-in animation.

import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import Txt from '../Txt';
import { borderWidth, colors, radius, spacing, themed } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export interface LinePoint {
  label: string;
  value: number;
  hint?: string;
}

export interface LineChartProps {
  data: LinePoint[];
  height?: number;
  color?: string;
  showAverage?: boolean;
  areaFill?: boolean;
  emptyLabel?: string;
}

export function LineChart({
  data,
  height = 180,
  color,
  showAverage = true,
  areaFill = true,
  emptyLabel = 'No data yet',
}: LineChartProps) {
  useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const fade = useMemo(() => new Animated.Value(0), []);
  const stroke = color ?? colors.accent;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [data, fade]);

  const geometry = useMemo(() => {
    if (width <= 0 || data.length === 0) return null;
    const padX = 10;
    const padTop = 16;
    const padBottom = 20;
    const innerW = width - padX * 2;
    const innerH = height - padTop - padBottom;
    const max = Math.max(100, ...data.map((d) => d.value));
    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const pts = data.map((d, i) => ({
      x: padX + stepX * i,
      y: padTop + innerH * (1 - d.value / max),
      ...d,
    }));
    const linePath = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${padTop + innerH} L${pts[0].x.toFixed(1)},${padTop + innerH} Z`;
    const avg = data.reduce((s, d) => s + d.value, 0) / data.length;
    const avgY = padTop + innerH * (1 - avg / max);
    let bestIdx = 0;
    let worstIdx = 0;
    pts.forEach((p, i) => {
      if (p.value > pts[bestIdx].value) bestIdx = i;
      if (p.value < pts[worstIdx].value) worstIdx = i;
    });
    return { pts, linePath, areaPath, avg, avgY, bestIdx, worstIdx };
  }, [width, data, height]);

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Txt variant="caption" color={colors.inkFaint}>
          {emptyLabel}
        </Txt>
      </View>
    );
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {geometry ? (
        <Animated.View style={{ opacity: fade }}>
          <Svg width={width} height={height}>
            <Defs>
              <SvgLinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
              </SvgLinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line
                key={f}
                x1={10}
                x2={width - 10}
                y1={16 + (height - 36) * f}
                y2={16 + (height - 36) * f}
                stroke={colors.line}
                strokeWidth={1}
                strokeDasharray="3 5"
              />
            ))}
            {areaFill ? <Path d={geometry.areaPath} fill="url(#areaFill)" /> : null}
            <Path
              d={geometry.linePath}
              stroke={stroke}
              strokeWidth={2.4}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {showAverage ? (
              <Line
                x1={10}
                x2={width - 10}
                y1={geometry.avgY}
                y2={geometry.avgY}
                stroke={colors.inkFaint}
                strokeWidth={1.2}
                strokeDasharray="6 4"
              />
            ) : null}
            {geometry.pts.map((p, i) => (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={
                  i === selected
                    ? 5
                    : i === geometry.bestIdx || i === geometry.worstIdx
                      ? 4
                      : 0
                }
                fill={
                  i === geometry.bestIdx
                    ? colors.accent
                    : i === geometry.worstIdx
                      ? colors.danger
                      : stroke
                }
                stroke={colors.card}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
          <View style={StyleSheet.absoluteFill}>
            {geometry.pts.map((p, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${p.label}: ${p.value}`}
                onPress={() => setSelected(i === selected ? null : i)}
                style={{
                  position: 'absolute',
                  left: p.x - 16,
                  top: p.y - 16,
                  width: 32,
                  height: 32,
                }}
              />
            ))}
          </View>
          {selected !== null && geometry.pts[selected] ? (
            <View
              style={[
                styles.tooltip,
                {
                  left: Math.min(
                    Math.max(geometry.pts[selected].x - 70, 0),
                    Math.max(width - 150, 0),
                  ),
                },
              ]}
              pointerEvents="none"
            >
              <Txt variant="caption" color={colors.onAccent}>
                {`${geometry.pts[selected].label}: ${geometry.pts[selected].value}`}
              </Txt>
              {geometry.pts[selected].hint ? (
                <Txt variant="caption" color={colors.onAccent}>
                  {geometry.pts[selected].hint}
                </Txt>
              ) : null}
            </View>
          ) : null}
          {showAverage ? (
            <Txt variant="caption" color={colors.inkFaint} style={styles.avgNote}>
              {`Average ${Math.round(geometry.avg)}`}
            </Txt>
          ) : null}
        </Animated.View>
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
      backgroundColor: colors.ink,
      borderRadius: radius.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      width: 150,
    },
    avgNote: {
      position: 'absolute',
      right: 4,
      bottom: 2,
    },
  }),
);

export default LineChart;
