import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { borderWidth, colors, fonts } from '../theme/tokens';
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

export function MainTabs() {
  useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopWidth: borderWidth.hairline,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: fonts.bodySemi,
        },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <TodayIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Quests"
        component={QuestsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <QuestsIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Coach"
        component={CoachScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <CoachIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <InsightsIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <ProfileIcon color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default MainTabs;
