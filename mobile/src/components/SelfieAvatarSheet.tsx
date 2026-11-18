// "Make it look like me": take or pick a selfie, let the AI read it, and
// load the result into the avatar editor. If the AI fails or is too slow,
// the editor gets a random avatar instead, so the person is never stuck.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomAvatarConfig } from '../avatar/options';
import { applySelfieResult, resultNote } from '../avatar/selfie';
import type { AvatarConfig } from '../avatar/types';
import { openAppSettings } from '../lib/profilePhoto';
import { captureSelfie, SelfieError, selfieSources, startSelfieJob, waitForSelfieJob, type SelfieSource } from '../lib/selfieAvatar';
import { colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { PressableScale } from './Motion';
import Txt from './Txt';

interface Props {
  visible: boolean;
  config: AvatarConfig | null;
  level: number;
  /** The new avatar and a sentence on what was matched. */
  onApply: (next: AvatarConfig, note: string) => void;
  onClose: () => void;
}

type Step = 'idle' | 'upload' | 'read';

const SOURCE_LABEL: Record<SelfieSource, string> = {
  camera: 'Take a selfie',
  gallery: 'Choose a photo',
};

export default function SelfieAvatarSheet({ visible, config, level, onApply, onClose }: Props) {
  useTheme();
  const [step, setStep] = useState<Step>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  // Closing the sheet or leaving the screen stops the polling.
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = !visible;
    if (!visible) {
      setStep('idle');
      setMessage(null);
      setNeedsSettings(false);
    }
  }, [visible]);
  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const busy = step !== 'idle';

  const start = async (source: SelfieSource) => {
    if (!config || busy) return;
    setMessage(null);
    setNeedsSettings(false);
    try {
      const bytes = await captureSelfie(source);
      if (cancelled.current) return;
      setStep('upload');
      const jobId = await startSelfieJob(bytes);
      if (cancelled.current) return;
      setStep('read');
      const outcome = await waitForSelfieJob(jobId, () => cancelled.current);
      if (outcome.kind === 'cancelled' || cancelled.current) return;
      if (outcome.kind === 'completed' && outcome.result && outcome.result.source === 'ai') {
        onApply(applySelfieResult(config, outcome.result), resultNote(outcome.result, null));
      } else if (outcome.kind === 'completed' && outcome.result) {
        // The server already fell back: use its random reading.
        onApply(applySelfieResult(config, outcome.result), resultNote(outcome.result, outcome.error));
      } else {
        // Failed or no answer within 60 s: a random avatar, made here.
        onApply(randomAvatarConfig(level), resultNote(null, outcome.kind === 'failed' ? outcome.error : 'timeout'));
      }
    } catch (e) {
      if (cancelled.current) return;
      if (e instanceof SelfieError) {
        if (e.code !== 'cancelled') setMessage(e.message);
        setNeedsSettings(e.code === 'permission');
      } else {
        setMessage('Something went wrong. Try again.');
      }
    } finally {
      if (!cancelled.current) setStep('idle');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Txt variant="title">Make it look like me</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Txt variant="bodySemi">{busy ? 'Cancel' : 'Close'}</Txt>
          </Pressable>
        </View>
        <Txt variant="body" color={colors.inkSoft} style={styles.intro}>
          Take a clear, front-facing selfie in good light. The AI picks your skin tone, hairstyle, hair color, eye color and
          glasses. Your photo is private, used once, then deleted.
        </Txt>

        <View style={styles.frame}>
          {busy ? (
            <View style={styles.center} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.accent} />
              <Txt variant="bodySemi">{step === 'upload' ? 'Uploading your photo…' : 'Reading your photo…'}</Txt>
              <Txt variant="caption" color={colors.inkSoft}>This usually takes 5 to 15 seconds.</Txt>
            </View>
          ) : (
            <View style={styles.center}>
              <Txt variant="caption" color={colors.inkSoft}>Face the camera, no hat, hair visible.</Txt>
            </View>
          )}
        </View>

        {message ? (
          <Txt variant="caption" color={colors.inkSoft} style={styles.message} accessibilityLiveRegion="polite">
            {message}
          </Txt>
        ) : null}

        <View style={styles.actions}>
          {selfieSources().map((source, i) => (
            <PressableScale
              key={source}
              accessibilityRole="button"
              accessibilityLabel={SOURCE_LABEL[source]}
              accessibilityState={{ disabled: busy || !config }}
              onPress={() => start(source)}
              disabled={busy || !config}
              style={[i === 0 ? styles.primary : styles.secondary, (busy || !config) && styles.dim]}
            >
              <Txt variant="bodySemi" color={i === 0 ? colors.onAccent : colors.ink}>{SOURCE_LABEL[source]}</Txt>
            </PressableScale>
          ))}
          {needsSettings ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Open settings to allow camera and photos"
              onPress={openAppSettings}
              style={styles.secondary}
            >
              <Txt variant="bodySemi">Open settings</Txt>
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
    frame: { alignSelf: 'center', width: '100%', aspectRatio: 1, maxHeight: '50%', borderRadius: radius.lg, backgroundColor: colors.card },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    message: { marginTop: spacing.sm, textAlign: 'center' },
    actions: { gap: spacing.sm, marginTop: spacing.md },
    primary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    secondary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    dim: { opacity: 0.5 },
  }),
);
