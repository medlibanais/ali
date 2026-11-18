// Perfect Day takeover: the five pillar arcs draw themselves into a ring one
// after another, a check mark strokes in, and a halo of rays opens behind.
// All SVG; strokes animate through animated props on the UI thread.

import React, { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Modal, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { G, Line, Path } from 'react-native-svg';
import Button from '../../components/Button';
import Txt from '../../components/Txt';
import { colors, getColors, PILLARS, spacing, themed, withAlpha } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const BOX = 240;
const C = BOX / 2;
const R = 86;
const GAP_DEG = 9;
const ARC_DEG = 360 / PILLARS.length - GAP_DEG;
const ARC_LEN = (Math.PI * R * ARC_DEG) / 180;
const CHECK = 'M92 122 L113 143 L152 101';
const CHECK_LEN = Math.hypot(21, 21) + Math.hypot(39, 42) + 2;
const RAYS = 16;
const RING_MS = 1400;
const CHECK_MS = 420;

function polar(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function arcPath(startDeg: number): string {
  const a = polar(startDeg, R);
  const b = polar(startDeg + ARC_DEG, R);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const PillarArc = memo(function PillarArc({
  index,
  color,
  ring,
}: {
  index: number;
  color: string;
  ring: SharedValue<number>;
}) {
  const d = useMemo(() => arcPath(-90 + GAP_DEG / 2 + index * (ARC_DEG + GAP_DEG)), [index]);
  const props = useAnimatedProps(() => {
    const local = Math.max(0, Math.min(1, ring.value * PILLARS.length - index));
    return { strokeDashoffset: ARC_LEN * (1 - local) };
  });
  return (
    <AnimatedPath
      d={d}
      stroke={color}
      strokeWidth={12}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={`${ARC_LEN} ${ARC_LEN}`}
      animatedProps={props}
    />
  );
});

export const PerfectDayTakeover = memo(function PerfectDayTakeover({
  questCount,
  onDismiss,
}: {
  questCount: number;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  useTheme();
  const reduceMotion = useReducedMotion();
  const fade = useSharedValue(reduceMotion ? 1 : 0);
  const ring = useSharedValue(reduceMotion ? 1 : 0);
  const check = useSharedValue(reduceMotion ? 1 : 0);
  const halo = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      t('celebrations.perfectDayAllQuests', { questCount }),
    );
    if (reduceMotion) return;
    fade.value = withTiming(1, { duration: 280 });
    ring.value = withDelay(250, withTiming(1, { duration: RING_MS, easing: Easing.inOut(Easing.quad) }));
    check.value = withDelay(
      250 + RING_MS,
      withTiming(1, { duration: CHECK_MS, easing: Easing.out(Easing.cubic) }),
    );
    halo.value = withDelay(
      250 + RING_MS + 150,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.back(1.4)) }),
    );
  }, [fade, ring, check, halo, questCount, reduceMotion]);

  const colorsNow = getColors();
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LEN * (1 - check.value),
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 0.3, 1], [0, 1, 0.75]),
    transform: [
      { scale: interpolate(halo.value, [0, 1], [0.7, 1.08]) },
      { rotate: `${interpolate(halo.value, [0, 1], [-20, 0])}deg` },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0.6, 1], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(ring.value, [0.6, 1], [14, 0], 'clamp') }],
  }));

  const rays = useMemo(
    () =>
      Array.from({ length: RAYS }, (_, i) => {
        const deg = (360 / RAYS) * i;
        const a = polar(deg, R + 16);
        const b = polar(deg, R + (i % 2 === 0 ? 34 : 26));
        return { a, b, color: i % 2 === 0 ? colorsNow.gold : colorsNow.accent };
      }),
    [colorsNow.gold, colorsNow.accent],
  );

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, backdropStyle]} accessibilityViewIsModal>
        <View style={styles.art}>
          <Animated.View style={[StyleSheet.absoluteFill, haloStyle]}>
            <Svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`}>
              <G>
                {rays.map((r, i) => (
                  <Line
                    key={i}
                    x1={r.a.x}
                    y1={r.a.y}
                    x2={r.b.x}
                    y2={r.b.y}
                    stroke={r.color}
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                ))}
              </G>
            </Svg>
          </Animated.View>
          <Svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`}>
            {PILLARS.map((p, i) => (
              <PillarArc key={p} index={i} color={colorsNow.pillar[p]} ring={ring} />
            ))}
            <AnimatedPath
              d={CHECK}
              stroke={colorsNow.ink}
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`}
              animatedProps={checkProps}
            />
          </Svg>
        </View>
        <Animated.View style={textStyle}>
          <Txt variant="label" color={colors.accent} align="center">
            {t('celebrations.perfectDay')}
          </Txt>
          <Txt variant="title" align="center" style={styles.title}>
            {t('celebrations.everyQuestDone')}
          </Txt>
          <Txt variant="body" color={colors.inkSoft} align="center" style={styles.body}>
            {t('celebrations.allQuestsAcrossYour', { questCount })}
          </Txt>
        </Animated.View>
        <View style={styles.actions}>
          <Button title={t('celebrations.beautiful')} onPress={onDismiss} />
        </View>
      </Animated.View>
    </Modal>
  );
});

const styles = themed(() =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      backgroundColor: withAlpha(colors.paper, 0.96),
    },
    art: {
      width: BOX,
      height: BOX,
    },
    title: {
      marginTop: spacing.xs,
    },
    body: {
      marginTop: spacing.sm,
      maxWidth: 320,
    },
    actions: {
      marginTop: spacing.xl,
      alignSelf: 'center',
      width: '100%',
      maxWidth: 320,
    },
  }),
);

export default PerfectDayTakeover;
