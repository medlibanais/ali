// StoryCard: a 9:16 progress card sized for Instagram / WhatsApp / Snapchat
// stories. Every size is derived from `width` so the same layout renders as
// an on-screen preview and as the 1080x1920 image that gets shared.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ProfileAvatar, { type ProfileAvatarProps } from '../../components/ProfileAvatar';
import { PillarGlyph } from '../../components/icons';
import {
  colors,
  fonts,
  PILLAR_LABELS,
  PILLARS,
  Pillar,
  withAlpha,
} from '../../theme/tokens';

export const STORY_ASPECT = 16 / 9;

export interface StoryCardData {
  profile: ProfileAvatarProps['profile'];
  firstName: string | null;
  score: number;
  pillars: Partial<Record<Pillar, number>>;
  streak: number;
  level: number;
  levelTitle: string;
  weekAvg: number | null;
}

export function StoryCard({ data, width }: { data: StoryCardData; width: number }) {
  const u = width / 360; // design unit: layout is drawn on a 360x640 grid
  const height = width * STORY_ASPECT;
  const name = data.firstName?.trim() || 'Me';
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View
      collapsable={false}
      style={[styles.root, { width, height, padding: 24 * u, backgroundColor: colors.accent }]}
    >
      <View style={styles.header}>
        <Text style={[styles.brand, { fontSize: 16 * u, color: colors.onAccent }]}>GROW</Text>
        <Text style={[styles.date, { fontSize: 12 * u, color: withAlpha(colors.onAccent, 0.75) }]}>
          {today}
        </Text>
      </View>

      <View style={[styles.hero, { marginTop: 18 * u }]}>
        <View
          style={{
            width: 168 * u,
            height: 168 * u,
            borderRadius: 84 * u,
            backgroundColor: withAlpha(colors.onAccent, 0.12),
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <ProfileAvatar profile={data.profile} size={150 * u} animated={false} mood="happy" />
        </View>
        <Text
          style={[styles.name, { fontSize: 26 * u, lineHeight: 32 * u, marginTop: 12 * u, color: colors.onAccent }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[styles.subtle, { fontSize: 13 * u, color: withAlpha(colors.onAccent, 0.8) }]}>
          {`Level ${data.level} · ${data.levelTitle}`}
        </Text>
      </View>

      <View style={[styles.scoreBlock, { marginTop: 16 * u }]}>
        <Text style={[styles.score, { fontSize: 72 * u, lineHeight: 80 * u, color: colors.onAccent }]}>
          {`${data.score}`}
        </Text>
        <Text style={[styles.subtle, { fontSize: 13 * u, color: withAlpha(colors.onAccent, 0.8) }]}>
          Daily Life Score today
        </Text>
      </View>

      <View
        style={{
          marginTop: 18 * u,
          padding: 16 * u,
          borderRadius: 14 * u,
          backgroundColor: colors.card,
        }}
      >
        {PILLARS.map((p) => {
          const v = Math.max(0, Math.min(100, Math.round(data.pillars[p] ?? 0)));
          return (
            <View key={p} style={[styles.pillarRow, { marginBottom: p === 'spirituality' ? 0 : 10 * u }]}>
              <PillarGlyph pillar={p} size={16 * u} />
              <Text
                style={[styles.pillarLabel, { fontSize: 13 * u, width: 92 * u, marginLeft: 8 * u, color: colors.ink }]}
              >
                {PILLAR_LABELS[p]}
              </Text>
              <View
                style={{
                  flex: 1,
                  height: 8 * u,
                  borderRadius: 4 * u,
                  backgroundColor: colors.paperAlt,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${v}%`,
                    height: 8 * u,
                    borderRadius: 4 * u,
                    backgroundColor: colors.pillar[p],
                  }}
                />
              </View>
              <Text style={[styles.pillarValue, { fontSize: 13 * u, width: 34 * u, color: colors.inkSoft }]}>
                {`${v}`}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.statsRow, { marginTop: 16 * u }]}>
        <Stat u={u} value={`${data.streak}`} label="day streak" />
        <View style={{ width: 1, height: 34 * u, backgroundColor: withAlpha(colors.onAccent, 0.3) }} />
        <Stat u={u} value={data.weekAvg === null ? '–' : `${data.weekAvg}`} label="avg this week" />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.subtle, { fontSize: 12 * u, color: withAlpha(colors.onAccent, 0.75) }]}>
          Building my future self, one day at a time.
        </Text>
      </View>
    </View>
  );
}

function Stat({ u, value, label }: { u: number; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { fontSize: 30 * u, lineHeight: 36 * u, color: colors.onAccent }]}>
        {value}
      </Text>
      <Text style={[styles.subtle, { fontSize: 12 * u, color: withAlpha(colors.onAccent, 0.8) }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontFamily: fonts.display,
    letterSpacing: 3,
  },
  date: {
    fontFamily: fonts.body,
  },
  hero: {
    alignItems: 'center',
  },
  name: {
    fontFamily: fonts.display,
  },
  subtle: {
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  scoreBlock: {
    alignItems: 'center',
  },
  score: {
    fontFamily: fonts.display,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillarLabel: {
    fontFamily: fonts.bodySemi,
  },
  pillarValue: {
    fontFamily: fonts.bodySemi,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.display,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});

export default StoryCard;
