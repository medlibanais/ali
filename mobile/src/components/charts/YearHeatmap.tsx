// GitHub-style contribution heatmap for the last 365 days of XP.
//
// Colors are continuous: each day's XP maps to a blend between the empty
// cell color and the theme accent (see xpIntensity), not to 5 buckets.
//
// Performance, for a year of data on low-end Android:
// - Each week is one memoized SVG column (7 <Rect>s). Tapping a day or
//   showing the tooltip never re-renders the 365 cells; only a tiny
//   overlay SVG and the tooltip change.
// - The cascade animates the 53 week columns, not 365 cells, with the
//   native driver (opacity + transform), so it runs on the UI thread.
// - One Pressable covers the grid and maps the tap position to a day,
//   instead of 365 touchables.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  GestureResponderEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Txt from '../Txt';
import {
  buildYearGrid,
  formatHeatDate,
  xpIntensity,
  type HeatCell,
  type XpDay,
} from '../../features/analytics/yearHeatmap';
import { colors, mix, radius, spacing, themed } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const CELL = 12;
const GAP = 3;
const PITCH = CELL + GAP;
const ROWS = 7;
const GRID_H = ROWS * PITCH - GAP;
const MONTH_H = 16;
const LABEL_W = 30;
const TIP_W = 150;
const TIP_H = 44;
const STAGGER_MS = 14;
const COLUMN_MS = 360;
const useNative = Platform.OS !== 'web';

export interface YearHeatmapProps {
  /** XP per day; missing days count as 0. */
  days: XpDay[];
  /** Today in the user's timezone, yyyy-mm-dd. */
  today: string;
}

interface ColumnProps {
  cells: HeatCell[];
  fills: string[];
  progress: Animated.Value;
}

interface WebPointer {
  clientX?: number;
  clientY?: number;
  locationX?: number;
  locationY?: number;
}
interface WebTarget {
  getBoundingClientRect?: () => { left: number; top: number };
}

/**
 * Tap position inside the grid. Native gives locationX/Y; on web a mouse
 * click arrives as a DOM event, so measure against the grid's own box.
 */
function tapPoint(e: GestureResponderEvent): { x: number; y: number } | null {
  const ne = e.nativeEvent as unknown as WebPointer;
  if (typeof ne.locationX === 'number' && typeof ne.locationY === 'number') {
    return { x: ne.locationX, y: ne.locationY };
  }
  const rect = (e.currentTarget as unknown as WebTarget).getBoundingClientRect?.();
  if (rect && typeof ne.clientX === 'number' && typeof ne.clientY === 'number') {
    return { x: ne.clientX - rect.left, y: ne.clientY - rect.top };
  }
  return null;
}

/** One week: 7 static rects. Memoized so taps never re-render it. */
const WeekColumn = memo(function WeekColumn({ cells, fills, progress }: ColumnProps) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.column,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1],
              }),
            },
          ],
        },
      ]}
    >
      <Svg width={CELL} height={GRID_H}>
        {cells.map((c, i) => (
          <Rect
            key={c.date}
            x={0}
            y={c.row * PITCH}
            width={CELL}
            height={CELL}
            rx={3}
            fill={fills[i]}
          />
        ))}
      </Svg>
    </Animated.View>
  );
});

/** Continuous color scale. Memoized: it only changes with the data or theme. */
const Legend = memo(function Legend({ scaleMax }: { scaleMax: number; themeId: string }) {
  return (
    <View style={styles.legend} accessibilityLabel={`Color scale from 0 to ${scaleMax} XP or more`}>
      <Txt variant="caption" color={colors.inkFaint}>
        0
      </Txt>
      <Svg width={64} height={10} style={styles.legendBar}>
        <Defs>
          <LinearGradient id="yearHeatLegend" x1="0" y1="0" x2="1" y2="0">
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <Stop
                key={p}
                offset={p}
                stopColor={mix(
                  colors.paperAlt,
                  colors.accent,
                  p === 0 ? 0 : xpIntensity(p * scaleMax, scaleMax),
                )}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={64} height={10} rx={3} fill="url(#yearHeatLegend)" />
      </Svg>
      <Txt variant="caption" color={colors.inkFaint}>
        {`${scaleMax}+ XP`}
      </Txt>
    </View>
  );
});

export function YearHeatmap({ days, today }: YearHeatmapProps) {
  const theme = useTheme();
  const grid = useMemo(() => buildYearGrid(days, today), [days, today]);
  const [selected, setSelected] = useState<HeatCell | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Cells grouped per week column, with their fills precomputed once per
  // data/theme change.
  const columns = useMemo(() => {
    const empty = colors.paperAlt;
    const out: { cells: HeatCell[]; fills: string[] }[] = Array.from(
      { length: grid.weeks },
      () => ({ cells: [], fills: [] }),
    );
    for (const c of grid.cells) {
      const t = xpIntensity(c.xp, grid.scaleMax);
      out[c.col].cells.push(c);
      out[c.col].fills.push(t === 0 ? empty : mix(empty, colors.accent, t));
    }
    return out;
    // theme.id: fills must follow theme switches.
  }, [grid, theme.id]);

  const lookup = useMemo(() => {
    const m = new Map<string, HeatCell>();
    for (const c of grid.cells) m.set(`${c.col}:${c.row}`, c);
    return m;
  }, [grid]);

  // One animated value per week column; the cascade starts at the newest
  // week (the one on screen first) and sweeps back through the year.
  const progress = useMemo(
    () => Array.from({ length: grid.weeks }, () => new Animated.Value(0)),
    [grid.weeks],
  );

  useEffect(() => {
    let cancelled = false;
    let anim: Animated.CompositeAnimation | null = null;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          progress.forEach((v) => v.setValue(1));
          return;
        }
        anim = Animated.stagger(
          STAGGER_MS,
          [...progress].reverse().map((v) =>
            Animated.timing(v, {
              toValue: 1,
              duration: COLUMN_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: useNative,
            }),
          ),
        );
        anim.start();
      });
    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [progress]);

  const onPress = useCallback(
    (e: GestureResponderEvent) => {
      const point = tapPoint(e);
      if (!point) return;
      const { x: locationX, y: locationY } = point;
      const col = Math.floor(locationX / PITCH);
      const row = Math.floor(locationY / PITCH);
      const hit = lookup.get(`${col}:${row}`) ?? null;
      setSelected((prev) => (hit === null || prev?.date === hit.date ? null : hit));
    },
    [lookup],
  );

  const width = grid.weeks * PITCH - GAP;
  const tip = selected
    ? {
        left: Math.max(0, Math.min(width - TIP_W, selected.col * PITCH + CELL / 2 - TIP_W / 2)),
        top: selected.row <= 2 ? selected.row * PITCH + CELL + 4 : selected.row * PITCH - TIP_H - 4,
      }
    : null;

  const summary =
    grid.activeDays === 0
      ? 'No XP in the last 365 days yet.'
      : `${grid.totalXp.toLocaleString()} XP over ${grid.activeDays} active days in the last year.`;

  return (
    <View>
      <View style={styles.body}>
        <View style={styles.dayLabels} accessibilityElementsHidden importantForAccessibility="no">
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <Txt
              key={d}
              variant="caption"
              color={colors.inkFaint}
              style={[styles.dayLabel, { top: MONTH_H + (1 + i * 2) * PITCH - 2 }]}
            >
              {d}
            </Txt>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          style={styles.scroll}
        >
          <View style={{ width }}>
            <View style={styles.months} accessibilityElementsHidden importantForAccessibility="no">
              {grid.months.map((m) => (
                <Txt
                  key={`${m.col}-${m.label}`}
                  variant="caption"
                  color={colors.inkFaint}
                  style={[styles.month, { left: m.col * PITCH }]}
                >
                  {m.label}
                </Txt>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Year of activity. ${summary} Tap a day to see its date and XP.`}
              onPress={onPress}
              style={[styles.grid, { width, height: GRID_H }]}
            >
              {columns.map((col, i) => (
                <WeekColumn key={i} cells={col.cells} fills={col.fills} progress={progress[i]} />
              ))}
              {selected ? (
                <Svg
                  width={width}
                  height={GRID_H}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                >
                  <Rect
                    x={selected.col * PITCH - 1}
                    y={selected.row * PITCH - 1}
                    width={CELL + 2}
                    height={CELL + 2}
                    rx={4}
                    fill="none"
                    stroke={colors.ink}
                    strokeWidth={2}
                  />
                </Svg>
              ) : null}
            </Pressable>
            {selected && tip ? (
              <View
                pointerEvents="none"
                accessibilityLiveRegion="polite"
                style={[styles.tooltip, { left: tip.left, top: MONTH_H + tip.top }]}
              >
                <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                  {formatHeatDate(selected.date)}
                </Txt>
                <Txt
                  variant="bodySemi"
                  color={selected.xp > 0 ? colors.accent : colors.ink}
                  numberOfLines={1}
                >
                  {selected.xp > 0 ? `${selected.xp.toLocaleString()} XP earned` : 'No XP'}
                </Txt>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <Txt variant="caption" color={colors.inkFaint} style={styles.footerText} numberOfLines={2}>
          {grid.best ? `Best day: ${formatHeatDate(grid.best.date)}, ${grid.best.xp} XP` : summary}
        </Txt>
        <Legend scaleMax={grid.scaleMax} themeId={theme.id} />
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    body: {
      flexDirection: 'row',
    },
    dayLabels: {
      width: LABEL_W,
      height: MONTH_H + GRID_H,
    },
    dayLabel: {
      position: 'absolute',
      left: 0,
      fontSize: 10,
      lineHeight: 14,
    },
    scroll: {
      flex: 1,
    },
    months: {
      height: MONTH_H,
    },
    month: {
      position: 'absolute',
      top: 0,
      fontSize: 10,
      lineHeight: 14,
    },
    grid: {
      flexDirection: 'row',
    },
    column: {
      width: CELL,
      height: GRID_H,
      marginRight: GAP,
    },
    tooltip: {
      position: 'absolute',
      width: TIP_W,
      height: TIP_H,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.outline ?? colors.line,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    footerText: {
      flex: 1,
      marginRight: spacing.sm,
    },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    legendBar: {
      marginHorizontal: spacing.xs,
    },
  }),
);

export default YearHeatmap;
