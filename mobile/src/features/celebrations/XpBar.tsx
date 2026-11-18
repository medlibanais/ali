// Slim XP bar at the top of Today: level, title, progress to the next level.
// XP particles fly into it, and it glows when they land. The fill animates
// on the UI thread; a level-up runs it to the end and restarts from zero.

import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Txt from '../../components/Txt';
import { cumulativeXpForLevel, levelProgress, MAX_LEVEL, titleForLevel, xpForLevel } from '../../lib/levels';
import { useAppSelector } from '../../store/hooks';
import { colors, fonts, radius, spacing, themed, withAlpha } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { registerXpBar } from './anchors';

export const XpBar = memo(function XpBar() {
  const { t } = useTranslation();
  useTheme();
  const totalXp = useAppSelector((state) => state.gamification.totalXp);
  const level = useAppSelector((state) => state.gamification.level);
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<View>(null);

  const progress = levelProgress(totalXp);
  const fill = useSharedValue(progress);
  const glow = useSharedValue(0);
  const shownLevel = useRef(level);

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);
    if (reduceMotion) {
      fill.value = progress;
    } else if (level > shownLevel.current) {
      fill.value = withSequence(
        withTiming(1, { duration: 450, easing }),
        withTiming(0, { duration: 0 }),
        withTiming(progress, { duration: 650, easing }),
      );
    } else {
      fill.value = withTiming(progress, { duration: 650, easing });
    }
    shownLevel.current = level;
  }, [progress, level, reduceMotion, fill]);

  const onArrive = useCallback(() => {
    glow.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 520, easing: Easing.out(Easing.quad) }),
    );
  }, [glow]);

  useEffect(
    () =>
      registerXpBar(
        (done) => {
          const node = trackRef.current;
          if (!node) {
            done(null);
            return;
          }
          node.measureInWindow((x, y, width, height) => done({ x, y, width, height }));
        },
        onArrive,
      ),
    [onArrive],
  );

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, fill.value)) * 100}%`,
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scaleY: 1 + glow.value * 0.6 }],
  }));

  const atMax = level >= MAX_LEVEL;
  const into = atMax ? 0 : Math.max(0, totalXp - cumulativeXpForLevel(level));
  const span = atMax ? 0 : xpForLevel(level + 1);
  const title = titleForLevel(level);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('celebrations.level4', { level, title })}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <View style={styles.labels}>
        <Txt variant="caption" color={colors.ink} numberOfLines={1} style={styles.level}>
          {`Lv ${level} · ${title}`}
        </Txt>
        <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
          {atMax ? t('celebrations.maxLevel') : `${into.toLocaleString()} / ${span.toLocaleString()} XP`}
        </Txt>
      </View>
      <View ref={trackRef} style={styles.track} collapsable={false}>
        <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </View>
  );
});

const styles = themed(() =>
  StyleSheet.create({
    wrap: {
      marginTop: spacing.md,
    },
    labels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs + 2,
    },
    level: {
      fontFamily: fonts.bodySemi,
      flexShrink: 1,
      marginEnd: spacing.sm,
    },
    track: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.paperAlt,
    },
    fill: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.gold,
    },
    glow: {
      ...StyleSheet.absoluteFillObject,
      top: -3,
      bottom: -3,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(colors.gold, 0.35),
    },
  }),
);

export default XpBar;
