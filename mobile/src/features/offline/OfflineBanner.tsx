import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Txt from '../../components/Txt';
import { probeConnectivity } from '../../lib/connectivity';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { syncNoticeCleared } from '../../store/slices/syncSlice';
import { borderWidth, colors, radius, spacing, themed } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { useOfflineSync } from './useOfflineSync';

function quests(n: number): string {
  return `${n} ${n === 1 ? 'quest' : 'quests'}`;
}

export interface BannerContent {
  tone: 'offline' | 'syncing' | 'done' | 'warning';
  title: string;
  detail: string | null;
  action: 'retry' | 'dismiss' | null;
}

/** What the banner says for a sync state, or null when it stays hidden. */
export function bannerContent(s: {
  online: boolean;
  pending: number;
  syncing: boolean;
  justSynced: number;
  rejected: { title: string; reason: string }[];
}): BannerContent | null {
  if (!s.online) {
    return {
      tone: 'offline',
      title: 'Offline',
      detail:
        s.pending > 0
          ? `${quests(s.pending)} saved on this device. They sync when you are back online.`
          : 'Quests you complete are saved on this device.',
      action: 'retry',
    };
  }
  if (s.rejected.length > 0) {
    const first = s.rejected[0];
    const name = first.title ? `"${first.title}"` : 'A quest';
    const more = s.rejected.length > 1 ? ` (+${s.rejected.length - 1} more)` : '';
    return {
      tone: 'warning',
      title: `${quests(s.rejected.length)} could not sync`,
      detail: `${name} was not counted: ${first.reason}.${more}`,
      action: 'dismiss',
    };
  }
  if (s.pending > 0 && s.syncing) {
    return { tone: 'syncing', title: `Syncing ${quests(s.pending)}…`, detail: null, action: null };
  }
  if (s.justSynced > 0) {
    return {
      tone: 'done',
      title: `Back online · ${quests(s.justSynced)} synced`,
      detail: null,
      action: null,
    };
  }
  return null;
}

/** Top-of-screen status for offline mode and background sync. */
export function OfflineBanner() {
  useTheme();
  useOfflineSync();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const sync = useAppSelector((s) => s.sync);
  const content = bannerContent(sync);

  // "Synced" and "could not sync" notices fade on their own.
  useEffect(() => {
    if (!sync.online || (sync.justSynced === 0 && sync.rejected.length === 0)) return undefined;
    const t = setTimeout(
      () => dispatch(syncNoticeCleared()),
      sync.rejected.length > 0 ? 9000 : 3500,
    );
    return () => clearTimeout(t);
  }, [dispatch, sync.online, sync.justSynced, sync.rejected]);

  if (!content) return null;

  const dot =
    content.tone === 'offline'
      ? colors.gold
      : content.tone === 'warning'
        ? colors.danger
        : colors.accent;
  const label = [content.title, content.detail].filter(Boolean).join('. ');

  return (
    <View style={[styles.wrap, { top: insets.top + spacing.xs }]} pointerEvents="box-none">
      <View
        style={styles.banner}
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={label}
      >
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <View style={styles.text}>
          <Txt variant="bodySemi" color={colors.ink}>
            {content.title}
          </Txt>
          {content.detail ? (
            <Txt variant="caption" color={colors.inkSoft}>
              {content.detail}
            </Txt>
          ) : null}
        </View>
        {content.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              content.action === 'retry' ? 'Check connection again' : 'Dismiss sync notice'
            }
            hitSlop={8}
            onPress={() => {
              if (content.action === 'retry') probeConnectivity().catch(() => undefined);
              else dispatch(syncNoticeCleared());
            }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Txt variant="bodySemi" color={colors.accent}>
              {content.action === 'retry' ? 'Retry' : 'OK'}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      zIndex: 50,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      maxWidth: 520,
      width: '100%',
      minHeight: 44,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: spacing.md,
    },
    text: {
      flex: 1,
    },
    action: {
      marginLeft: spacing.md,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
  }),
);

export default OfflineBanner;
