import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Glass from '../components/Glass';
import Txt from '../components/Txt';
import {
  colors,
  fonts,
  isDarkPalette,
  radius,
  softShadow,
  themed,
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
 * Floating tab bar item: every tab shows its icon and name in the same
 * place, so the bar never reflows when switching tabs. The active tab
 * lights up in the accent color with a short bar above the icon.
 */
function tabIcon(Icon: TabIcon, label: string) {
  return function TabBarIcon({ focused }: { focused: boolean }) {
    const tint = focused ? colors.accent : colors.inkSoft;
    return (
      <View style={styles.tab}>
        <View style={[styles.indicator, focused && styles.indicatorOn]} />
        <Icon color={tint} size={22} />
        <Txt
          variant="caption"
          color={tint}
          style={[styles.tabLabel, focused && styles.tabLabelOn]}
          numberOfLines={1}
        >
          {label}
        </Txt>
      </View>
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
        // Frosted bar: content scrolling underneath shows through, blurred.
        tabBarBackground: () => (
          <Glass style={StyleSheet.absoluteFill} intensity={60} tint={0.55} />
        ),
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
      paddingHorizontal: 6,
      borderRadius: radius.lg,
      backgroundColor: 'transparent',
      borderTopWidth: isDarkPalette() ? 1 : 0,
      borderWidth: isDarkPalette() ? 1 : 0,
      borderColor: colors.outline ?? colors.line,
      overflow: 'hidden',
      ...softShadow(3),
    },
    item: {
      height: 64,
      paddingVertical: 0,
    },
    tab: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 56,
      height: 64,
    },
    indicator: {
      position: 'absolute',
      top: 0,
      width: 20,
      height: 3,
      borderBottomLeftRadius: 3,
      borderBottomRightRadius: 3,
      backgroundColor: 'transparent',
    },
    indicatorOn: {
      backgroundColor: colors.accent,
    },
    tabLabel: {
      fontSize: 11,
      lineHeight: 14,
      marginTop: 3,
    },
    tabLabelOn: {
      fontFamily: fonts.bodySemi,
    },
  }),
);

export default MainTabs;
