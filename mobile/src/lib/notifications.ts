// Push registration: asks permission, gets the Expo push token, stores it.
// Safe on every platform — degrades silently where push is unsupported
// (web, Expo Go on some SDK versions, emulators without Play services).

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerDeviceForPush(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const token = await Notifications.getExpoPushTokenAsync();
    const tokenValue = token.data;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    await supabase.from('device_tokens').upsert(
      {
        user_id: user.id,
        token: tokenValue,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    );
    return tokenValue;
  } catch {
    return null;
  }
}
