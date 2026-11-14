// StoryCard: a 9:16 progress card sized for Instagram / WhatsApp / Snapchat
// stories. Every size is derived from `width` so the same layout renders as
// an on-screen preview and as the 1080x1920 image that gets shared.
//
// The card always uses the Neon palette, whatever theme the app is set to:
// it is GROW's public face, so every shared story looks like the brand.
// Layout, top to bottom: brand bar, the avatar inside a five-pillar ring
// (each arc fills with that pillar's score), the life score as the hero
// number, a row of pillar tiles, two stat tiles, and a sign-off line.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import ProfileAvatar, { type ProfileAvatarProps } from '../../components/ProfileAvatar';
import { FlameGlyph, PillarGlyph, SparklesGlyph } from '../../components/icons';
import { fonts, PILLAR_LABELS, PILLARS, Pillar, withAlpha } from '../../theme/tokens';
import { THEMES } from '../../theme/themes';

export const STORY_ASPECT = 16 / 9;

const C = THEMES.neon.colors;

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

/** SVG arc from angle a0 to a1 (degrees, 0 = 3 o'clock) on a circle. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function clamp(v: number | undefined): number {
  return Math.max(0, Math.min(100, Math.round(v ?? 0)));
}

export function StoryCard({ data, width }: { data: StoryCardData; width: number }) {
  const u = width / 360; // design unit: layout is drawn on a 360x640 grid
  const height = width * STORY_ASPECT;
  const name = data.firstName?.trim() || 'Me';
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Pillar ring around the avatar: five 72° arcs with small gaps.
  const ring = 196 * u;
  const rc = ring / 2;
  const rr = rc - 8 * u;
  const stroke = 7 * u;
  const gap = 7;

  return (
    <View
      collapsable={false}
      style={[styles.root, { width, height, padding: 22 * u, backgroundColor: C.paper }]}
    >
      {/* Ambient glow: mint up top, ultraviolet low left, pink low right. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="storyGlowA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={C.accent} stopOpacity={0.32} />
            <Stop offset="1" stopColor={C.accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="storyGlowB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={C.pillar.work} stopOpacity={0.28} />
            <Stop offset="1" stopColor={C.pillar.work} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="storyGlowC" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={C.pillar.health} stopOpacity={0.24} />
            <Stop offset="1" stopColor={C.pillar.health} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={width * 0.5} cy={170 * u} r={230 * u} fill="url(#storyGlowA)" />
        <Circle cx={0} cy={height * 0.78} r={220 * u} fill="url(#storyGlowB)" />
        <Circle cx={width} cy={height * 0.95} r={200 * u} fill="url(#storyGlowC)" />
      </Svg>

      {/* Brand bar */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View
            style={{
              width: 24 * u,
              height: 24 * u,
              borderRadius: 7 * u,
              backgroundColor: C.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SparklesGlyph size={13 * u} color={C.onAccent} />
          </View>
          <Text style={[styles.mono, { fontSize: 11 * u, letterSpacing: 3 * u, marginLeft: 8 * u, color: C.ink }]}>
            GROW
          </Text>
        </View>
        <Text style={[styles.mono, { fontSize: 9.5 * u, letterSpacing: 1.2 * u, color: C.inkSoft }]}>
          {today.toUpperCase()}
        </Text>
      </View>

      {/* Avatar inside the pillar ring */}
      <View style={[styles.center, { marginTop: 16 * u }]}>
        <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={ring} height={ring} style={StyleSheet.absoluteFill}>
            {PILLARS.map((p, i) => {
              const a0 = -90 + i * 72 + gap / 2;
              const a1 = a0 + 72 - gap;
              const v = clamp(data.pillars[p]);
              return (
                <React.Fragment key={p}>
                  <Path
                    d={arc(rc, rc, rr, a0, a1)}
                    stroke={withAlpha(C.pillar[p], 0.2)}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    fill="none"
                  />
                  {v > 0 ? (
                    <Path
                      d={arc(rc, rc, rr, a0, a0 + Math.max(2, ((a1 - a0) * v) / 100))}
                      stroke={C.pillar[p]}
                      strokeWidth={stroke}
                      strokeLinecap="round"
                      fill="none"
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
          <View
            style={{
              width: 154 * u,
              height: 154 * u,
              borderRadius: 77 * u,
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.outline,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <ProfileAvatar profile={data.profile} size={148 * u} animated={false} mood="happy" />
          </View>
          {/* Level badge sits on the ring like a medal. */}
          <View
            style={{
              position: 'absolute',
              bottom: 2 * u,
              paddingHorizontal: 10 * u,
              paddingVertical: 4 * u,
              borderRadius: 999,
              backgroundColor: C.accent,
            }}
          >
            <Text style={[styles.mono, { fontSize: 9.5 * u, letterSpacing: 1 * u, color: C.onAccent }]}>
              {`LV ${data.level}`}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.display, { fontSize: 22 * u, lineHeight: 28 * u, marginTop: 10 * u, color: C.ink }]}
          numberOfLines={1}
        >
          {name.toUpperCase()}
        </Text>
        <Text style={[styles.body, { fontSize: 12 * u, color: C.inkSoft }]}>
          {`${data.levelTitle} · Level ${data.level}`}
        </Text>
      </View>

      {/* Hero number */}
      <View style={[styles.center, { marginTop: 10 * u }]}>
        <Text style={[styles.mono, { fontSize: 9.5 * u, letterSpacing: 2 * u, color: C.accent }]}>
          LIFE SCORE TODAY
        </Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.display, { fontSize: 76 * u, lineHeight: 82 * u, color: C.ink }]}>
            {`${clamp(data.score)}`}
          </Text>
          <Text style={[styles.display, { fontSize: 20 * u, lineHeight: 26 * u, marginLeft: 4 * u, marginBottom: 14 * u, color: C.inkFaint }]}>
            /100
          </Text>
        </View>
      </View>

      {/* Pillar tiles */}
      <View style={[styles.tiles, { marginTop: 8 * u, gap: 6 * u }]}>
        {PILLARS.map((p) => (
          <View
            key={p}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 9 * u,
              borderRadius: 12 * u,
              backgroundColor: withAlpha(C.card, 0.75),
              borderWidth: 1,
              borderColor: withAlpha(C.pillar[p], 0.35),
            }}
          >
            <PillarGlyph pillar={p} size={15 * u} color={C.pillar[p]} />
            <Text style={[styles.statNum, { fontSize: 15 * u, lineHeight: 19 * u, marginTop: 4 * u, color: C.ink }]}>
              {`${clamp(data.pillars[p])}`}
            </Text>
            <Text
              style={[styles.body, { fontSize: 7.5 * u, lineHeight: 10 * u, color: C.inkSoft }]}
              numberOfLines={1}
            >
              {PILLAR_LABELS[p]}
            </Text>
          </View>
        ))}
      </View>

      {/* Stats */}
      <View style={[styles.tiles, { marginTop: 8 * u, gap: 6 * u }]}>
        <StatTile
          u={u}
          icon={<FlameGlyph size={16 * u} color={C.gold} />}
          value={`${data.streak}`}
          label="day streak"
        />
        <StatTile
          u={u}
          icon={<SparklesGlyph size={15 * u} color={C.accent} />}
          value={data.weekAvg === null ? '–' : `${data.weekAvg}`}
          label="avg this week"
        />
      </View>

      {/* Sign-off */}
      <View style={styles.footer}>
        <Text style={[styles.display, { fontSize: 17 * u, lineHeight: 22 * u, color: C.ink }]}>
          WHO ARE YOU BECOMING?
        </Text>
        <Text style={[styles.mono, { fontSize: 8.5 * u, letterSpacing: 1.6 * u, marginTop: 4 * u, color: C.inkSoft }]}>
          BUILT DAY BY DAY WITH GROW
        </Text>
      </View>
    </View>
  );
}

function StatTile({
  u,
  icon,
  value,
  label,
}: {
  u: number;
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10 * u,
        paddingHorizontal: 12 * u,
        borderRadius: 12 * u,
        backgroundColor: withAlpha(C.card, 0.75),
        borderWidth: 1,
        borderColor: C.outline,
      }}
    >
      {icon}
      <Text style={[styles.statNum, { fontSize: 20 * u, lineHeight: 24 * u, marginLeft: 8 * u, color: C.ink }]}>
        {value}
      </Text>
      <Text style={[styles.body, { fontSize: 10 * u, marginLeft: 6 * u, color: C.inkSoft, flexShrink: 1 }]} numberOfLines={1}>
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tiles: {
    flexDirection: 'row',
  },
  display: {
    fontFamily: fonts.display,
    textAlign: 'center',
  },
  mono: {
    fontFamily: fonts.mono,
  },
  body: {
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  statNum: {
    fontFamily: fonts.bold,
  },
  footer: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});

export default StoryCard;
