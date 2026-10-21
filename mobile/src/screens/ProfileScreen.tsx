import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Backdrop from '../components/Backdrop';
import Hairline from '../components/Hairline';
import { FadeInUp, PressableScale } from '../components/Motion';
import PillarBubble from '../components/PillarBubble';
import ProfileAvatar from '../components/ProfileAvatar';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import {
  BellGlyph,
  ChevronGlyph,
  FlameGlyph,
  HelpGlyph,
  PencilGlyph,
  SettingsGlyph,
  ShareGlyph,
  ShieldCheckGlyph,
  SparklesGlyph,
  UserGlyph,
} from '../components/icons';
import ShareProfileSheet from '../features/share/ShareProfileSheet';
import { bestStreakLabel } from '../lib/format';
import { levelProgress, xpToNextLevel } from '../lib/levels';
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
import {
  colors,
  fonts,
  PILLARS,
  radius,
  softSurface,
  spacing,
  themed,
  withAlpha,
} from '../theme/tokens';
import { THEME_LIST } from '../theme/themes';
import { useTheme } from '../theme/useTheme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<AppStackParamList>
>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SectionKey = 'personal' | 'goals' | 'privacy' | 'help';

/** A row inside an opened "Make GROW yours" group. */
function SubRow({
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
      style={({ pressed }) => [styles.subRow, pressed && onPress && styles.pressed]}
    >
      <Txt variant="body" color={danger ? colors.danger : colors.ink}>
        {label}
      </Txt>
      <View style={styles.subRight}>
        {value ? (
          <Txt variant="caption" color={colors.inkSoft} style={styles.subValue} numberOfLines={1}>
            {value}
          </Txt>
        ) : null}
        {onPress ? <ChevronGlyph /> : null}
      </View>
    </Pressable>
  );
}

/** One "Make GROW yours" row: icon well, label, detail and chevron. */
function SettingsRow({
  icon,
  label,
  detail,
  open,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  /** Undefined for rows that navigate instead of opening in place. */
  open?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={open === undefined ? undefined : { expanded: open }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.iconWell}>{icon}</View>
      <View style={styles.rowText}>
        <Txt variant="bodySemi">{label}</Txt>
        <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
          {detail}
        </Txt>
      </View>
      <View style={open ? styles.chevronOpen : undefined}>
        <ChevronGlyph color={colors.inkSoft} />
      </View>
    </Pressable>
  );
}

function ProfileSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton width={180} height={34} style={styles.skeletonBlock} />
      <Skeleton width={120} height={120} borderRadius={60} style={styles.skeletonBlock} />
      <Skeleton height={170} style={styles.skeletonBlock} />
      <Skeleton height={110} style={styles.skeletonBlock} />
      <Skeleton height={320} style={styles.skeletonBlock} />
    </View>
  );
}

export function ProfileScreen({ navigation }: Props) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { profile, goals, loading } = useAppSelector((state) => state.user);
  const gamification = useAppSelector((state) => state.gamification);
  const questsState = useAppSelector((state) => state.quests);
  const [exporting, setExporting] = useState(false);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    dispatch(fetchProfile());
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchGamification());
    }, [dispatch]),
  );

  const toggle = (key: SectionKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection((cur) => (cur === key ? null : key));
  };

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
  const totalXp = gamification.totalXp;
  const toNext = xpToNextLevel(totalXp);
  const progress = levelProgress(totalXp);
  const streak = gamification.currentStreak;
  const activeQuests = questsState.quests.filter((q) => !q.skipped);

  return (
    <Screen scroll>
      <Backdrop
        height={620}
        blobs={[
          { x: 0.1, y: 120, r: 240, color: colors.accent, strength: 0.14 },
          { x: 0.95, y: 380, r: 230, color: colors.pillar.spirituality, strength: 0.12 },
        ]}
      />
      {loading && !profile ? (
        <ProfileSkeleton />
      ) : (
        <>
          <FadeInUp style={styles.heading}>
            <Txt variant="caption" color={colors.inkSoft}>
              A little more you, every day
            </Txt>
            <Txt variant="title" style={styles.headingTitle}>
              Your profile
            </Txt>
          </FadeInUp>

          <FadeInUp delay={60} style={styles.identity}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Edit your avatar"
              onPress={() => navigation.navigate('AvatarCreator')}
              pressedScale={0.95}
              style={styles.avatarRim}
            >
              <ProfileAvatar profile={profile} size={108} mood="happy" />
            </PressableScale>
            <View style={styles.identityText}>
              <Txt variant="title" numberOfLines={1}>
                {profile?.first_name ?? 'You'}
              </Txt>
              {profile?.username ? (
                <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                  {`@${profile.username}`}
                </Txt>
              ) : null}
              <View style={styles.inline}>
                <SparklesGlyph />
                <Txt variant="label" color={colors.accent} style={styles.inlineText} numberOfLines={1}>
                  {`Level ${gamification.level} · ${title}`}
                </Txt>
              </View>
              <View style={styles.identityActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('AvatarCreator')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.inline, pressed && styles.pressed]}
                >
                  <Txt variant="label" color={colors.accent} style={styles.editText}>
                    Edit profile
                  </Txt>
                  <PencilGlyph size={15} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share profile"
                  onPress={() => setSharing(true)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.inline, pressed && styles.pressed]}
                >
                  <Txt variant="label" color={colors.accent} style={styles.editText}>
                    Share
                  </Txt>
                  <ShareGlyph size={16} />
                </Pressable>
              </View>
            </View>
          </FadeInUp>

          <FadeInUp delay={120} style={styles.growth}>
            <View style={styles.growthHeader}>
              <Txt variant="heading">{`${totalXp.toLocaleString()} XP`}</Txt>
              <Txt variant="label" color={colors.inkSoft}>
                {`Level ${gamification.level + 1} ahead`}
              </Txt>
            </View>
            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Txt variant="caption" color={colors.inkSoft}>
              {`${toNext.toLocaleString()} XP to your next chapter`}
            </Txt>
            <View style={styles.streakPill}>
              <FlameGlyph />
              <View style={styles.streakText}>
                <Txt variant="bodySemi" color={colors.accent}>
                  {streak > 0 ? `${streak}-day streak` : 'Start a streak today'}
                </Txt>
                <Txt variant="caption" color={colors.inkSoft}>
                  {streak > 0
                    ? 'Small steps. Real momentum.'
                    : bestStreakLabel(gamification.bestStreak)}
                </Txt>
              </View>
            </View>
          </FadeInUp>

          <FadeInUp delay={180}>
            <View style={styles.sectionHeader}>
              <Txt variant="heading">Your pillars</Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                Today&apos;s balance
              </Txt>
            </View>
            <View style={styles.pillarRow}>
              {PILLARS.map((pillar) => {
                const items = activeQuests.filter((q) => q.pillar === pillar);
                const done = items.filter((q) => q.completed).length;
                return (
                  <View key={pillar} style={styles.pillarCell}>
                    <PillarBubble
                      pillar={pillar}
                      score={questsState.pillarScores[pillar] ?? 0}
                      size={54}
                      done={done}
                      total={items.length}
                      expanded={false}
                      compact
                      onPress={() => navigation.navigate('MainTabs', { screen: 'Quests' })}
                    />
                    <Txt variant="caption" color={colors.inkSoft} style={styles.pillarCount}>
                      {`${done}/${items.length}`}
                    </Txt>
                  </View>
                );
              })}
            </View>
          </FadeInUp>

          <FadeInUp delay={240}>
            <Txt variant="heading" style={styles.sectionTitle}>
              Make GROW yours
            </Txt>
            <View style={styles.settings}>
              <SettingsRow
                icon={<UserGlyph />}
                label="Personal details"
                detail="Make yourself at home"
                open={openSection === 'personal'}
                onPress={() => toggle('personal')}
              />
              {openSection === 'personal' ? (
                <View style={styles.subList}>
                  <SubRow label="Edit avatar" onPress={() => navigation.navigate('AvatarCreator')} />
                  <SubRow label="AI avatar from a photo" onPress={() => navigation.navigate('AiAvatar')} />
                  <SubRow
                    label="Profile picture"
                    value={
                      profile?.avatar_mode === 'ai'
                        ? 'AI avatar'
                        : profile?.avatar_mode === 'photo'
                          ? 'Photo'
                          : 'Avatar'
                    }
                    onPress={() => navigation.navigate('EditPhoto')}
                  />
                  <SubRow
                    label="Timezone"
                    value={profile?.timezone ?? 'UTC'}
                    onPress={() => navigation.navigate('TimezonePicker')}
                  />
                  <View style={styles.themeBlock}>
                    <Txt variant="body">App theme</Txt>
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
                            style={({ pressed }) => [styles.themeOption, pressed && styles.pressed]}
                          >
                            <View
                              style={[
                                styles.swatch,
                                {
                                  backgroundColor: option.colors.paper,
                                  borderColor: selected ? option.colors.accent : option.colors.line,
                                },
                                selected && styles.swatchSelected,
                              ]}
                            >
                              <View style={[styles.swatchAccent, { backgroundColor: option.colors.accent }]} />
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
                  </View>
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<SettingsGlyph />}
                label="Goals & pillars"
                detail="Choose what matters to you"
                open={openSection === 'goals'}
                onPress={() => toggle('goals')}
              />
              {openSection === 'goals' ? (
                <View style={styles.subList}>
                  <SubRow label="Workouts" value={`${goals?.workouts_per_week ?? '-'} per week`} />
                  <SubRow label="Sleep" value={`${goals?.sleep_target_hours ?? '-'} hours`} />
                  <SubRow label="Water" value={`${goals?.water_liters_per_day ?? '-'} liters`} />
                  <SubRow label="Calling parents" value={`${goals?.call_parents_frequency ?? '-'}`} />
                  <SubRow
                    label="Deep work"
                    value={`${goals?.deep_work_hours_per_week ?? '-'} hours per week`}
                  />
                  <SubRow label="Fun time" value={`${goals?.weekly_fun_hours ?? '-'} hours per week`} />
                  <SubRow
                    label="Practice"
                    value={
                      goals?.prayer_frequency === '5_daily'
                        ? '5 daily prayers'
                        : `${goals?.prayer_frequency ?? '-'}`
                    }
                  />
                  <SubRow label="Achievements" onPress={() => navigation.navigate('Achievements')} />
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<BellGlyph size={20} color={colors.ink} />}
                label="Reminders"
                detail="Daily check-ins and nudges"
                onPress={() => navigation.navigate('NotificationSettings')}
              />
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<ShieldCheckGlyph />}
                label="Privacy & account"
                detail="Your data, your choices"
                open={openSection === 'privacy'}
                onPress={() => toggle('privacy')}
              />
              {openSection === 'privacy' ? (
                <View style={styles.subList}>
                  <SubRow label="Friends" onPress={() => navigation.navigate('Friends')} />
                  <SubRow label="Privacy Policy" onPress={() => navigation.navigate('PrivacyPolicy')} />
                  <SubRow
                    label={exporting ? 'Preparing export' : 'Export my data'}
                    onPress={exporting ? undefined : exportData}
                  />
                  <SubRow label="Delete account" danger onPress={deleteAccount} />
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<HelpGlyph />}
                label="Help & support"
                detail="We're here for you"
                open={openSection === 'help'}
                onPress={() => toggle('help')}
              />
              {openSection === 'help' ? (
                <View style={styles.subList}>
                  <SubRow
                    label="Ask your coach"
                    onPress={() => navigation.navigate('MainTabs', { screen: 'Coach' })}
                  />
                  <SubRow label="Terms of Service" onPress={() => navigation.navigate('TermsOfService')} />
                </View>
              ) : null}
            </View>
          </FadeInUp>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              onPress={confirmLogout}
              hitSlop={10}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Txt variant="label" color={colors.inkSoft}>
                Sign out
              </Txt>
            </Pressable>
            <Txt variant="caption" color={colors.inkSoft}>
              GROW · At your own pace
            </Txt>
          </View>
        </>
      )}
      <ShareProfileSheet visible={sharing} onClose={() => setSharing(false)} />
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pressed: {
      opacity: 0.7,
    },
    heading: {
      marginTop: spacing.xl,
    },
    headingTitle: {
      marginTop: 2,
    },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    avatarRim: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
      ...softSurface(2),
    },
    identityText: {
      flex: 1,
      marginLeft: 22,
      gap: spacing.sm,
    },
    inline: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    inlineText: {
      marginLeft: 6,
      flexShrink: 1,
    },
    editText: {
      marginRight: 6,
    },
    identityActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: spacing.lg,
      rowGap: spacing.xs,
    },
    growth: {
      marginTop: spacing.xl,
      padding: 20,
      gap: spacing.md,
      borderRadius: radius.lg,
      ...softSurface(2),
    },
    growthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    xpTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.paperAlt,
      overflow: 'hidden',
    },
    xpFill: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.gold,
    },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: withAlpha(colors.accent, 0.14),
    },
    streakText: {
      flex: 1,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: spacing.xl,
    },
    sectionTitle: {
      marginTop: spacing.xl,
    },
    pillarRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
    },
    pillarCell: {
      width: 63,
      alignItems: 'center',
    },
    pillarCount: {
      marginTop: 22,
      fontSize: 12,
    },
    settings: {
      marginTop: spacing.md,
      paddingVertical: 2,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      ...softSurface(2),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 65,
    },
    iconWell: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.paper,
    },
    rowText: {
      flex: 1,
      marginLeft: spacing.md,
    },
    chevronOpen: {
      transform: [{ rotate: '90deg' }],
    },
    divider: {
      backgroundColor: colors.line,
    },
    subList: {
      marginLeft: 48,
      paddingBottom: spacing.sm,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    subRight: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      marginLeft: spacing.md,
    },
    subValue: {
      marginRight: spacing.xs,
      flexShrink: 1,
    },
    themeBlock: {
      paddingVertical: spacing.sm,
    },
    themeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: spacing.sm,
    },
    themeOption: {
      width: '25%',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchSelected: {
      borderWidth: 2.5,
    },
    swatchAccent: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    themeName: {
      marginTop: spacing.xs,
      fontFamily: fonts.caption,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
    skeletonWrap: {
      paddingTop: spacing.xl,
    },
    skeletonBlock: {
      marginBottom: spacing.lg,
    },
  }),
);

export default ProfileScreen;
