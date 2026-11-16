import './i18n';
import { Avatar3DHost } from './avatar/Avatar3D';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Provider } from 'react-redux';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
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
import type { AppStackParamList, AuthStackParamList } from './navigation/types';
import { useTheme } from './theme/useTheme';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { hydrateTheme } from './store/slices/themeSlice';
import { hydrateLanguage } from './store/slices/languageSlice';
import { isRtlLanguage } from './i18n/languages';

const linking: LinkingOptions<AuthStackParamList & AppStackParamList> = {
  prefixes: ['prayerlock://'],
  config: {
    screens: {
      VerifyEmail: 'verify-email',
      ResetPassword: 'reset-password',
      Friends: 'add-friend',
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

  useEffect(() => {
    dispatch(hydrateTheme());
    dispatch(hydrateLanguage());
  }, [dispatch]);

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

  // Setting `direction` on the root flips row layouts, start/end margins and
  // paddings instantly, without waiting for the Android restart that
  // I18nManager.forceRTL needs.
  return (
    <View
      style={[styles.root, { direction: isRtlLanguage(language) ? 'rtl' : 'ltr' }]}
    >
    <NavigationContainer linking={linking} theme={navigationTheme}>
      <StatusBar
        style={theme.dark ? 'light' : 'dark'}
        backgroundColor={theme.colors.paper}
      />
      <RootNavigator />
      <Avatar3DHost />
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
