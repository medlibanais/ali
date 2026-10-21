// ShareStorySheet: previews the StoryCard and hands a 1080x1920 PNG to the
// system share sheet (Instagram / WhatsApp / Snapchat stories, Messages...).
// Pulls its numbers from the store so any screen can open it.

import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import Button from '../../components/Button';
import { useToast } from '../../components/Toast';
import Txt from '../../components/Txt';
import { titleForLevel } from '../../lib/levels';
import { useAppSelector } from '../../store/hooks';
import { colors, spacing } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { STORY_ASPECT, StoryCard, type StoryCardData } from './StoryCard';

export function useStoryCardData(weekAvg: number | null): StoryCardData {
  const { profile } = useAppSelector((state) => state.user);
  const quests = useAppSelector((state) => state.quests);
  const gamification = useAppSelector((state) => state.gamification);
  return {
    profile,
    firstName: profile?.first_name ?? null,
    score: Math.round(quests.dailyLifeScore ?? 0),
    pillars: quests.pillarScores,
    streak: gamification.currentStreak,
    level: gamification.level,
    levelTitle: titleForLevel(gamification.level),
    weekAvg,
  };
}

export function ShareStorySheet({
  visible,
  onClose,
  weekAvg = null,
}: {
  visible: boolean;
  onClose: () => void;
  weekAvg?: number | null;
}) {
  useTheme();
  const toast = useToast();
  const data = useStoryCardData(weekAvg);
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  // Fit the 9:16 preview between the header and the buttons.
  const previewWidth = Math.min(winW - spacing.xl * 2, (winH - 220) / STORY_ASPECT, 360);

  const share = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        toast.showToast({ message: 'Sharing works in the phone app, not in the browser.' });
        return;
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        height: 1920,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Share your progress',
      });
    } catch {
      toast.showToast({ message: 'Could not create the image. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
        <View style={styles.header}>
          <Txt variant="heading">Share as a story</Txt>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Txt variant="bodySemi" color={colors.accent}>
              Close
            </Txt>
          </Pressable>
        </View>
        <View style={styles.preview}>
          <View ref={cardRef} collapsable={false}>
            <StoryCard data={data} width={previewWidth} />
          </View>
        </View>
        <View style={styles.actions}>
          <Button title="Share" onPress={share} loading={busy} />
          <Txt variant="caption" color={colors.inkFaint} align="center" style={styles.hint}>
            Pick Instagram, WhatsApp or Snapchat, then post it to your story.
          </Txt>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  hint: {
    marginTop: spacing.sm,
  },
});

export default ShareStorySheet;
