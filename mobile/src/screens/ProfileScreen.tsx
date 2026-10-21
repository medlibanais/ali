import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import ProfileAvatar from '../components/ProfileAvatar';
import Card from '../components/Card';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { ChevronGlyph } from '../components/icons';
import { pluralize } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { AppStackParamList, MainTabParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../store/slices/authSlice';
import { fetchProfile } from '../store/slices/userSlice';
import {
  fetchGamification,
  titleForLevel,
} from '../store/slices/gamificationSlice';
import { setTheme } from '../store/slices/themeSlice';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { THEME_LIST } from '../theme/themes';
import { useTheme } from '../theme/useTheme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<AppStackParamList>
>;

function SettingsRow({
  label,
  value,
  onPress,
  danger = false,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        pressed && onPress && styles.pressed,
      ]}
    >
      <Txt variant="body" color={danger ? colors.danger : colors.ink}>
        {label}
      </Txt>
      <View style={styles.settingsRight}>
        {value ? (
          <Txt variant="caption" color={colors.inkFaint} style={styles.settingsValue}>
            {value}
          </Txt>
        ) : null}
        {onPress ? <ChevronGlyph /> : null}
      </View>
    </Pressable>
  );
}

function GoalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.goalRow}>
      <Txt variant="body" color={colors.inkSoft}>
        {label}
      </Txt>
      <Txt variant="body">{value}</Txt>
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View>
      <Skeleton width={120} height={120} borderRadius={60} style={styles.skeletonCenter} />
      <Skeleton width={180} height={22} style={styles.skeletonCenter} />
      <Skeleton height={90} style={styles.skeletonBlock} />
      <Skeleton height={180} style={styles.skeletonBlock} />
      <Skeleton height={220} style={styles.skeletonBlock} />
    </View>
  );
}

export function ProfileScreen({ navigation }: Props) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { profile, goals, loading } = useAppSelector((state) => state.user);
  const gamification = useAppSelector((state) => state.gamification);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    dispatch(fetchProfile());
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchGamification());
    }, [dispatch]),
  );

  const nextLevel = gamification.nextLevel ?? gamification.level + 1;
  const levelSize = 500 * nextLevel;
  const xpIntoLevel =
    gamification.xpToNextLevel !== null
      ? Math.max(0, levelSize - gamification.xpToNextLevel)
      : null;
  const levelProgress =
    xpIntoLevel !== null ? Math.min(1, xpIntoLevel / levelSize) : 0;

  const exportData = async () => {
    setExporting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');

      const [
        profile,
        goals,
        gam,
        achievements,
        scores,
        quests,
        completions,
        conversations,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_goals').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('gamification').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('achievements').select('*').eq('user_id', user.id),
        supabase.from('daily_scores').select('*').eq('user_id', user.id),
        supabase.from('quests').select('*').eq('user_id', user.id),
        supabase.from('quest_completions').select('*').eq('user_id', user.id),
        supabase.from('conversations').select('id').eq('user_id', user.id),
      ]);

      const conversationIds = (conversations.data ?? []).map(
        (c: { id: string }) => c.id,
      );
      const { data: messages } = conversationIds.length
        ? await supabase
            .from('messages')
            .select('*')
            .in('conversation_id', conversationIds)
        : { data: [] };

      const payload = JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          account: { id: user.id, email: user.email },
          profile: profile.data,
          goals: goals.data,
          gamification: gam.data,
          achievements: achievements.data ?? [],
          daily_scores: scores.data ?? [],
          quests: quests.data ?? [],
          completions: completions.data ?? [],
          messages: messages ?? [],
        },
        null,
        2,
      );
      try {
        await Share.share({ message: payload });
      } catch {
        toast.showToast({
          message: 'Your export is ready. Sharing is not available on this device.',
        });
      }
    } catch (error) {
      toast.showToast({
        message:
          error instanceof Error
            ? error.message
            : 'Export is not available yet. Try again later.',
      });
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently removes your profile, quests, streaks, and conversations. There is no undo.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you certain',
              'Everything tied to this account will be erased. Confirm deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete permanently',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { error } = await supabase.functions.invoke(
                        'delete-account',
                      );
                      if (error) throw error;
                      toast.showToast({
                        message: 'Your account has been deleted.',
                      });
                      dispatch(logout());
                    } catch (error) {
                      toast.showToast({
                        message:
                          error instanceof Error
                            ? error.message
                            : 'Could not delete the account. Try again later.',
                      });
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const confirmLogout = () => {
    Alert.alert('Sign out', 'You can sign back in anytime.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => dispatch(logout()),
      },
    ]);
  };

  const title = gamification.currentTitle ?? titleForLevel(gamification.level);

  return (
    <Screen scroll>
      {loading && !profile ? (
        <ProfileSkeleton />
      ) : (
        <>
          <View style={styles.identity}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit avatar or photo"
              onPress={() => navigation.navigate('AvatarCreator')}
            >
              <ProfileAvatar profile={profile} size={120} mood="happy" />
            </Pressable>
            <Txt variant="title" style={styles.name}>
              {profile?.first_name ?? 'Your profile'}
            </Txt>
            {profile?.username ? (
              <Txt variant="caption" color={colors.inkFaint}>
                {`@${profile.username}`}
              </Txt>
            ) : null}
            <Txt variant="caption" color={colors.gold}>
              {title}
            </Txt>
          </View>

          <Card style={styles.card}>
            <View style={styles.levelHeader}>
              <Txt variant="label">{`Level ${gamification.level}`}</Txt>
              <Txt variant="caption" color={colors.inkFaint}>
                {xpIntoLevel !== null
                  ? `${xpIntoLevel} / ${levelSize} XP to next level`
                  : 'Level progress loads with your profile'}
              </Txt>
            </View>
            <View style={styles.levelTrack}>
              <View
                style={[
                  styles.levelFill,
                  { width: `${levelProgress * 100}%` },
                ]}
              />
            </View>
            <Hairline style={styles.cardRule} />
            <View style={styles.bestRow}>
              <Txt variant="body" color={colors.inkSoft}>
                Best streak
              </Txt>
              <Txt variant="bodySemi" color={colors.gold}>
                {pluralize(gamification.bestStreak, 'day')}
              </Txt>
            </View>
          </Card>

          <Card padded={false} style={styles.card}>
            <View style={styles.sectionHeader}>
              <Txt variant="label">Your goals</Txt>
            </View>
            <Hairline />
            <View style={styles.sectionBody}>
              <GoalRow
                label="Workouts"
                value={`${goals?.workouts_per_week ?? '-'} per week`}
              />
              <GoalRow
                label="Sleep"
                value={`${goals?.sleep_target_hours ?? '-'} hours`}
              />
              <GoalRow
                label="Water"
                value={`${goals?.water_liters_per_day ?? '-'} liters`}
              />
              <GoalRow
                label="Calling parents"
                value={`${goals?.call_parents_frequency ?? '-'}`}
              />
              <GoalRow
                label="Deep work"
                value={`${goals?.deep_work_hours_per_week ?? '-'} hours per week`}
              />
              <GoalRow
                label="Fun time"
                value={`${goals?.weekly_fun_hours ?? '-'} hours per week`}
              />
              <GoalRow
                label="Practice"
                value={
                  goals?.prayer_frequency === '5_daily'
                    ? '5 daily prayers'
                    : `${goals?.prayer_frequency ?? '-'}`}
              />
            </View>
          </Card>

          <Card style={styles.card}>
            <Txt variant="label">App theme</Txt>
            <View style={styles.themeGrid}>
              {THEME_LIST.map((option) => {
                const selected = option.id === theme.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option.name} theme`}
                    onPress={() => dispatch(setTheme(option.id))}
                    style={({ pressed }) => [
                      styles.themeOption,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: option.colors.paper,
                          borderColor: selected
                            ? option.colors.accent
                            : option.colors.line,
                        },
                        selected && styles.swatchSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.swatchAccent,
                          { backgroundColor: option.colors.accent },
                        ]}
                      />
                    </View>
                    <Txt
                      variant="caption"
                      color={selected ? colors.accent : colors.inkSoft}
                      style={styles.themeName}
                    >
                      {option.name}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card padded={false} style={styles.card}>
            <SettingsRow
              label="AI avatar from a photo"
              onPress={() => navigation.navigate('AiAvatar')}
            />
            <Hairline />
            <SettingsRow
              label="Edit avatar"
              onPress={() => navigation.navigate('AvatarCreator')}
            />
            <Hairline />
            <SettingsRow
              label="Profile photo"
              value={
                profile?.avatar_mode === 'ai'
                  ? 'AI avatar'
                  : profile?.avatar_mode === 'photo'
                    ? 'Photo'
                    : 'Avatar'
              }
              onPress={() => navigation.navigate('EditPhoto')}
            />
            <Hairline />
            <SettingsRow
              label="Timezone"
              value={profile?.timezone ?? 'UTC'}
              onPress={() => navigation.navigate('TimezonePicker')}
            />
            <Hairline />
            <SettingsRow
              label="Notifications"
              onPress={() => navigation.navigate('NotificationSettings')}
            />
            <Hairline />
            <SettingsRow
              label="Friends"
              onPress={() => navigation.navigate('Friends')}
            />
            <Hairline />
            <SettingsRow
              label="Achievements"
              onPress={() => navigation.navigate('Achievements')}
            />
            <Hairline />
            <SettingsRow
              label="Terms of Service"
              onPress={() => navigation.navigate('TermsOfService')}
            />
            <Hairline />
            <SettingsRow
              label="Privacy Policy"
              onPress={() => navigation.navigate('PrivacyPolicy')}
            />
          </Card>

          <Card padded={false} style={styles.card}>
            <SettingsRow
              label={exporting ? 'Preparing export' : 'Export my data'}
              onPress={exporting ? undefined : exportData}
            />
            <Hairline />
            <SettingsRow label="Delete account" danger onPress={deleteAccount} />
          </Card>

          <Button
            title="Sign out"
            variant="secondary"
            onPress={confirmLogout}
            style={styles.logoutButton}
          />
        </>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  identity: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  name: {
    marginTop: spacing.lg,
  },
  card: {
    marginTop: spacing.lg,
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelTrack: {
    height: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.paperAlt,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  levelFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  cardRule: {
    marginVertical: spacing.lg,
  },
  bestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeader: {
    padding: spacing.lg,
  },
  sectionBody: {
    padding: spacing.lg,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    minHeight: 48,
  },
  settingsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsValue: {
    marginRight: spacing.sm,
  },
  logoutButton: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  pressed: {
    opacity: 0.96,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
  },
  themeOption: {
    alignItems: 'center',
    width: '25%',
    marginBottom: spacing.lg,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 2,
  },
  swatchAccent: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  themeName: {
    marginTop: spacing.xs,
  },
  skeletonCenter: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  skeletonBlock: {
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  }),
);

export default ProfileScreen;
