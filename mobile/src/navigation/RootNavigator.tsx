import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { restoreSession, sessionExpired } from '../store/slices/authSlice';
import { colors, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import AvatarCreatorScreen from '../screens/AvatarCreatorScreen';
import AiAvatarScreen from '../screens/AiAvatarScreen';
import AchievementsScreen from '../screens/AchievementsScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import TermsOfServiceScreen from '../screens/TermsOfServiceScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import QuestDetailScreen from '../screens/QuestDetailScreen';
import TimezonePickerScreen from '../screens/TimezonePickerScreen';
import EditPhotoScreen from '../screens/EditPhotoScreen';
import FriendsScreen from '../screens/FriendsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import { useNotificationBanner } from '../features/notifications/api';
import MainTabs from './MainTabs';
import type {
  AppStackParamList,
  AuthStackParamList,
  OnboardingStackParamList,
} from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack =
  createNativeStackNavigator<OnboardingStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const hiddenOptions = themed(() => ({
  headerShown: false,
  contentStyle: { backgroundColor: colors.paper },
}));

const titledOptions = themed(() => ({
  contentStyle: { backgroundColor: colors.paper },
  headerStyle: { backgroundColor: colors.paper },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
}));

function AuthNavigator() {
  useTheme();
  return (
    <AuthStack.Navigator screenOptions={hiddenOptions}>
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: 'PrayerLock' }}
      />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: 'Create account' }}
      />
      <AuthStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ title: 'Reset password' }}
      />
      <AuthStack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ title: 'New password' }}
      />
      <AuthStack.Screen
        name="VerifyEmail"
        component={VerifyEmailScreen}
        options={{ title: 'Verify email' }}
      />
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator() {
  useTheme();
  return (
    <OnboardingStack.Navigator screenOptions={hiddenOptions}>
      <OnboardingStack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ title: 'About you' }}
      />
      <OnboardingStack.Screen
        name="AiAvatar"
        component={AiAvatarScreen}
        options={{ title: 'Your future self' }}
      />
      <OnboardingStack.Screen
        name="AvatarCreator"
        component={AvatarCreatorScreen}
        options={{ title: 'Your future self' }}
      />
    </OnboardingStack.Navigator>
  );
}

function AppNavigator() {
  useTheme();
  useNotificationBanner();
  return (
    <AppStack.Navigator screenOptions={titledOptions}>
      <AppStack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false, title: 'PrayerLock' }}
      />
      <AppStack.Screen
        name="Achievements"
        component={AchievementsScreen}
        options={{ title: 'Achievements' }}
      />
      <AppStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications' }}
      />
      <AppStack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: 'Notification settings' }}
      />
      <AppStack.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{ title: 'Terms of Service' }}
      />
      <AppStack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: 'Privacy Policy' }}
      />
      <AppStack.Screen
        name="QuestDetail"
        component={QuestDetailScreen}
        options={{ presentation: 'modal', title: 'Quest' }}
      />
      <AppStack.Screen
        name="TimezonePicker"
        component={TimezonePickerScreen}
        options={{ title: 'Timezone' }}
      />
      <AppStack.Screen
        name="AvatarCreator"
        component={AvatarCreatorScreen}
        options={{ title: 'Your avatar' }}
      />
      <AppStack.Screen
        name="AiAvatar"
        component={AiAvatarScreen}
        options={{ title: 'AI avatar' }}
      />
      <AppStack.Screen
        name="EditPhoto"
        component={EditPhotoScreen}
        options={{ title: 'Profile photo' }}
      />
      <AppStack.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ title: 'Friends' }}
      />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);

  useEffect(() => {
    dispatch(restoreSession());

    // Keep redux in sync with Supabase auth events (sign-out elsewhere,
    // token refresh failure, email verification creating a session).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        dispatch(sessionExpired());
      } else if (event === 'SIGNED_IN' && session) {
        dispatch(restoreSession());
      }
      // PASSWORD_RECOVERY is handled by ResetPasswordScreen itself.
    });
    return () => subscription.unsubscribe();
  }, [dispatch]);

  switch (status) {
    case 'restoring':
      return <SplashScreen />;
    case 'unauthenticated':
      return <AuthNavigator />;
    case 'needsOnboarding':
      return <OnboardingNavigator />;
    case 'ready':
      return <AppNavigator />;
  }
}

export default RootNavigator;
