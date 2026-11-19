// AiAvatarScreen: take or pick a photo, get the AI "Future Self" avatar.
// Used right after onboarding and from Profile. The hand-built SVG creator
// is always one tap away, and stays the fallback when generation fails.

import React, { useEffect, useRef, useState } from 'react';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import ProfileAvatar from '../components/ProfileAvatar';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { AiAvatarError, pickAndGenerateAiAvatar } from '../lib/aiAvatar';
import { openAppSettings, PhotoError } from '../lib/profilePhoto';
import type {
  AppStackParamList,
  OnboardingStackParamList,
} from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { onboardingCompletedLocally } from '../store/slices/authSlice';
import { fetchProfile } from '../store/slices/userSlice';
import { borderWidth, colors, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { showAlert } from '../lib/alert';

type Props = NativeStackScreenProps<
  AppStackParamList & OnboardingStackParamList,
  'AiAvatar'
>;

type Phase = 'idle' | 'preparing' | 'generating' | 'done';

const PREVIEW = 220;

const PROGRESS_LINES = (): string[] => [
  i18n.t('aiAvatar.readingYourPhoto'),
  i18n.t('aiAvatar.meetingYourFutureSelf'),
  i18n.t('aiAvatar.addingTheGlow'),
  i18n.t('aiAvatar.almostThere'),
];

export function AiAvatarScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const profile = useAppSelector((state) => state.user.profile);

  const [phase, setPhase] = useState<Phase>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== 'generating') return undefined;
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [phase]);

  // Warm the image cache so the result appears the moment it is ready.
  useEffect(() => {
    if (resultUrl) Image.prefetch(resultUrl).catch(() => undefined);
  }, [resultUrl]);

  const busy = phase === 'preparing' || phase === 'generating';

  const generate = async (source: 'camera' | 'gallery') => {
    setError(null);
    setPhase('preparing');
    try {
      const result = await pickAndGenerateAiAvatar(source, () =>
        setPhase('generating'),
      );
      setResultUrl(result.url);
      setPhase('done');
      dispatch(fetchProfile());
    } catch (e) {
      setPhase(resultUrl ? 'done' : 'idle');
      if (e instanceof PhotoError) {
        if (e.code === 'cancelled') return;
        if (e.code === 'permission') {
          showAlert(t('aiAvatar.permissionNeeded'), e.message, [
            { text: t('aiAvatar.notNow'), style: 'cancel' },
            { text: t('aiAvatar.openSettings'), onPress: openAppSettings },
          ]);
          return;
        }
        setError(e.message);
        return;
      }
      setError(
        e instanceof AiAvatarError || e instanceof Error
          ? e.message
          : t('aiAvatar.somethingWentWrong'),
      );
    }
  };

  const keep = () => {
    if (fromOnboarding) {
      dispatch(onboardingCompletedLocally());
      return;
    }
    toast.showToast({ message: t('aiAvatar.yourAiAvatarIs') });
    navigation.goBack();
  };

  const designByHand = () => {
    navigation.navigate('AvatarCreator', { fromOnboarding });
  };

  const progressLine =
    PROGRESS_LINES()[Math.min(PROGRESS_LINES().length - 1, Math.floor(elapsed / 3))];

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        {phase === 'done' ? t('aiAvatar.thisIsYouLevelled') : t('aiAvatar.meetYourFutureSelf')}
      </Txt>
      <Txt variant="body" color={colors.inkSoft} style={styles.subtitle}>
        {phase === 'done'
          ? t('aiAvatar.yourAvatarGrowsWith')
          : t('aiAvatar.takeASelfieOr')}
      </Txt>

      <View style={styles.preview}>
        {resultUrl ? (
          <Image
            source={{ uri: resultUrl }}
            style={styles.resultImage}
            accessibilityLabel={t('aiAvatar.yourAiAvatar')}
          />
        ) : (
          <View style={busy ? styles.dimmed : undefined}>
            <ProfileAvatar
              profile={profile}
              size={PREVIEW}
              mood="happy"
              animated={busy}
            />
          </View>
        )}
        {busy ? (
          <Txt variant="bodySemi" color={colors.accent} style={styles.progress}>
            {phase === 'preparing' ? t('aiAvatar.preparingYourPhoto') : progressLine}
          </Txt>
        ) : null}
        {phase === 'generating' ? (
          <Txt variant="caption" color={colors.inkFaint}>
            {t('aiAvatar.sUsuallyUnder15', { elapsed })}
          </Txt>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Txt variant="body" color={colors.ink}>
            {error}
          </Txt>
        </View>
      ) : null}

      {phase === 'done' ? (
        <Button title={t('aiAvatar.keepThisAvatar')} onPress={keep} style={styles.action} />
      ) : null}
      <Button
        title={phase === 'done' ? t('aiAvatar.tryAnotherSelfie') : t('aiAvatar.takeASelfie')}
        variant={phase === 'done' ? 'secondary' : 'primary'}
        onPress={() => generate('camera')}
        disabled={busy}
        loading={busy}
        style={styles.action}
      />
      <Button
        title={t('aiAvatar.chooseAPhoto')}
        variant="secondary"
        onPress={() => generate('gallery')}
        disabled={busy}
        style={styles.action}
      />
      <Button
        title={t('aiAvatar.designItByHand')}
        variant="ghost"
        onPress={designByHand}
        disabled={busy}
        style={styles.action}
      />
      <Txt variant="caption" color={colors.inkFaint} style={styles.hint}>
        {t('aiAvatar.yourPhotoIsSent')}
      </Txt>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    title: { marginTop: spacing.lg },
    subtitle: { marginTop: spacing.sm },
    preview: {
      alignItems: 'center',
      marginVertical: spacing.xl,
      minHeight: PREVIEW + spacing.xxl,
    },
    resultImage: {
      width: PREVIEW,
      height: PREVIEW,
      borderRadius: PREVIEW / 2,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
    },
    dimmed: { opacity: 0.5 },
    progress: { marginTop: spacing.lg, marginBottom: spacing.xs },
    errorBox: {
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      backgroundColor: colors.paperAlt,
    },
    action: { marginBottom: spacing.sm },
    hint: { marginTop: spacing.md, marginBottom: spacing.xl },
  }),
);

export default AiAvatarScreen;
