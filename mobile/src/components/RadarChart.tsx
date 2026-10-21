import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import {
  colors,
  PILLAR_LABELS,
  PILLARS,
  Pillar,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface RadarOverlay {
  values: Partial<Record<Pillar, number>>;
  color: string;
  fillOpacity?: number;
}

export interface RadarChartProps {
  values: Partial<Record<Pillar, number>>; // 0 to 100 per pillar
  size?: number;
  /** Additional polygons drawn under the primary one. */
  overlays?: RadarOverlay[];
}

const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

function pointAt(
  center: number,
  radius: number,
  index: number,
  total: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

export function RadarChart({ values, size = 240, overlays = [] }: RadarChartProps) {
  useTheme();
  const center = size / 2;
  const radius = center - 28;
  const total = PILLARS.length;

  const gridPolygon = (level: number) =>
    PILLARS.map((_, i) => {
      const p = pointAt(center, radius * level, i, total);
      return `${p.x},${p.y}`;
    }).join(' ');

  const polygonFor = (vals: Partial<Record<Pillar, number>>) =>
    PILLARS.map((pillar, i) => {
      const raw = vals[pillar] ?? 0;
      const clamped = Math.max(0, Math.min(100, raw)) / 100;
      const p = pointAt(center, radius * Math.max(clamped, 0.02), i, total);
      return `${p.x},${p.y}`;
    }).join(' ');

  const valuePolygon = polygonFor(values);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {GRID_LEVELS.map((level) => (
          <Polygon
            key={level}
            points={gridPolygon(level)}
            stroke={colors.line}
            strokeWidth={1}
            fill="none"
          />
        ))}
        {PILLARS.map((pillar, i) => {
          const p = pointAt(center, radius, i, total);
          return (
            <Line
              key={pillar}
              x1={center}
              y1={center}
              x2={p.x}
              y2={p.y}
              stroke={colors.line}
              strokeWidth={1}
            />
          );
        })}
        {overlays.map((overlay, idx) => (
          <Polygon
            key={idx}
            points={polygonFor(overlay.values)}
            stroke={overlay.color}
            strokeWidth={1.4}
            strokeDasharray="5 3"
            fill={withAlpha(overlay.color, overlay.fillOpacity ?? 0.08)}
            strokeLinejoin="round"
          />
        ))}
        <Polygon
          points={valuePolygon}
          stroke={colors.accent}
          strokeWidth={1.5}
          fill={withAlpha(colors.accent, 0.15)}
          strokeLinejoin="round"
        />
        {PILLARS.map((pillar, i) => {
          const p = pointAt(center, radius + 16, i, total);
          return (
            <SvgText
              key={pillar}
              x={p.x}
              y={p.y}
              fill={colors.inkFaint}
              fontSize={9}
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {PILLAR_LABELS[pillar]}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});

export default RadarChart;
