// Time-of-Day Histogram: quest completions grouped into morning,
// afternoon and evening (in the user's own timezone, computed by the
// user_behavioral_patterns view).
//
// - Responsive: measures its own width; bars, gaps and the tooltip are
//   derived from it, so it fits a 320 px phone and a wide web column.
// - Animates on mount: bars rise from the baseline with a stagger
//   (native driver: transform + opacity only). Reduce Motion skips it.
// - Tap a bar for a tooltip with the range, count, share and per-day
//   average. Tap it again (or another bar) to close or switch.
// - Dark mode first: gradient bars with a soft glow on the peak, faint
//   dashed grid, all colors from theme tokens.

import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Txt from '../Txt';
import { niceMax, type TimeBin, type TimeOfDay } from '../../features/analytics/patterns';
import { colors, radius, spacing, themed, withAlpha } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const CHART_H = 168;
const AXIS_W = 28;
const LABEL_H = 46;
const VALUE_H = 20;
const TIP_W = 168;
const TIP_H = 70;
const RISE_MS = 620;
const STAGGER_MS = 110;
const MIN_BAR_PX = 4;
const useNative = Platform.OS !== 'web';

export interface TimeOfDayHistogramProps {
  bins: TimeBin[];
}

function slotColor(key: TimeOfDay): string {
  if (key === 'morning') return colors.gold;
  if (key === 'afternoon') return colors.accent;
  return colors.pillar.work;
}

/** Bar with rounded top corners only, from (0,0) to (w,h). */
function barPath(w: number, h: number): string {
  const r = Math.min(8, w / 2, h);
  return `M0 ${h} L0 ${r} Q0 0 ${r} 0 L${w - r} 0 Q${w} 0 ${w} ${r} L${w} ${h} Z`;
}

function SlotGlyph({ slot, color }: { slot: TimeOfDay; color: string }) {
  const s = 16;
  if (slot === 'morning') {
    // Sun on the horizon.
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Path d="M6 16a6 6 0 0 1 12 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        <Line x1={3} y1={19} x2={21} y2={19} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        <Line x1={12} y1={4} x2={12} y2={7} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        <Line x1={4.5} y1={8.5} x2={6.5} y2={10.5} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        <Line x1={19.5} y1={8.5} x2={17.5} y2={10.5} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    );
  }
  if (slot === 'afternoon') {
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={4.5} stroke={color} strokeWidth={1.6} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const rad = (a * Math.PI) / 180;
          return (
            <Line
              key={a}
              x1={12 + Math.cos(rad) * 7.5}
              y1={12 + Math.sin(rad) * 7.5}
              x2={12 + Math.cos(rad) * 9.5}
              y2={12 + Math.sin(rad) * 9.5}
              stroke={color}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
    );
  }
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface BarProps {
  bin: TimeBin;
  width: number;
  height: number;
  progress: Animated.Value;
  dimmed: boolean;
  selected: boolean;
  themeId: string;
}

/** One bar. Memoized: opening the tooltip re-renders only what changed. */
const Bar = memo(function Bar({ bin, width, height, progress, dimmed, selected }: BarProps) {
  const color = slotColor(bin.key);
  const id = `tod-${bin.key}`;
  const h = Math.max(bin.count > 0 ? MIN_BAR_PX : 0, height);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.barWrap,
        {
          width,
          height: h,
          opacity: Animated.multiply(progress, dimmed ? 0.4 : 1),
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [h, 0] }),
            },
          ],
        },
      ]}
    >
      {h > 0 ? (
        <Svg width={width} height={h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={1} />
              <Stop offset="1" stopColor={color} stopOpacity={0.28} />
            </LinearGradient>
          </Defs>
          <Path d={barPath(width, h)} fill={`url(#${id})`} />
          {/* Bright cap line: reads as a lit edge on dark backgrounds. */}
          <Rect x={2} y={0} width={Math.max(0, width - 4)} height={2} rx={1} fill={color} />
          {selected ? (
            <G transform="translate(1 1)">
              <Path
                d={barPath(width - 2, h - 1)}
                fill="none"
                stroke={colors.ink}
                strokeWidth={1.5}
              />
            </G>
          ) : null}
        </Svg>
      ) : null}
    </Animated.View>
  );
});

export function TimeOfDayHistogram({ bins }: TimeOfDayHistogramProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<TimeOfDay | null>(null);

  const total = bins.reduce((s, b) => s + b.count, 0);
  const top = niceMax(Math.max(...bins.map((b) => b.count), 0));

  // One value per bar; recreated only when the data changes so a new
  // dataset animates in again.
  const dataKey = bins.map((b) => b.count).join(',');
  const progress = useMemo(
    () => bins.map(() => new Animated.Value(0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataKey, bins.length],
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
          progress.map((v) =>
            Animated.timing(v, {
              toValue: 1,
              duration: RISE_MS,
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

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const plotW = Math.max(0, width - AXIS_W);
  const slotW = bins.length > 0 ? plotW / bins.length : 0;
  // Bars take ~52% of their slot, between 28 and 88 px.
  const barW = Math.round(Math.max(28, Math.min(88, slotW * 0.52)));
  const plotH = CHART_H - VALUE_H;
  const heightFor = (count: number) => (top > 0 ? Math.round((count / top) * plotH) : 0);

  const sel = bins.find((b) => b.key === selected) ?? null;
  const selIndex = sel ? bins.indexOf(sel) : -1;
  const tip =
    sel && width > 0
      ? {
          left: Math.max(
            0,
            Math.min(width - TIP_W, AXIS_W + selIndex * slotW + slotW / 2 - TIP_W / 2),
          ),
          top: Math.max(0, CHART_H - heightFor(sel.count) - TIP_H - 8),
        }
      : null;

  const gridValues = [top, top / 2, 0];

  return (
    <View onLayout={onLayout} style={styles.root}>
      {width > 0 ? (
        <>
          {/* Grid + axis labels */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={width} height={CHART_H}>
              {gridValues.map((v) => {
                const y = CHART_H - heightFor(v) - (v === 0 ? 0.5 : 0);
                return (
                  <Line
                    key={v}
                    x1={AXIS_W}
                    x2={width}
                    y1={y}
                    y2={y}
                    stroke={v === 0 ? colors.line : withAlpha(colors.inkFaint, 0.25)}
                    strokeWidth={1}
                    strokeDasharray={v === 0 ? undefined : '3 5'}
                  />
                );
              })}
            </Svg>
            {gridValues.slice(0, 2).map((v) => (
              <Txt
                key={v}
                variant="caption"
                color={colors.inkFaint}
                style={[styles.axisLabel, { top: CHART_H - heightFor(v) - 8 }]}
              >
                {Number.isInteger(v) ? `${v}` : v.toFixed(1)}
              </Txt>
            ))}
          </View>

          <View style={[styles.plot, { marginLeft: AXIS_W }]}>
            {bins.map((b, i) => {
              const h = heightFor(b.count);
              const isSel = selected === b.key;
              const color = slotColor(b.key);
              return (
                <Pressable
                  key={b.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.label}, ${b.range}: ${b.count} quests completed, ${b.share} percent${b.isPeak ? ', your peak time' : ''}. Tap for details.`}
                  accessibilityState={{ selected: isSel }}
                  onPress={() => setSelected((prev) => (prev === b.key ? null : b.key))}
                  style={[styles.slot, { width: slotW }]}
                >
                  <View style={[styles.column, { height: CHART_H }]}>
                    {b.isPeak && h > 0 ? (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.glow,
                          {
                            width: barW + 24,
                            height: h + 12,
                            backgroundColor: withAlpha(color, 0.1),
                            borderColor: withAlpha(color, 0.18),
                          },
                        ]}
                      />
                    ) : null}
                    <Animated.View
                      pointerEvents="none"
                      style={[styles.valueLabel, { bottom: h + 4, opacity: progress[i] }]}
                    >
                      <Txt
                        variant="bodySemi"
                        color={b.isPeak ? color : colors.inkSoft}
                        align="center"
                      >
                        {`${b.count}`}
                      </Txt>
                    </Animated.View>
                    <Bar
                      bin={b}
                      width={barW}
                      height={h}
                      progress={progress[i]}
                      dimmed={selected !== null && !isSel}
                      selected={isSel}
                      themeId={theme.id}
                    />
                  </View>
                  <View style={styles.label}>
                    <SlotGlyph slot={b.key} color={b.isPeak ? color : colors.inkFaint} />
                    <Txt
                      variant="caption"
                      color={b.isPeak ? colors.ink : colors.inkSoft}
                      align="center"
                      numberOfLines={1}
                      style={styles.labelText}
                    >
                      {b.label}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {sel && tip ? (
            <View
              pointerEvents="none"
              accessibilityLiveRegion="polite"
              style={[
                styles.tooltip,
                { left: tip.left, top: tip.top, borderColor: withAlpha(slotColor(sel.key), 0.6) },
              ]}
            >
              <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                {`${sel.label} · ${sel.range}`}
              </Txt>
              <Txt variant="bodySemi" color={slotColor(sel.key)} numberOfLines={1}>
                {`${sel.count} ${sel.count === 1 ? 'quest' : 'quests'} · ${sel.share}%`}
              </Txt>
              <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
                {sel.count > 0 ? `About ${sel.perDay} a day` : 'Nothing finished here yet'}
              </Txt>
            </View>
          ) : null}

          {total === 0 ? (
            <View pointerEvents="none" style={[styles.empty, { left: AXIS_W }]}>
              <Txt variant="caption" color={colors.inkFaint} align="center">
                Finish a few quests and your daily rhythm shows up here.
              </Txt>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: {
      width: '100%',
      height: CHART_H + LABEL_H,
    },
    axisLabel: {
      position: 'absolute',
      left: 0,
      width: AXIS_W - 6,
      textAlign: 'right',
      fontSize: 10,
      lineHeight: 14,
    },
    plot: {
      flexDirection: 'row',
    },
    slot: {
      minWidth: 44,
      alignItems: 'center',
    },
    column: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    glow: {
      position: 'absolute',
      bottom: 0,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      borderWidth: 1,
      borderBottomWidth: 0,
    },
    barWrap: {
      overflow: 'hidden',
    },
    valueLabel: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    label: {
      height: LABEL_H,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: spacing.xs,
    },
    labelText: {
      marginTop: 2,
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
    },
    empty: {
      position: 'absolute',
      right: 0,
      top: CHART_H / 2 - 20,
      paddingHorizontal: spacing.md,
    },
  }),
);

export default TimeOfDayHistogram;
