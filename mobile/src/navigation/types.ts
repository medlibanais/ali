import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Quest } from '../api/types';

export type AuthStackParamList = {
  Login: undefined;
  Register: { showInvite?: boolean } | undefined;
  ForgotPassword: undefined;
  ResetPassword: { code?: string; token_hash?: string } | undefined;
  VerifyEmail:
    | { email?: string; code?: string; token_hash?: string }
    | undefined;
  Invite: { code?: string } | undefined;
};

export type OnboardingStackParamList = {
  Onboarding: undefined;
  AvatarCreator: { fromOnboarding?: boolean } | undefined;
};

export type MainTabParamList = {
  Today: undefined;
  Quests: undefined;
  Coach: undefined;
  Insights: undefined;
  Profile: undefined;
};

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Achievements: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
  TermsOfService: undefined;
  PrivacyPolicy: undefined;
  QuestDetail: { quest: Quest };
  TimezonePicker: undefined;
  AvatarCreator: { fromOnboarding?: boolean } | undefined;
  EditPhoto: undefined;
  Friends: { code?: string } | undefined;
};
