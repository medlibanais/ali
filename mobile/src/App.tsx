import { Avatar3DHost } from './avatar/Avatar3D';
import React, { useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import {
  NavigationContainer,
  LinkingOptions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { appFonts } from './theme/fonts';
import { queryClient } from './lib/queryClient';
import { store } from './store';
import RootNavigator from './navigation/RootNavigator';
import SplashScreen from './screens/SplashScreen';
import ToastProvider from './components/Toast';
import CelebrationHost from './features/celebrations/CelebrationHost';
import type { RootParamList } from './navigation/types';
import { useTheme } from './theme/useTheme';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { hydrateTheme, syncThemeWithProfile } from './store/slices/themeSlice';
import ThemeTransition from './components/ThemeTransition';
import { usePushNotifications } from './features/notifications/usePushNotifications';
import OfflineBanner from './features/offline/OfflineBanner';

const navigationRef = createNavigationContainerRef<RootParamList>();

const linking: LinkingOptions<RootParamList> = {
  prefixes: ['prayerlock://'],
  config: {
    screens: {
      VerifyEmail: 'verify-email',
      ResetPassword: 'reset-password',
      Friends: 'add-friend',
      MainTabs: { screens: { Today: 'today' } },
    },
  },
};

function ThemedRoot() {
  const [fontsLoaded] = useFonts(appFonts);
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const themeHydrated = useAppSelector((state) => state.theme.hydrated);
  const userId = useAppSelector((state) => state.auth.userId);
  const appReady = useAppSelector((state) => state.auth.status === 'ready');
  const [navReady, setNavReady] = useState(false);

  // Streak alerts and other pushes: token on login, tap opens Today.
  usePushNotifications(navigationRef, userId, appReady, navReady);

  const profileLoaded = useAppSelector((state) => state.user.profile !== null);
  const remoteTheme = useAppSelector((state) => state.user.profile?.theme_preference ?? null);

  useEffect(() => {
    dispatch(hydrateTheme());
  }, [dispatch]);

  // Follow the theme saved on the profile (picked on another device), or
  // upload this device's pick, once both the local and remote values exist.
  useEffect(() => {
    if (themeHydrated && profileLoaded) dispatch(syncThemeWithProfile(remoteTheme));
  }, [dispatch, themeHydrated, profileLoaded, remoteTheme]);

  const navigationTheme = useMemo(
    () => ({
      dark: theme.dark,
      colors: {
        primary: theme.colors.accent,
        background: theme.colors.paper,
        card: theme.colors.paper,
        text: theme.colors.ink,
        border: theme.colors.line,
        notification: theme.colors.danger,
      },
    }),
    [theme],
  );

  if (!fontsLoaded || !themeHydrated) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={navigationTheme}
      onReady={() => setNavReady(true)}
    >
      <StatusBar
        style={theme.dark ? 'light' : 'dark'}
        backgroundColor={theme.colors.paper}
      />
      <ThemeTransition>
        <RootNavigator />
        <Avatar3DHost />
      </ThemeTransition>
      <CelebrationHost />
      {userId !== null ? <OfflineBanner /> : null}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ThemedRoot />
          </ToastProvider>
        </QueryClientProvider>
      </Provider>
    </SafeAreaProvider>
  );
}
