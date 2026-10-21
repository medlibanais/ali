import React, { useEffect, useMemo } from 'react';
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

  useEffect(() => {
    dispatch(hydrateTheme());
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

  if (!fontsLoaded || !themeHydrated) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer linking={linking} theme={navigationTheme}>
      <StatusBar
        style={theme.dark ? 'light' : 'dark'}
        backgroundColor={theme.colors.paper}
      />
      <RootNavigator />
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
