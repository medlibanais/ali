import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import Card from '../components/Card';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { MinusGlyph, PlusGlyph } from '../components/icons';
import { supabase } from '../lib/supabase';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface Prefs {
  push_enabled: boolean;
  friend_requests: boolean;
  quest_reminders: boolean;
  streak_risk: boolean;
  coach_messages: boolean;
  weekly_report: boolean;
  quiet_start: string;
  quiet_end: string;
  max_per_day: number;
}

const DEFAULT_PREFS: Prefs = {
  push_enabled: true,
  friend_requests: true,
  quest_reminders: true,
  streak_risk: true,
  coach_messages: true,
  weekly_report: true,
  quiet_start: '22:00',
  quiet_end: '08:00',
  max_per_day: 3,
};

const TYPE_ROWS: { key: keyof Prefs; label: string }[] = [
  { key: 'friend_requests', label: 'Friend requests' },
  { key: 'quest_reminders', label: 'Quest reminders' },
  { key: 'streak_risk', label: 'Streak at risk' },
  { key: 'coach_messages', label: 'Coach messages' },
  { key: 'weekly_report', label: 'Weekly report' },
];

function shiftHour(time: string, delta: number): string {
  const hour = parseInt(time.split(':')[0] ?? '8', 10);
  const next = (hour + delta + 24) % 24;
  return `${`${next}`.padStart(2, '0')}:00`;
}

export function NotificationSettingsScreen() {
  useTheme();
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in.');
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (mounted) {
          setPrefs({
            ...DEFAULT_PREFS,
            ...(data ?? {}),
            quiet_start: (data?.quiet_start ?? '22:00:00').slice(0, 5),
            quiet_end: (data?.quiet_end ?? '08:00:00').slice(0, 5),
          });
        }
      } catch (e) {
        if (mounted) {
          setPrefs(DEFAULT_PREFS);
          toast.showToast({
            message:
              e instanceof Error
                ? e.message
                : 'Could not load preferences. Showing defaults.',
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = async (next: Prefs) => {
    setPrefs(next);
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { error } = await supabase
        .from('notification_preferences')
        .update({
          push_enabled: next.push_enabled,
          friend_requests: next.friend_requests,
          quest_reminders: next.quest_reminders,
          streak_risk: next.streak_risk,
          coach_messages: next.coach_messages,
          weekly_report: next.weekly_report,
          quiet_start: next.quiet_start,
          quiet_end: next.quiet_end,
          max_per_day: next.max_per_day,
        })
        .eq('user_id', user.id);
      if (error) throw error;
    } catch (e) {
      toast.showToast({
        message:
          e instanceof Error
            ? e.message
            : 'Could not save preferences. Try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof Prefs, value: boolean) => {
    if (!prefs) return;
    persist({ ...prefs, [key]: value });
  };

  const adjustQuiet = (key: 'quiet_start' | 'quiet_end', delta: number) => {
    if (!prefs) return;
    persist({ ...prefs, [key]: shiftHour(prefs[key], delta) });
  };

  const trackColor = { false: colors.line, true: colors.accent };

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        Notifications
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.subtitle}>
        {`At most ${prefs?.max_per_day ?? 3} messages per day, none during quiet hours.`}
      </Txt>

      {loading || !prefs ? (
        <View>
          <Skeleton height={64} style={styles.skeletonBlock} />
          <Skeleton height={200} style={styles.skeletonBlock} />
          <Skeleton height={160} style={styles.skeletonBlock} />
        </View>
      ) : (
        <>
          <Card padded={false} style={styles.card}>
            <View style={styles.row}>
              <Txt variant="body">Push notifications</Txt>
              <Switch
                value={prefs.push_enabled}
                onValueChange={(v) => toggle('push_enabled', v)}
                trackColor={trackColor}
                thumbColor={colors.card}
                accessibilityLabel="Push notifications"
              />
            </View>
          </Card>

          <Card padded={false} style={styles.card}>
            <View style={styles.sectionHeader}>
              <Txt variant="label">Types</Txt>
            </View>
            <Hairline />
            {TYPE_ROWS.map(({ key, label }, index) => (
              <View key={key}>
                {index > 0 ? <Hairline /> : null}
                <View style={styles.row}>
                  <Txt variant="body">{label}</Txt>
                  <Switch
                    value={Boolean(prefs[key])}
                    onValueChange={(v) => toggle(key, v)}
                    trackColor={trackColor}
                    thumbColor={colors.card}
                    accessibilityLabel={label}
                  />
                </View>
              </View>
            ))}
          </Card>

          <Card padded={false} style={styles.card}>
            <View style={styles.sectionHeader}>
              <Txt variant="label">Quiet hours</Txt>
            </View>
            <Hairline />
            {(
              [
                { key: 'quiet_start' as const, label: 'From' },
                { key: 'quiet_end' as const, label: 'Until' },
              ]
            ).map(({ key, label }, index) => (
              <View key={key}>
                {index > 0 ? <Hairline /> : null}
                <View style={styles.row}>
                  <Txt variant="body">{label}</Txt>
                  <View style={styles.timeAdjuster}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${label} one hour earlier`}
                      onPress={() => adjustQuiet(key, -1)}
                      style={({ pressed }) => [
                        styles.timeButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <MinusGlyph />
                    </Pressable>
                    <Txt variant="bodySemi" style={styles.timeValue}>
                      {prefs[key]}
                    </Txt>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${label} one hour later`}
                      onPress={() => adjustQuiet(key, 1)}
                      style={({ pressed }) => [
                        styles.timeButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <PlusGlyph />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </Card>

          <Txt
            variant="caption"
            color={colors.inkFaint}
            align="center"
            style={styles.saveNote}
          >
            {saving ? 'Saving' : 'Changes save automatically.'}
          </Txt>
        </>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    title: {
      marginTop: spacing.lg,
    },
    subtitle: {
      marginTop: spacing.xs,
      marginBottom: spacing.xl,
    },
    card: {
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      padding: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.lg,
      minHeight: 48,
    },
    timeAdjuster: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeButton: {
      width: 44,
      height: 44,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeValue: {
      minWidth: 64,
      textAlign: 'center',
    },
    pressed: {
      opacity: 0.96,
    },
    saveNote: {
      marginBottom: spacing.xl,
    },
    skeletonBlock: {
      marginBottom: spacing.md,
    },
  }),
);

export default NotificationSettingsScreen;
