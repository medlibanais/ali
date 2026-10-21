import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Txt from '../components/Txt';
import {
  colors,
  isDarkPalette,
  radius,
  softShadow,
  themed,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import {
  CoachIcon,
  InsightsIcon,
  ProfileIcon,
  QuestsIcon,
  TodayIcon,
} from '../components/icons';
import TodayScreen from '../screens/TodayScreen';
import QuestsScreen from '../screens/QuestsScreen';
import CoachScreen from '../screens/CoachScreen';
import InsightsScreen from '../screens/InsightsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabIcon = (props: { color: string; size: number }) => React.ReactElement;

/**
 * Floating tab bar item (Figma "Tab bar"): the active tab sits in a soft
 * accent pill with its name, the others are icons only.
 */
function tabIcon(Icon: TabIcon, label: string) {
  return function TabBarIcon({ focused }: { focused: boolean }) {
    return focused ? (
      <View style={styles.activePill}>
        <Icon color={colors.accent} size={20} />
        <Txt variant="label" color={colors.accent} style={styles.activeLabel} numberOfLines={1}>
          {label}
        </Txt>
      </View>
    ) : (
      <Icon color={colors.inkSoft} size={22} />
    );
  };
}

export function MainTabs() {
  useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [styles.bar, { bottom: 12 + insets.bottom }],
        tabBarItemStyle: styles.item,
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{ tabBarIcon: tabIcon(TodayIcon, 'Today'), tabBarAccessibilityLabel: 'Today' }}
      />
      <Tab.Screen
        name="Quests"
        component={QuestsScreen}
        options={{ tabBarIcon: tabIcon(QuestsIcon, 'Quests'), tabBarAccessibilityLabel: 'Quests' }}
      />
      <Tab.Screen
        name="Coach"
        component={CoachScreen}
        options={{ tabBarIcon: tabIcon(CoachIcon, 'Coach'), tabBarAccessibilityLabel: 'Coach' }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{ tabBarIcon: tabIcon(InsightsIcon, 'Insights'), tabBarAccessibilityLabel: 'Insights' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: tabIcon(ProfileIcon, 'Profile'), tabBarAccessibilityLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    // A floating pill card above the bottom edge instead of a hard bar.
    bar: {
      position: 'absolute',
      left: 16,
      right: 16,
      height: 64,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderTopWidth: isDarkPalette() ? 1 : 0,
      borderWidth: isDarkPalette() ? 1 : 0,
      borderColor: colors.line,
      ...softShadow(3),
    },
    item: {
      height: 64,
      paddingVertical: 0,
      overflow: 'visible',
    },
    activePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 11,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(colors.accent, 0.14),
    },
    activeLabel: {
      marginLeft: 6,
    },
  }),
);

export default MainTabs;
