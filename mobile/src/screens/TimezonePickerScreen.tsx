import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { FlatList } from 'react-native';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProfile } from '../store/slices/userSlice';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

// Curated IANA zones covering the inhabited world; the auto-detected zone
// is always offered first even when it is outside this list.
const COMMON_TIMEZONES = [
  'UTC',
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg', 'Africa/Lagos',
  'Africa/Nairobi', 'Africa/Tunis',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota',
  'America/Chicago', 'America/Denver', 'America/Halifax', 'America/Lima',
  'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
  'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo', 'America/Toronto',
  'America/Vancouver',
  'Asia/Amman', 'Asia/Baghdad', 'Asia/Bangkok', 'Asia/Beirut', 'Asia/Dhaka',
  'Asia/Dubai', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Jakarta',
  'Asia/Jerusalem', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata',
  'Asia/Kuala_Lumpur', 'Asia/Kuwait', 'Asia/Manila', 'Asia/Riyadh',
  'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei', 'Asia/Tehran',
  'Asia/Tokyo',
  'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin', 'Europe/Brussels',
  'Europe/Dublin', 'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Lisbon',
  'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Oslo',
  'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/Stockholm',
  'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu',
];

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function TimezonePickerScreen() {
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const current = useAppSelector((state) => state.user.profile?.timezone);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const detected = deviceTimezone();
  const zones = useMemo(() => {
    const base = COMMON_TIMEZONES.includes(detected)
      ? COMMON_TIMEZONES
      : [detected, ...COMMON_TIMEZONES];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((z) => z.toLowerCase().includes(q));
  }, [query, detected]);

  const choose = async (zone: string) => {
    if (zone === current) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { error } = await supabase
        .from('profiles')
        .update({ timezone: zone })
        .eq('id', user.id);
      if (error) throw error;
      await dispatch(fetchProfile());
      toast.showToast({ message: `Timezone set to ${zone}.` });
    } catch (e) {
      toast.showToast({
        message: e instanceof Error ? e.message : 'Could not save the timezone.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search timezones"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search timezones"
        />
        <Txt variant="caption" color={colors.inkFaint} style={styles.detected}>
          {`Detected on this device: ${detected}`}
        </Txt>
      </View>
      <FlatList
        data={zones}
        keyExtractor={(z) => z}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = item === current;
          return (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => choose(item)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.pressed,
                ]}
              >
                <Txt variant="body" color={selected ? colors.accent : colors.ink}>
                  {item.replace(/_/g, ' ')}
                </Txt>
                {selected ? (
                  <Txt variant="bodySemi" color={colors.accent}>
                    Current
                  </Txt>
                ) : null}
              </Pressable>
              <Hairline />
            </>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Txt variant="body" color={colors.inkSoft} align="center">
              No timezone matches that search.
            </Txt>
          </View>
        }
      />
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    searchWrap: {
      paddingHorizontal: 24,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    search: {
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      color: colors.ink,
      fontSize: 15,
      minHeight: 48,
    },
    detected: {
      marginTop: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: spacing.lg,
      minHeight: 48,
    },
    pressed: {
      opacity: 0.96,
    },
    empty: {
      padding: spacing.xl,
    },
  }),
);

export default TimezonePickerScreen;
