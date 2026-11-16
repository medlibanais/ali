import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useLanguageSync } from '../i18n/useLanguageSync';
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
  const { t } = useTranslation();
  return (
    <AuthStack.Navigator screenOptions={hiddenOptions}>
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: t('common.appName') }}
      />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: t('nav.createAccount') }}
      />
      <AuthStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ title: t('nav.resetPassword') }}
      />
      <AuthStack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ title: t('nav.newPassword') }}
      />
      <AuthStack.Screen
        name="VerifyEmail"
        component={VerifyEmailScreen}
        options={{ title: t('nav.verifyEmail') }}
      />
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator() {
  useTheme();
  const { t } = useTranslation();
  return (
    <OnboardingStack.Navigator screenOptions={hiddenOptions}>
      <OnboardingStack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ title: t('nav.aboutYou') }}
      />
      <OnboardingStack.Screen
        name="AiAvatar"
        component={AiAvatarScreen}
        options={{ ...titledOptions, headerShown: true, title: t('nav.futureSelf') }}
      />
      <OnboardingStack.Screen
        name="AvatarCreator"
        component={AvatarCreatorScreen}
        options={{ title: t('nav.futureSelf'), headerShown: false }}
      />
    </OnboardingStack.Navigator>
  );
}

function AppNavigator() {
  useTheme();
  useNotificationBanner();
  useLanguageSync();
  const { t } = useTranslation();
  return (
    <AppStack.Navigator screenOptions={titledOptions}>
      <AppStack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false, title: t('common.appName') }}
      />
      <AppStack.Screen
        name="Achievements"
        component={AchievementsScreen}
        options={{ title: t('nav.achievements') }}
      />
      <AppStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: t('nav.notifications') }}
      />
      <AppStack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: t('nav.notificationSettings') }}
      />
      <AppStack.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{ title: t('nav.terms') }}
      />
      <AppStack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: t('nav.privacy') }}
      />
      <AppStack.Screen
        name="QuestDetail"
        component={QuestDetailScreen}
        options={{ presentation: 'modal', title: t('nav.quest') }}
      />
      <AppStack.Screen
        name="TimezonePicker"
        component={TimezonePickerScreen}
        options={{ title: t('nav.timezone') }}
      />
      <AppStack.Screen
        name="AvatarCreator"
        component={AvatarCreatorScreen}
        options={{ title: t('nav.yourAvatar'), headerShown: false }}
      />
      <AppStack.Screen
        name="AiAvatar"
        component={AiAvatarScreen}
        options={{ title: t('nav.aiAvatar') }}
      />
      <AppStack.Screen
        name="EditPhoto"
        component={EditPhotoScreen}
        options={{ title: t('nav.profilePhoto') }}
      />
      <AppStack.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ title: t('nav.friends') }}
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
