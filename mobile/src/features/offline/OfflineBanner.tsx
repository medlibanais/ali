import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Txt from '../../components/Txt';
import { probeConnectivity } from '../../lib/connectivity';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { syncNoticeDismissed, syncRetryRequested } from '../../store/slices/syncSlice';
import type { SyncMachineView } from '../../store/syncMachine';
import { useToast } from '../../components/Toast';
import { borderWidth, colors, radius, spacing, themed } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { useOfflineSync } from './useOfflineSync';

function actions(n: number): string {
  return `${n} ${n === 1 ? 'action' : 'actions'}`;
}

export interface BannerContent {
  tone: 'offline' | 'syncing' | 'done' | 'warning';
  title: string;
  detail: string | null;
  action: 'recheck' | 'retry' | 'dismiss' | null;
}

/** What the global sync indicator says, or null when it stays hidden. */
export function bannerContent(s: {
  online: boolean;
  pending: number;
  syncing: boolean;
  machine: SyncMachineView;
}): BannerContent | null {
  const m = s.machine;
  if (m.state === 'Error') {
    return m.errorKind === 'conflict'
      ? { tone: 'warning', title: 'Sync conflict', detail: m.errorMessage, action: 'dismiss' }
      : { tone: 'warning', title: 'Sync failed', detail: m.errorMessage, action: 'retry' };
  }
  if (!s.online) {
    return {
      tone: 'offline',
      title: 'You are offline. Quests will sync when you reconnect',
      detail: s.pending > 0 ? `${actions(s.pending)} waiting on this device.` : null,
      action: 'recheck',
    };
  }
  if (m.state === 'Syncing' && s.pending > 0) {
    return { tone: 'syncing', title: `Syncing ${actions(s.pending)}...`, detail: null, action: null };
  }
  if (m.state === 'Synced') {
    return { tone: 'done', title: 'All synced', detail: null, action: null };
  }
  return null;
}

const ACTION_LABEL: Record<NonNullable<BannerContent['action']>, { text: string; a11y: string }> = {
  recheck: { text: 'Retry', a11y: 'Check the connection again' },
  retry: { text: 'Retry', a11y: 'Retry syncing your quests' },
  dismiss: { text: 'OK', a11y: 'Dismiss the sync notice' },
};

/** Top-of-screen indicator for the global sync state. */
export function OfflineBanner() {
  useTheme();
  useOfflineSync();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const sync = useAppSelector((s) => s.sync);
  const live = bannerContent(sync);
  const liveKey = live ? JSON.stringify(live) : '';

  // Slides down when something needs saying, back up when it is over. The
  // last message stays on screen while it slides away.
  const [content, setContent] = useState<BannerContent | null>(live);
  const slide = useRef(new Animated.Value(live ? 1 : 0)).current;
  useEffect(() => {
    if (live) setContent(live);
    const animation = Animated.timing(slide, {
      toValue: live ? 1 : 0,
      duration: 260,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => {
      if (finished && !live) setContent(null);
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  // Conflicts also get a toast, once per message.
  const { errorKind, errorMessage } = sync.machine;
  useEffect(() => {
    if (errorKind === 'conflict' && errorMessage) showToast({ message: errorMessage, durationMs: 6000 });
  }, [errorKind, errorMessage, showToast]);

  if (!content) return null;

  const dot =
    content.tone === 'offline'
      ? colors.gold
      : content.tone === 'warning'
        ? colors.danger
        : colors.accent;
  const label = [content.title, content.detail].filter(Boolean).join('. ');
  const action = content.action;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          top: insets.top + spacing.xs,
          opacity: slide,
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) },
          ],
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={styles.banner}
        accessible={action === null}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={label}
      >
        {content.tone === 'syncing' ? (
          <ActivityIndicator
            size="small"
            color={colors.accent}
            style={styles.spinner}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : (
          <View style={[styles.dot, { backgroundColor: dot }]} />
        )}
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
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ACTION_LABEL[action].a11y}
            hitSlop={8}
            onPress={() => {
              if (action === 'recheck') probeConnectivity().catch(() => undefined);
              else if (action === 'retry') dispatch(syncRetryRequested());
              else dispatch(syncNoticeDismissed());
            }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Txt variant="bodySemi" color={colors.accent}>
              {ACTION_LABEL[action].text}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
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
    spinner: {
      marginRight: spacing.md,
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
