import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Quest } from '../api/types';
import type { PillarId } from '../components/PillarBubble';

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
  AiAvatar: { fromOnboarding?: boolean } | undefined;
  AvatarCreator: { fromOnboarding?: boolean; who?: 'current' | 'future' } | undefined;
};

export type MainTabParamList = {
  // pillar: open with that pillar's quests expanded (push notification tap)
  Today: { pillar?: PillarId } | undefined;
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
  AvatarCreator: { fromOnboarding?: boolean; who?: 'current' | 'future' } | undefined;
  AiAvatar: { fromOnboarding?: boolean } | undefined;
  EditPhoto: undefined;
  Friends: { code?: string } | undefined;
};

/** Everything the root NavigationContainer can route to. */
export type RootParamList = AuthStackParamList & AppStackParamList;
