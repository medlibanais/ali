// Push registration: asks permission, gets the Expo push token, stores it
// in device_tokens for the signed-in user (RLS: owner only).
// Safe on every platform: on web every function is a no-op, and on a
// phone failures degrade silently (no Play services, permission denied).

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const ANDROID_CHANNEL_ID = 'default';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** EAS project id, required by getExpoPushTokenAsync in dev/production builds. */
function easProjectId(): string | undefined {
  const fromExtra = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? undefined;
}

/** Android 8+ shows nothing without a channel; Android 13 asks for permission only once one exists. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
  });
}

/** Saves (or refreshes) this device's token for the signed-in user. */
export async function saveDeviceToken(token: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS === 'android' ? 'android' : 'web',
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  );
  return !error;
}

let lastToken: string | null = null;

export async function registerDeviceForPush(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;

    await ensureAndroidChannel();

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId = easProjectId();
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    lastToken = token.data;
    const saved = await saveDeviceToken(token.data);
    return saved ? token.data : null;
  } catch {
    return null;
  }
}

/**
 * Removes this device's token for the current user. Call before signing
 * out so the next person on this phone does not get the previous user's
 * streak alerts.
 */
export async function unregisterDeviceForPush(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !lastToken) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('token', lastToken);
  } catch {
    // Best effort: the server also prunes tokens Expo reports as dead.
  }
}
