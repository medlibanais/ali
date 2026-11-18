import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { appLocale, labelFor } from '../i18n';
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
import BecomingCard from '../components/BecomingCard';
import Hairline from '../components/Hairline';
import { FadeInUp, PressableScale } from '../components/Motion';
import PillarBubble from '../components/PillarBubble';
import ProfileAvatar from '../components/ProfileAvatar';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import LanguagePicker from '../components/LanguagePicker';
import { LANGUAGE_OPTIONS } from '../i18n/languages';
import { useToast } from '../components/Toast';
import Card from '../components/Card';
import {
  BackdropGlyph,
  BellGlyph,
  CameraGlyph,
  ChevronGlyph,
  FaceGlyph,
  IconProps,
  ClockGlyph,
  LockGlyph,
  StarGlyph,
  FlameGlyph,
  HelpGlyph,
  PencilGlyph,
  SettingsGlyph,
  GlobeGlyph,
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

type SectionKey = 'avatar' | 'theme' | 'language' | 'goals' | 'privacy' | 'help';

/** A row inside an opened "Make GROW yours" group. */
function SubRow({
  label,
  value,
  onPress,
  danger = false,
  icon: Icon,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  icon?: (props: IconProps) => React.ReactElement;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.subRow, pressed && onPress && styles.pressed]}
    >
      <View style={styles.subLeft}>
        {Icon ? <Icon size={18} color={danger ? colors.danger : colors.inkSoft} /> : null}
        <Txt
          variant="body"
          color={danger ? colors.danger : colors.ink}
          style={Icon ? styles.subLabel : undefined}
        >
          {label}
        </Txt>
      </View>
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
      accessibilityLabel={label}
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
      <View style={open ? (i18n.dir(i18n.language) === 'rtl' ? styles.chevronOpenRtl : styles.chevronOpen) : undefined}>
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
  const { t } = useTranslation();
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
      if (!user) throw new Error(i18n.t('errors.notSignedIn'));

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
          message: t('profile.yourExportIsReady'),
        });
      }
    } catch (error) {
      toast.showToast({
        message:
          error instanceof Error
            ? error.message
            : t('profile.exportIsNotAvailable'),
      });
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.thisPermanentlyRemovesYour'),
      [
        { text: t('profile.keepMyAccount'), style: 'cancel' },
        {
          text: t('profile.continue'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('profile.areYouCertain'),
              t('profile.everythingTiedToThis'),
              [
                { text: t('profile.cancel'), style: 'cancel' },
                {
                  text: t('profile.deletePermanently'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { error } = await supabase.functions.invoke(
                        'delete-account',
                      );
                      if (error) throw error;
                      toast.showToast({
                        message: t('profile.yourAccountHasBeen'),
                      });
                      dispatch(logout());
                    } catch (error) {
                      toast.showToast({
                        message:
                          error instanceof Error
                            ? error.message
                            : t('profile.couldNotDeleteThe'),
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
    Alert.alert(t('profile.signOut'), t('profile.youCanSignBack'), [
      { text: t('profile.stay'), style: 'cancel' },
      {
        text: t('profile.signOut'),
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
              {t('profile.aLittleMoreYou')}
            </Txt>
            <Txt variant="title" style={styles.headingTitle}>
              {t('profile.yourProfile')}
            </Txt>
          </FadeInUp>

          <FadeInUp delay={60} style={styles.identity}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t('profile.editYourAvatar')}
              onPress={() => navigation.navigate('AvatarCreator')}
              pressedScale={0.95}
              style={styles.avatarRim}
            >
              <ProfileAvatar profile={profile} size={108} mood="happy" />
            </PressableScale>
            <View style={styles.identityText}>
              <Txt variant="title" numberOfLines={1}>
                {profile?.first_name ?? t('profile.you')}
              </Txt>
              {profile?.username ? (
                <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                  {`@${profile.username}`}
                </Txt>
              ) : null}
              <View style={styles.inline}>
                <SparklesGlyph />
                <Txt variant="label" color={colors.accent} style={styles.inlineText} numberOfLines={1}>
                  {t('profile.level', { level: gamification.level, title })}
                </Txt>
              </View>
              <View style={styles.identityActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.editProfile')}
                  onPress={() => navigation.navigate('AvatarCreator')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.actionPill, pressed && styles.pressed]}
                >
                  <PencilGlyph size={14} />
                  <Txt variant="bodySemi" color={colors.accent} style={styles.actionText}>
                    {t('profile.edit')}
                  </Txt>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.shareProfile')}
                  onPress={() => setSharing(true)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.actionPill, pressed && styles.pressed]}
                >
                  <ShareGlyph size={15} />
                  <Txt variant="bodySemi" color={colors.accent} style={styles.actionText}>
                    {t('profile.share')}
                  </Txt>
                </Pressable>
              </View>
            </View>
          </FadeInUp>

          {profile?.avatar_mode !== 'photo' ? (
            <FadeInUp delay={90}>
              <BecomingCard
                avatarConfig={profile?.avatar_config}
                onEdit={(who) => navigation.navigate('AvatarCreator', { who })}
              />
            </FadeInUp>
          ) : null}

          <FadeInUp delay={120} style={styles.growth}>
            <View style={styles.growthHeader}>
              <Txt variant="heading">{t('common.xp', { count: totalXp, formatted: totalXp.toLocaleString(appLocale()) })}</Txt>
              <Txt variant="label" color={colors.inkSoft}>
                {t('profile.levelAhead', { level: gamification.level + 1 })}
              </Txt>
            </View>
            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Txt variant="caption" color={colors.inkSoft}>
              {t('profile.xpToYourNext', { xp: toNext.toLocaleString(appLocale()) })}
            </Txt>
            <View style={styles.streakPill}>
              <FlameGlyph />
              <View style={styles.streakText}>
                <Txt variant="bodySemi" color={colors.accent}>
                  {streak > 0 ? t('profile.dayStreak', { streak }) : t('profile.startAStreakToday')}
                </Txt>
                <Txt variant="caption" color={colors.inkSoft}>
                  {streak > 0
                    ? t('profile.smallStepsRealMomentum')
                    : bestStreakLabel(gamification.bestStreak)}
                </Txt>
              </View>
            </View>
          </FadeInUp>

          <FadeInUp delay={180}>
            <View style={styles.sectionHeader}>
              <Txt variant="heading">{t('profile.yourPillars')}</Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                {t('profile.todaySBalance')}
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

          {/* Settings, grouped by what they are about. Only the group
              headers and rows show; details fold away until opened. */}
          <FadeInUp delay={240}>
            <Txt variant="heading" style={styles.sectionTitle}>
              {t('profile.makeGrowYours')}
            </Txt>

            <Txt variant="label" style={styles.groupLabel}>
              {t('profile.you')}
            </Txt>
            <Card padded={false} style={styles.settings}>
              <SettingsRow
                icon={<FaceGlyph size={20} color={colors.ink} />}
                label={t('profile.avatarPhoto')}
                detail={t('profile.howYouShowUp')}
                open={openSection === 'avatar'}
                onPress={() => toggle('avatar')}
              />
              {openSection === 'avatar' ? (
                <View style={styles.subList}>
                  <SubRow
                    icon={PencilGlyph}
                    label={t('profile.editAvatar')}
                    onPress={() => navigation.navigate('AvatarCreator')}
                  />
                  <SubRow
                    icon={SparklesGlyph}
                    label={t('profile.aiAvatarFromA')}
                    onPress={() => navigation.navigate('AiAvatar')}
                  />
                  <SubRow
                    icon={CameraGlyph}
                    label={t('profile.profilePicture')}
                    value={
                      profile?.avatar_mode === 'ai'
                        ? t('profile.aiAvatar')
                        : profile?.avatar_mode === 'photo'
                          ? t('profile.photo')
                          : t('profile.avatar')
                    }
                    onPress={() => navigation.navigate('EditPhoto')}
                  />
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<BackdropGlyph size={20} color={colors.ink} />}
                label={t('profile.appearance')}
                detail={t('profile.theme', { name: theme.name })}
                open={openSection === 'theme'}
                onPress={() => toggle('theme')}
              />
              {openSection === 'theme' ? (
                <View style={[styles.subList, styles.themeBlock]}>
                  <View style={styles.themeGrid}>
                    {THEME_LIST.map((option) => {
                      const selected = option.id === theme.id;
                      return (
                        <Pressable
                          key={option.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={t('profile.theme', { name: option.name })}
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
              ) : null}
            </Card>

            <Txt variant="label" style={styles.groupLabel}>
              {t('profile.growth')}
            </Txt>
            <Card padded={false} style={styles.settings}>
              <SettingsRow
                icon={<SettingsGlyph />}
                label={t('profile.goalsPillars')}
                detail={t('profile.chooseWhatMattersTo')}
                open={openSection === 'goals'}
                onPress={() => toggle('goals')}
              />
              {openSection === 'goals' ? (
                <View style={styles.subList}>
                  <SubRow label={t('profile.workouts')} value={t('profile.perWeek', { value: goals?.workouts_per_week ?? '-' })} />
                  <SubRow label={t('profile.sleep')} value={t('profile.hours', { value: goals?.sleep_target_hours ?? '-' })} />
                  <SubRow label={t('profile.water')} value={t('profile.liters', { value: goals?.water_liters_per_day ?? '-' })} />
                  <SubRow label={t('profile.callingParents')} value={goals?.call_parents_frequency ? labelFor('options', goals.call_parents_frequency) : '-'} />
                  <SubRow
                    label={t('profile.deepWork')}
                    value={t('profile.hoursPerWeek', { value: goals?.deep_work_hours_per_week ?? '-' })}
                  />
                  <SubRow label={t('profile.funTime')} value={t('profile.hoursPerWeek', { value: goals?.weekly_fun_hours ?? '-' })} />
                  <SubRow
                    label={t('profile.practice')}
                    value={
                      goals?.prayer_frequency === '5_daily'
                        ? t('profile.n5DailyPrayers')
                        : `${goals?.prayer_frequency ?? '-'}`
                    }
                  />
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<StarGlyph size={20} color={colors.ink} />}
                label={t('profile.achievements')}
                detail={t('profile.badgesYouHaveEarned')}
                onPress={() => navigation.navigate('Achievements')}
              />
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<UserGlyph />}
                label={t('profile.friends')}
                detail={t('profile.inviteCompareCheerOn')}
                onPress={() => navigation.navigate('Friends')}
              />
            </Card>

            <Txt variant="label" style={styles.groupLabel}>
              {t('profile.preferences')}
            </Txt>
            <Card padded={false} style={styles.settings}>
              <SettingsRow
                icon={<GlobeGlyph size={20} color={colors.ink} />}
                label={t('language.title')}
                detail={
                  LANGUAGE_OPTIONS.find((option) => option.code === i18n.language)?.nativeName ??
                  'English'
                }
                open={openSection === 'language'}
                onPress={() => toggle('language')}
              />
              {openSection === 'language' ? (
                <View style={styles.subList}>
                  <LanguagePicker />
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<BellGlyph size={20} color={colors.ink} />}
                label={t('profile.reminders')}
                detail={t('profile.dailyCheckInsAnd')}
                onPress={() => navigation.navigate('NotificationSettings')}
              />
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<ClockGlyph size={20} color={colors.ink} />}
                label={t('profile.timezone')}
                detail={profile?.timezone ?? 'UTC'}
                onPress={() => navigation.navigate('TimezonePicker')}
              />
            </Card>

            <Txt variant="label" style={styles.groupLabel}>
              {t('profile.accountHelp')}
            </Txt>
            <Card padded={false} style={styles.settings}>
              <SettingsRow
                icon={<HelpGlyph />}
                label={t('profile.helpSupport')}
                detail={t('profile.weReHereFor')}
                open={openSection === 'help'}
                onPress={() => toggle('help')}
              />
              {openSection === 'help' ? (
                <View style={styles.subList}>
                  <SubRow
                    label={t('profile.askYourCoach')}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'Coach' })}
                  />
                  <SubRow label={t('profile.termsOfService')} onPress={() => navigation.navigate('TermsOfService')} />
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<ShieldCheckGlyph />}
                label={t('profile.privacyData')}
                detail={t('profile.yourDataYourChoices')}
                open={openSection === 'privacy'}
                onPress={() => toggle('privacy')}
              />
              {openSection === 'privacy' ? (
                <View style={styles.subList}>
                  <SubRow label={t('profile.privacyPolicy')} onPress={() => navigation.navigate('PrivacyPolicy')} />
                  <SubRow
                    label={exporting ? t('profile.preparingExport') : t('profile.exportMyData')}
                    onPress={exporting ? undefined : exportData}
                  />
                  <SubRow label={t('profile.deleteAccount')} danger onPress={deleteAccount} />
                </View>
              ) : null}
              <Hairline style={styles.divider} />
              <SettingsRow
                icon={<LockGlyph size={20} color={colors.ink} />}
                label={t('profile.signOut')}
                detail={t('profile.youCanSignBack2')}
                onPress={confirmLogout}
              />
            </Card>
          </FadeInUp>

          <View style={styles.footer}>
            <Txt variant="caption" color={colors.inkSoft}>
              {t('profile.growAtYourOwn')}
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
      marginStart: 22,
      gap: spacing.sm,
    },
    inline: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    inlineText: {
      marginStart: 6,
      flexShrink: 1,
    },
    actionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 36,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, 0.35),
      backgroundColor: withAlpha(colors.accent, 0.08),
    },
    actionText: {
      marginStart: 6,
      fontSize: 14,
    },
    identityActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: spacing.sm,
      rowGap: spacing.xs,
      marginTop: spacing.xs,
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
      paddingVertical: 2,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
    },
    groupLabel: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      marginStart: spacing.xs,
    },
    subLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
    },
    subLabel: {
      marginStart: spacing.md,
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
      marginStart: spacing.md,
    },
    chevronOpen: {
      transform: [{ rotate: '90deg' }],
    },
    // The chevron is mirrored in right-to-left, so it turns the other way.
    chevronOpenRtl: {
      transform: [{ rotate: '-90deg' }],
    },
    divider: {
      backgroundColor: colors.line,
    },
    subList: {
      marginStart: 48,
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
      marginStart: spacing.md,
    },
    subValue: {
      marginEnd: spacing.xs,
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
      justifyContent: 'center',
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
