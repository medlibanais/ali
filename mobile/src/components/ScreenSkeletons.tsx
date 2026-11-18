// Loading layouts that mirror the real screens, so when the data lands the
// content fills the same shapes instead of jumping around:
//   - TodaySkeleton: greeting, the avatar with five pillar orbs on the
//     orbit ellipse, then quest rows.
//   - InsightsSkeleton: headline card, pillar bars, a bar chart and a
//     line-chart card.
//   - ChatSkeleton: coach and user bubbles, alternating sides.
// Each layout shares one shimmer sweep (SkeletonGroup).

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { radius, spacing, themed, colors } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Skeleton, { SkeletonCircle, SkeletonGroup, SkeletonText } from './Skeleton';

// Same geometry as PillarOrbit (390pt Figma frame, scaled to the screen).
const DESIGN_WIDTH = 390;
const MAX_WIDTH = 460;
const RX = 148;
const RY = 165;
const ORB = 84;
const AVATAR = 172;
const LABEL_ROOM = 26;
const ORBIT_ANGLES = [-90, -18, 54, 126, 198];

function OrbitSkeleton() {
  const { width } = useWindowDimensions();
  const k = Math.min(MAX_WIDTH, width) / DESIGN_WIDTH;
  const rx = RX * k;
  const ry = RY * k;
  const orb = Math.round(ORB * k);
  const avatar = Math.round(AVATAR * k);
  const boxW = Math.round(2 * rx + orb);
  const boxH = Math.round(2 * ry + orb);
  const cx = boxW / 2;
  const cy = boxH / 2;
  return (
    <View style={styles.orbitOuter}>
      <View style={{ width: boxW, height: boxH + LABEL_ROOM }}>
        <SkeletonCircle
          size={avatar}
          style={{ position: 'absolute', left: cx - avatar / 2, top: cy - avatar / 2 }}
        />
        {ORBIT_ANGLES.map((deg) => {
          const a = (deg * Math.PI) / 180;
          return (
            <SkeletonCircle
              key={deg}
              size={orb}
              style={{
                position: 'absolute',
                left: cx + Math.cos(a) * rx - orb / 2,
                top: cy + Math.sin(a) * ry - orb / 2,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function QuestRowSkeleton() {
  return (
    <View style={styles.questRow}>
      <SkeletonCircle size={26} />
      <View style={styles.questText}>
        <Skeleton height={14} width="70%" />
        <Skeleton height={10} width="40%" style={styles.questMeta} />
      </View>
      <Skeleton height={22} width={52} borderRadius={radius.pill} />
    </View>
  );
}

export function TodaySkeleton() {
  const { t } = useTranslation();
  useTheme();
  return (
    <SkeletonGroup style={styles.wrap} accessibilityLabel={t('skeletons.loadingYourDay')}>
      <Skeleton width={120} height={12} style={styles.headerLine} />
      <Skeleton width={230} height={26} style={styles.headerTitle} />
      <Skeleton width={200} height={14} style={styles.center} />
      <OrbitSkeleton />
      <Skeleton width={220} height={12} style={styles.center} />
      <View style={styles.list}>
        <QuestRowSkeleton />
        <QuestRowSkeleton />
        <QuestRowSkeleton />
      </View>
    </SkeletonGroup>
  );
}

const BAR_HEIGHTS = [0.45, 0.7, 0.55, 0.9, 0.35, 0.8, 0.6];

export function InsightsSkeleton() {
  const { t } = useTranslation();
  useTheme();
  return (
    <SkeletonGroup accessibilityLabel={t('skeletons.loadingYourInsights')}>
      {/* Headline: big number and a sentence */}
      <View style={styles.card}>
        <Skeleton height={34} width={110} />
        <SkeletonText lines={2} style={styles.cardBody} />
      </View>
      {/* Pillars: five labeled bars */}
      <View style={styles.card}>
        <Skeleton height={16} width={90} style={styles.cardTitle} />
        {[0.8, 0.55, 0.7, 0.4, 0.65].map((fill, i) => (
          <View key={i} style={styles.pillarRow}>
            <SkeletonCircle size={22} />
            <Skeleton height={10} width={`${Math.round(fill * 100)}%`} style={styles.pillarBar} />
          </View>
        ))}
      </View>
      {/* Bar chart */}
      <View style={styles.card}>
        <Skeleton height={16} width={130} style={styles.cardTitle} />
        <View style={styles.bars}>
          {BAR_HEIGHTS.map((h, i) => (
            <Skeleton key={i} height={Math.round(120 * h)} width={22} borderRadius={6} />
          ))}
        </View>
        <Skeleton height={1} style={styles.axis} />
      </View>
      {/* Line chart card (collapsed accordion height) */}
      <View style={styles.card}>
        <Skeleton height={16} width={170} />
        <Skeleton height={10} width={140} style={styles.cardBody} />
      </View>
    </SkeletonGroup>
  );
}

export function ChatSkeleton() {
  const { t } = useTranslation();
  useTheme();
  return (
    <SkeletonGroup style={styles.chat} accessibilityLabel={t('skeletons.loadingYourConversation')}>
      <View style={styles.coachRow}>
        <SkeletonCircle size={32} />
        <Skeleton height={64} width="70%" borderRadius={radius.lg} style={styles.bubbleLeft} />
      </View>
      <Skeleton height={40} width="55%" borderRadius={radius.lg} style={styles.bubbleRight} />
      <View style={styles.coachRow}>
        <SkeletonCircle size={32} />
        <Skeleton height={84} width="76%" borderRadius={radius.lg} style={styles.bubbleLeft} />
      </View>
      <Skeleton height={40} width="40%" borderRadius={radius.lg} style={styles.bubbleRight} />
      <View style={styles.coachRow}>
        <SkeletonCircle size={32} />
        <Skeleton height={52} width="62%" borderRadius={radius.lg} style={styles.bubbleLeft} />
      </View>
    </SkeletonGroup>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { paddingTop: spacing.lg },
    headerLine: { marginBottom: spacing.xs },
    headerTitle: { marginBottom: spacing.lg },
    center: { alignSelf: 'center', marginBottom: spacing.md },
    orbitOuter: { width: '100%', alignItems: 'center', marginVertical: spacing.md },
    list: { marginTop: spacing.sm },
    questRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
    },
    questText: { flex: 1, marginHorizontal: spacing.md },
    questMeta: { marginTop: spacing.xs },
    card: {
      padding: spacing.lg,
      marginTop: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
    },
    cardTitle: { marginBottom: spacing.md },
    cardBody: { marginTop: spacing.md },
    pillarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    pillarBar: { marginStart: spacing.md, flexShrink: 1 },
    bars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 120,
    },
    axis: { marginTop: spacing.xs },
    chat: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    coachRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.md },
    bubbleLeft: { marginStart: spacing.sm, borderBottomStartRadius: 6 },
    bubbleRight: { alignSelf: 'flex-end', marginBottom: spacing.md, borderBottomEndRadius: 6 },
  }),
);
