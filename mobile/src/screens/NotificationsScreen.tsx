import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { BellGlyph } from '../components/icons';
import {
  type AppNotification,
  useClearAll,
  useMarkRead,
  useNotifications,
} from '../features/notifications/api';
import { colors, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function Row({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const unread = item.read_at === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.mark, unread && styles.markUnread]}>
        <BellGlyph size={18} color={unread ? colors.onAccent : colors.inkFaint} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Txt
            variant="bodySemi"
            color={unread ? colors.ink : colors.inkSoft}
            style={styles.rowTitle}
          >
            {item.title}
          </Txt>
          <Txt variant="caption" color={colors.inkFaint}>
            {timeAgo(item.created_at)}
          </Txt>
        </View>
        {item.body ? (
          <Txt variant="caption" color={colors.inkSoft} style={styles.rowDetail}>
            {item.body}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

export function NotificationsScreen() {
  useTheme();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const clearAll = useClearAll();
  const items = data ?? [];

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        Notifications
      </Txt>

      {isLoading ? (
        <View>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} style={styles.skeletonBlock} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title="All quiet"
          body="Nudges from your Future Self, badges and friend news show up here."
        />
      ) : (
        <>
          <Card padded={false}>
            {items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Hairline /> : null}
                <Row
                  item={item}
                  onPress={() => {
                    if (item.read_at === null) markRead.mutate(item.id);
                  }}
                />
              </View>
            ))}
          </Card>
          <Button
            title="Clear all"
            variant="ghost"
            loading={clearAll.isPending}
            onPress={() => clearAll.mutate()}
            style={styles.clear}
          />
        </>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  title: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperAlt,
  },
  markUnread: {
    backgroundColor: colors.accent,
  },
  rowBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  rowTitle: {
    flex: 1,
    marginRight: spacing.sm,
  },
  rowDetail: {
    marginTop: spacing.xs,
  },
  clear: {
    marginTop: spacing.lg,
  },
  skeletonBlock: {
    marginBottom: spacing.md,
  },
  }),
);

export default NotificationsScreen;
