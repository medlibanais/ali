import React, { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Card from '../components/Card';
import ProfileAvatar from '../components/ProfileAvatar';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import {
  openAppSettings,
  pickAndUploadPhoto,
  PhotoError,
  removePhoto,
  setAvatarMode,
} from '../lib/profilePhoto';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { AppStackParamList } from '../navigation/types';
import { fetchProfile } from '../store/slices/userSlice';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Busy = 'camera' | 'gallery' | 'remove' | 'mode' | null;

export function EditPhotoScreen() {
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { profile, loading } = useAppSelector((state) => state.user);
  const [busy, setBusy] = useState<Busy>(null);

  const mode = profile?.avatar_mode ?? 'avatar';
  const hasPhoto = Boolean(profile?.avatar_url ?? profile?.photo_url);
  const hasAiAvatar = Boolean(profile?.ai_avatar_url);

  const handleError = (error: unknown) => {
    if (error instanceof PhotoError && error.code === 'cancelled') return;
    if (error instanceof PhotoError && error.code === 'permission') {
      Alert.alert('Permission needed', error.message, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: openAppSettings },
      ]);
      return;
    }
    toast.showToast({
      message:
        error instanceof Error ? error.message : 'Something went wrong.',
    });
  };

  const pick = async (source: 'camera' | 'gallery') => {
    setBusy(source);
    try {
      await pickAndUploadPhoto(source);
      await dispatch(fetchProfile());
      toast.showToast({ message: 'Your photo is updated.' });
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(null);
    }
  };

  const switchMode = async (next: 'avatar' | 'photo' | 'ai') => {
    if (next === mode || busy) return;
    if (next === 'ai' && !hasAiAvatar) {
      navigation.navigate('AiAvatar');
      return;
    }
    if (next === 'photo' && !hasPhoto) {
      toast.showToast({ message: 'Add a photo first, then switch modes.' });
      return;
    }
    setBusy('mode');
    try {
      await setAvatarMode(next);
      await dispatch(fetchProfile());
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = () => {
    Alert.alert(
      'Remove photo',
      'Your photo is deleted from storage. Your avatar stays as it is.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy('remove');
            try {
              await removePhoto();
              await dispatch(fetchProfile());
              toast.showToast({ message: 'Photo removed.' });
            } catch (error) {
              handleError(error);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        Profile photo
      </Txt>
      <Txt variant="body" color={colors.inkSoft} style={styles.subtitle}>
        Show your custom avatar or a real photo — your choice, change anytime.
      </Txt>

      <View style={styles.preview}>
        {loading && !profile ? (
          <Skeleton width={140} height={140} borderRadius={70} />
        ) : (
          <ProfileAvatar profile={profile} size={140} mood="happy" animated={false} />
        )}
        <Txt variant="caption" color={colors.inkFaint} style={styles.previewNote}>
          {mode === 'ai'
            ? 'Showing your AI avatar'
            : mode === 'photo'
              ? 'Showing your photo'
              : 'Showing your avatar'}
        </Txt>
      </View>

      <Card padded={false} style={styles.card}>
        <Button
          title={hasAiAvatar ? 'Use my AI avatar' : 'Create an AI avatar'}
          variant={mode === 'ai' ? 'primary' : 'ghost'}
          onPress={() => switchMode('ai')}
          loading={busy === 'mode' && mode !== 'ai'}
          style={styles.modeButton}
        />
        <Button
          title="Use my avatar"
          variant={mode === 'avatar' ? 'primary' : 'ghost'}
          onPress={() => switchMode('avatar')}
          loading={busy === 'mode' && mode !== 'avatar'}
          style={styles.modeButton}
        />
        <Button
          title="Use my photo"
          variant={mode === 'photo' ? 'primary' : 'ghost'}
          onPress={() => switchMode('photo')}
          loading={busy === 'mode' && mode !== 'photo'}
          style={styles.modeButton}
        />
      </Card>

      <Card style={styles.card}>
        <Txt variant="label" style={styles.cardLabel}>
          {hasPhoto ? 'Replace photo' : 'Add a photo'}
        </Txt>
        <Button
          title="Take a photo"
          onPress={() => pick('camera')}
          loading={busy === 'camera'}
          disabled={busy !== null}
          style={styles.actionButton}
        />
        <Button
          title="Choose from gallery"
          variant="secondary"
          onPress={() => pick('gallery')}
          loading={busy === 'gallery'}
          disabled={busy !== null}
          style={styles.actionButton}
        />
        <Txt variant="caption" color={colors.inkFaint} style={styles.hint}>
          Square crop, resized to 512px, compressed under 500 KB. JPG, PNG and
          HEIC are converted automatically.
        </Txt>
      </Card>

      {hasPhoto ? (
        <Button
          title="Remove photo"
          variant="ghost"
          onPress={confirmRemove}
          loading={busy === 'remove'}
          disabled={busy !== null}
          style={styles.removeButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.lg },
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.lg },
  preview: { alignItems: 'center', marginVertical: spacing.xl },
  previewNote: { marginTop: spacing.md },
  card: { marginBottom: spacing.lg },
  modeButton: { margin: spacing.sm },
  cardLabel: { marginBottom: spacing.md, textTransform: 'uppercase' },
  actionButton: { marginBottom: spacing.sm },
  hint: { marginTop: spacing.sm },
  removeButton: { marginBottom: spacing.xl },
});

export default EditPhotoScreen;
