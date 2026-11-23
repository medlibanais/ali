import './i18n';
import { Avatar3DHost } from './avatar/Avatar3D';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
import { holdSplash } from './lib/bootSplash';
import { hydrateLanguage } from './store/slices/languageSlice';
import { isRtlLanguage } from './i18n/languages';
import { useInviteLinkCapture } from './features/friends/useInviteLinks';

// Keep the native splash up until the first real screen has been drawn
// (see lib/bootSplash.ts). Runs before the first render.
holdSplash();

const navigationRef = createNavigationContainerRef<RootParamList>();

const linking: LinkingOptions<RootParamList> = {
  prefixes: ['prayerlock://'],
  config: {
    screens: {
      VerifyEmail: 'verify-email',
      ResetPassword: 'reset-password',
      Friends: 'add-friend',
      MainTabs: { screens: { Today: 'today' } },
      PartyInvite: 'party',
    },
  },
};

function ThemedRoot() {
  const [fontsLoaded] = useFonts(appFonts);
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const themeHydrated = useAppSelector((state) => state.theme.hydrated);
  const languageHydrated = useAppSelector((state) => state.language.hydrated);
  const language = useAppSelector((state) => state.language.language);
  const userId = useAppSelector((state) => state.auth.userId);
  const appReady = useAppSelector((state) => state.auth.status === 'ready');
  const onboarding = useAppSelector((state) => state.auth.status === 'needsOnboarding');
  const [navReady, setNavReady] = useState(false);

  // Friend invite links: keep the code until you are signed in.
  useInviteLinkCapture();

  // Streak alerts and other pushes: token on login, tap opens Today.
  usePushNotifications(navigationRef, userId, appReady, navReady, onboarding);

  // Finishing onboarding swaps the onboarding stack for the app stack.
  // React Navigation reuses the old stack's state and keeps the routes whose
  // names exist in both (AiAvatar, AvatarCreator), so a new user would land
  // back on the avatar editor. Start the app on Today instead.
  const authStatus = useAppSelector((state) => state.auth.status);
  const prevAuthStatus = useRef(authStatus);
  useEffect(() => {
    const was = prevAuthStatus.current;
    prevAuthStatus.current = authStatus;
    if (was === 'needsOnboarding' && authStatus === 'ready' && navigationRef.isReady()) {
      navigationRef.resetRoot({ index: 0, routes: [{ name: 'MainTabs' }] });
    }
  }, [authStatus]);

  const profileLoaded = useAppSelector((state) => state.user.profile !== null);
  const remoteTheme = useAppSelector((state) => state.user.profile?.theme_preference ?? null);

  useEffect(() => {
    dispatch(hydrateTheme());
    dispatch(hydrateLanguage());
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

  if (!fontsLoaded || !themeHydrated || !languageHydrated) {
    return <SplashScreen />;
  }

  const rtl = isRtlLanguage(language);

  // Setting `direction` on the root flips row layouts, start/end margins and
  // paddings instantly, without waiting for the Android restart that
  // I18nManager.forceRTL needs.
  return (
    <View
      style={[styles.root, { direction: rtl ? 'rtl' : 'ltr' }]}
      // react-native-web resolves start/end margins from the `dir` of the
      // nearest ancestor, not from the `direction` style.
      {...(Platform.OS === 'web' ? ({ dir: rtl ? 'rtl' : 'ltr' } as object) : null)}
    >
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

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
