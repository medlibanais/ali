// Weekly XP leaderboard with live reordering.
//
// Rows have a fixed height and sit at top = index * ROW_HEIGHT inside a
// container of known height. When a friend's XP changes and the order
// moves, each row glides to its new slot with Reanimated (a subtle slide
// up for whoever climbs), and the XP number briefly lights up. This works
// the same on Android and web (no layout-animation APIs needed).

import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import ProfileAvatar from '../../components/ProfileAvatar';
import Txt from '../../components/Txt';
import { streakLabel } from '../../lib/format';
import { borderWidth, colors, radius, spacing, themed, withAlpha } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { cheerCooldownLeft, displayName, type RankedRow } from './logic';

export const ROW_HEIGHT = 72;
const MOVE_MS = 420;

export interface FriendsLeaderboardProps {
  rows: RankedRow[];
  /** Row id that just gained XP, for a short highlight. */
  pulseId: string | null;
  /** Bumps on every XP event so the same id can pulse twice. */
  pulseTick: number;
  onCheer: (row: RankedRow) => void;
  cheeringId: string | null;
  /** Current time in ms; passed in so cooldowns re-render on a timer. */
  now: number;
}

export function FriendsLeaderboard({
  rows,
  pulseId,
  pulseTick,
  onCheer,
  cheeringId,
  now,
}: FriendsLeaderboardProps) {
  useTheme();
  return (
    <View
      style={[styles.list, { height: rows.length * ROW_HEIGHT }]}
      accessibilityRole="list"
      accessibilityLabel="This week's leaderboard"
    >
      {rows.map((row, index) => (
        <LeaderboardRow
          key={row.id}
          row={row}
          index={index}
          pulse={pulseId === row.id ? pulseTick : 0}
          onCheer={onCheer}
          cheering={cheeringId === row.id}
          cooling={cheerCooldownLeft(row.last_cheered_at, now) > 0}
        />
      ))}
    </View>
  );
}

interface RowProps {
  row: RankedRow;
  index: number;
  pulse: number;
  onCheer: (row: RankedRow) => void;
  cheering: boolean;
  cooling: boolean;
}

function LeaderboardRow({ row, index, pulse, onCheer, cheering, cooling }: RowProps) {
  const top = useSharedValue(index * ROW_HEIGHT);
  const glow = useSharedValue(0);
  // The first render places the row; later index changes glide.
  const lastIndex = useRef(index);

  useEffect(() => {
    if (lastIndex.current === index) return;
    lastIndex.current = index;
    top.value = withTiming(index * ROW_HEIGHT, {
      duration: MOVE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [index, top]);

  useEffect(() => {
    if (pulse === 0) return;
    glow.value = withSequence(
      withTiming(1, { duration: 160 }),
      withTiming(0, { duration: 900, easing: Easing.out(Easing.quad) }),
    );
  }, [pulse, glow]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: top.value }],
  }));
  const xpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + glow.value * 0.12 }],
    opacity: 0.85 + glow.value * 0.15,
  }));

  const name = row.is_me ? 'You' : displayName(row);
  const xp = row.weekly_xp ?? 0;
  const cheerDisabled = cheering || cooling;

  return (
    <Animated.View
      style={[styles.row, row.is_me && styles.meRow, index > 0 && styles.rowDivider, rowStyle]}
      accessible
      accessibilityLabel={`Rank ${row.rank}, ${name}, ${xp} XP this week`}
    >
      <Txt variant="bodySemi" color={colors.gold} style={styles.rank}>
        {`${row.rank}`}
      </Txt>
      <ProfileAvatar
        profile={{
          photo_url: row.photo_url,
          avatar_mode: row.avatar_mode,
          avatar_config: row.avatar_config,
          first_name: row.first_name,
        }}
        size={44}
        animated={false}
      />
      <View style={styles.body}>
        <Txt variant="bodySemi" numberOfLines={1}>
          {name}
        </Txt>
        <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
          {`Level ${row.level ?? 1} · ${streakLabel(row.current_streak ?? 0)}`}
        </Txt>
      </View>
      <Animated.View style={xpStyle}>
        <Txt variant="bodySemi" color={colors.accent}>
          {`${xp} XP`}
        </Txt>
      </Animated.View>
      {row.is_me ? (
        <View style={styles.cheerSpacer} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cooling ? `You cheered ${name} recently` : `Cheer on ${name}`}
          accessibilityState={{ disabled: cheerDisabled, busy: cheering }}
          disabled={cheerDisabled}
          onPress={() => onCheer(row)}
          hitSlop={4}
          style={({ pressed }) => [
            styles.cheer,
            cooling && styles.cheerDone,
            pressed && styles.cheerPressed,
          ]}
        >
          <Txt variant="caption" color={cooling ? colors.inkFaint : colors.accent}>
            {cooling ? 'Cheered' : 'Cheer'}
          </Txt>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    list: {
      position: 'relative',
      overflow: 'hidden',
    },
    row: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.card,
    },
    rowDivider: {
      borderTopWidth: borderWidth.hairline,
      borderTopColor: colors.line,
    },
    meRow: {
      backgroundColor: colors.paperAlt,
    },
    rank: {
      width: 24,
    },
    body: {
      flex: 1,
      minWidth: 0,
      marginLeft: spacing.md,
      marginRight: spacing.sm,
    },
    cheer: {
      minWidth: 72,
      minHeight: 44,
      marginLeft: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
      borderWidth: borderWidth.hairline,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cheerDone: {
      borderColor: colors.line,
    },
    cheerPressed: {
      backgroundColor: withAlpha(colors.accent, 0.15),
    },
    cheerSpacer: {
      width: 72,
      marginLeft: spacing.md,
    },
  }),
);

export default FriendsLeaderboard;
