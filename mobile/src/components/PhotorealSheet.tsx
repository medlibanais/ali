// "Make a photo": turns the avatar being built into a photograph of that
// same character. Draws it large, sends it to the photo maker, then shows
// the result with the choice to keep it as the profile picture.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AvatarConfig } from '../avatar/types';
import { AiAvatarError } from '../lib/aiAvatar';
import { makePhotoreal, setPhotoAsProfilePicture, type PhotoView } from '../lib/photoreal';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProfile } from '../store/slices/userSlice';
import { colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { PressableScale } from './Motion';
import Txt from './Txt';

interface Props {
  visible: boolean;
  config: AvatarConfig | null;
  onClose: () => void;
}

const VIEWS: { id: PhotoView; label: string }[] = [
  { id: 'portrait', label: 'Portrait' },
  { id: 'full', label: 'Full body' },
];

export default function PhotorealSheet({ visible, config, onClose }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.user.profile);
  const [view, setView] = useState<PhotoView>('portrait');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A photo made in this sitting, shown before the profile reloads.
  const [fresh, setFresh] = useState<Partial<Record<PhotoView, string>>>({});
  const [kept, setKept] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const saved = view === 'full' ? profile?.photoreal_body_url : profile?.photoreal_head_url;
  const url = fresh[view] ?? saved ?? null;

  const make = async () => {
    if (!config || busy) return;
    setBusy(true);
    setMessage(null);
    setKept(false);
    try {
      const result = await makePhotoreal(config, view);
      if (!alive.current) return;
      setFresh((f) => ({ ...f, [view]: result.url }));
      dispatch(fetchProfile());
      setMessage(result.remainingToday > 0 ? `${result.remainingToday} more today.` : 'That was the last one for today.');
    } catch (e) {
      if (alive.current) setMessage(e instanceof AiAvatarError ? e.message : 'We could not make the photo this time. Try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const keep = async () => {
    if (!url || busy) return;
    setBusy(true);
    try {
      await setPhotoAsProfilePicture(url);
      dispatch(fetchProfile());
      if (alive.current) setKept(true);
    } catch (e) {
      if (alive.current) setMessage(e instanceof AiAvatarError ? e.message : 'We could not save that. Try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Txt variant="title">Make a photo</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Txt variant="bodySemi">Done</Txt>
          </Pressable>
        </View>
        <Txt variant="caption" color={colors.inkSoft} style={styles.intro}>
          Turns the avatar you are building into a photograph of that same person. It uses one of today&apos;s five.
        </Txt>
        <View style={styles.views} accessibilityRole="tablist">
          {VIEWS.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="tab"
              accessibilityLabel={v.label}
              accessibilityState={{ selected: view === v.id }}
              onPress={() => {
                setView(v.id);
                setMessage(null);
                setKept(false);
              }}
              style={[styles.view, view === v.id && styles.viewOn]}
            >
              <Txt variant="caption" color={view === v.id ? colors.onAccent : colors.ink}>{v.label}</Txt>
            </Pressable>
          ))}
        </View>
        <View style={[styles.frame, view === 'full' ? styles.frameTall : styles.frameSquare]}>
          {url && !busy ? (
            <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Photo of your avatar" />
          ) : busy ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Txt variant="caption" color={colors.inkSoft}>Making your photo. This takes about 20 seconds.</Txt>
            </View>
          ) : (
            <View style={styles.center}>
              <Txt variant="caption" color={colors.inkSoft}>No photo yet.</Txt>
            </View>
          )}
        </View>
        {message ? <Txt variant="caption" color={colors.inkSoft} style={styles.message}>{message}</Txt> : null}
        <View style={styles.actions}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={url ? 'Make another photo' : 'Make the photo'}
            onPress={make}
            disabled={busy || !config}
            style={[styles.primary, (busy || !config) && styles.dim]}
          >
            <Txt variant="bodySemi" color={colors.onAccent}>{url ? 'Make another' : 'Make the photo'}</Txt>
          </PressableScale>
          {url && view === 'portrait' ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Use this photo as my profile picture"
              onPress={keep}
              disabled={busy || kept}
              style={[styles.secondary, (busy || kept) && styles.dim]}
            >
              <Txt variant="bodySemi">{kept ? 'Your profile picture' : 'Use as my profile picture'}</Txt>
            </PressableScale>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
    close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    intro: { marginBottom: spacing.md },
    views: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    view: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    viewOn: { backgroundColor: colors.accent },
    frame: { alignSelf: 'center', width: '100%', maxHeight: '58%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card },
    frameSquare: { aspectRatio: 1 },
    frameTall: { aspectRatio: 9 / 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    message: { marginTop: spacing.sm, textAlign: 'center' },
    actions: { gap: spacing.sm, marginTop: spacing.md },
    primary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    secondary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    dim: { opacity: 0.5 },
  }),
);
