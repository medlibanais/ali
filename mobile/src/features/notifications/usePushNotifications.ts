// Push notifications on the app side (mounted once in App.tsx):
//   - registers this device's Expo push token in device_tokens whenever a
//     user is signed in (each login, and again if the token rotates);
//   - opens the right screen when a notification is tapped, whether the
//     app was running, in the background or closed (cold start). A tap
//     that arrives before the user is signed in waits until they are.
// No-op on web.

import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { runAfterInteractionsOrTimeout } from '../../lib/afterInteractions';
import * as Notifications from 'expo-notifications';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { registerDeviceForPush } from '../../lib/notifications';
import type { RootParamList } from '../../navigation/types';
import { routeForPush, type PushRoute } from './pushRouting';

type NavRef = NavigationContainerRefWithCurrent<RootParamList>;

export function usePushNotifications(
  navigationRef: NavRef,
  userId: string | null,
  appReady: boolean,
  navReady: boolean,
  onboarding: boolean,
): void {
  const pending = useRef<PushRoute | null>(null);
  const handled = useRef<Set<string>>(new Set());
  const canNavigate = appReady && navReady;
  const canNavigateRef = useRef(canNavigate);
  canNavigateRef.current = canNavigate;
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;

  // A tap is only worth acting on once the user has finished setup. While
  // they are still in onboarding, drop it, so a queued tap cannot pull them
  // off the setup flow when onboarding completes.
  useEffect(() => {
    if (onboarding) pending.current = null;
  }, [onboarding]);

  const go = useCallback(
    (route: PushRoute) => {
      if (onboardingRef.current) return;
      if (!canNavigateRef.current || !navigationRef.isReady()) {
        pending.current = route;
        return;
      }
      pending.current = null;
      switch (route.screen) {
        case 'Today':
          navigationRef.navigate('MainTabs', {
            screen: 'Today',
            params: route.pillar ? { pillar: route.pillar } : undefined,
          });
          break;
        case 'Friends':
          navigationRef.navigate('Friends', undefined);
          break;
        case 'Notifications':
          navigationRef.navigate('Notifications');
          break;
      }
    },
    [navigationRef],
  );

  const onResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      go(routeForPush(response.notification.request.content.data));
    },
    [go],
  );

  // Taps: cold start + while running.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let alive = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (alive && response) onResponse(response);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    return () => {
      alive = false;
      sub.remove();
    };
  }, [onResponse]);

  // Flush a tap that came in before sign-in / navigation was ready.
  useEffect(() => {
    if (canNavigate && pending.current) go(pending.current);
  }, [canNavigate, go]);

  // Token: refresh device_tokens on every login, and when it rotates.
  useEffect(() => {
    if (Platform.OS === 'web' || !userId || !appReady) return undefined;
    // Asking the OS for a token and writing it to Supabase waits until the
    // first screen and its entry animations are done (startup speed).
    const task = runAfterInteractionsOrTimeout(() => {
      registerDeviceForPush().catch(() => undefined);
    });
    const sub = Notifications.addPushTokenListener(() => {
      registerDeviceForPush().catch(() => undefined);
    });
    return () => {
      task.cancel();
      sub.remove();
    };
  }, [userId, appReady]);
}
