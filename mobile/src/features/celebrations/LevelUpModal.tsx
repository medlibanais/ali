// Full-screen level-up takeover.
//   1. A dark overlay fades in and the avatar scales up in the center.
//   2. A gold progress ring draws around it, then explodes into particles
//      (a radial confetti burst) as the ring flies apart.
//   3. "LEVEL 12: DISCIPLINED HUMAN" rises in, and a card flips in 3D from
//      the old title (or level) to the new one.
//   4. "Share to Instagram" shares a picture of the moment (phone app only).
// It always uses the Neon palette, like the story card: it is the moment
// people share, so it looks like GROW whatever theme is set.

import * as Sharing from 'expo-sharing';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import Button from '../../components/Button';
import ProfileAvatar from '../../components/ProfileAvatar';
import { ShareGlyph } from '../../components/icons';
import Txt from '../../components/Txt';
import { useAppSelector } from '../../store/hooks';
import { THEMES } from '../../theme/themes';
import { fonts, radius, spacing } from '../../theme/tokens';
import ConfettiBurst from './ConfettiBurst';
import type { LevelUpInfo } from './logic';

const N = THEMES.neon.colors;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STAGE = 230;
const RING_R = 100;
const RING_LEN = 2 * Math.PI * RING_R;
const AVATAR = 150;

// Timeline (ms from open).
const RING_START = 350;
const RING_MS = 900;
const BURST_AT = RING_START + RING_MS;
const TEXT_AT = BURST_AT + 100;
const FLIP_AT = BURST_AT + 650;
const FLIP_MS = 750;

function Face({ top, bottom, label, highlight }: { top: string; bottom: string; label: string; highlight: boolean }) {
  return (
    <>
      <Txt variant="label" color={highlight ? N.accent : N.inkSoft} align="center">
        {label}
      </Txt>
      <Txt variant="heading" color={highlight ? N.gold : N.ink} align="center" style={styles.faceTop}>
        {top}
      </Txt>
      <Txt variant="caption" color={N.inkSoft} align="center">
        {bottom}
      </Txt>
    </>
  );
}

export const LevelUpModal = memo(function LevelUpModal({
  info,
  onDismiss,
}: {
  info: LevelUpInfo;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const profile = useAppSelector((state) => state.user.profile);
  const shotRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const done = reduceMotion ? 1 : 0;
  const fade = useSharedValue(done);
  const grow = useSharedValue(done);
  const ring = useSharedValue(done);
  const burst = useSharedValue(done);
  const text = useSharedValue(done);
  const flip = useSharedValue(reduceMotion ? 180 : 0);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `Level up. Level ${info.toLevel}, ${info.toTitle}.`,
    );
    if (reduceMotion) return;
    fade.value = withTiming(1, { duration: 320 });
    grow.value = withDelay(80, withSpring(1, { mass: 1, stiffness: 140, damping: 13 }));
    ring.value = withDelay(RING_START, withTiming(1, { duration: RING_MS, easing: Easing.inOut(Easing.cubic) }));
    // Haptics: a strong impact belongs here, at BURST_AT (see the haptics work).
    burst.value = withDelay(BURST_AT, withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }));
    text.value = withDelay(TEXT_AT, withSpring(1, { mass: 1, stiffness: 120, damping: 15 }));
    flip.value = withDelay(FLIP_AT, withTiming(180, { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) }));
  }, [fade, grow, ring, burst, text, flip, info.toLevel, info.toTitle, reduceMotion]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      // Scales up from small, then a little kick when the ring bursts.
      { scale: interpolate(grow.value, [0, 1], [0.3, 1]) * (1 + 0.08 * Math.sin(Math.PI * burst.value)) },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - burst.value,
    transform: [{ scale: 1 + 0.35 * burst.value }],
  }));
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LEN * (1 - ring.value),
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, text.value),
    transform: [{ translateY: 18 * (1 - text.value) }, { scale: 0.9 + 0.1 * text.value }],
  }));
  // Both faces turn together; each hides once past edge-on, which also
  // covers Android versions that ignore backfaceVisibility.
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 90 ? Math.min(1, text.value) : 0,
    transform: [{ perspective: 900 }, { rotateY: `${flip.value}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 90 ? 1 : 0,
    transform: [{ perspective: 900 }, { rotateY: `${flip.value - 180}deg` }],
  }));

  const headline = `Level ${info.toLevel}: ${info.toTitle}`;
  const front = info.titleChanged
    ? { top: info.fromTitle, bottom: `Level ${info.fromLevel}` }
    : { top: `Level ${info.fromLevel}`, bottom: info.fromTitle };
  const back = info.titleChanged
    ? { top: info.toTitle, bottom: `Level ${info.toLevel} · new title` }
    : { top: `Level ${info.toLevel}`, bottom: info.toTitle };

  const canShare = Platform.OS !== 'web';
  const share = useCallback(async () => {
    if (!shotRef.current) return;
    setSharing(true);
    setShareNote(null);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setShareNote('Sharing is not available on this phone.');
        return;
      }
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      // The system sheet lists Instagram (feed and stories) when installed.
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Share to Instagram',
      });
    } catch {
      setShareNote('Could not create the image. Try again.');
    } finally {
      setSharing(false);
    }
  }, []);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, overlayStyle]} accessibilityViewIsModal>
        {/* Everything inside shotRef ends up in the shared picture. */}
        <View ref={shotRef} collapsable={false} style={styles.shot}>
          <Txt variant="label" color={N.accent} align="center">
            Level up
          </Txt>
          <View style={styles.stage}>
            <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
              <Svg width={STAGE} height={STAGE} viewBox={`0 0 ${STAGE} ${STAGE}`}>
                <Circle cx={STAGE / 2} cy={STAGE / 2} r={RING_R} stroke={N.paperAlt} strokeWidth={8} fill="none" />
                <AnimatedCircle
                  cx={STAGE / 2}
                  cy={STAGE / 2}
                  r={RING_R}
                  stroke={N.gold}
                  strokeWidth={8}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${RING_LEN} ${RING_LEN}`}
                  animatedProps={ringProps}
                  // Start the stroke at 12 o'clock.
                  transform={`rotate(-90 ${STAGE / 2} ${STAGE / 2})`}
                />
              </Svg>
            </Animated.View>
            <Animated.View style={[styles.avatar, avatarStyle]}>
              <ProfileAvatar profile={profile} size={AVATAR} mood="glowing" />
            </Animated.View>
            {reduceMotion ? null : (
              <ConfettiBurst
                count={44}
                shape="radial"
                speed={620}
                durationMs={1800}
                delayMs={BURST_AT}
                at={{ x: STAGE / 2, y: STAGE / 2 }}
                color={N.gold}
              />
            )}
          </View>
          <Animated.View style={textStyle}>
            <Txt variant="display" color={N.ink} align="center" style={styles.headline}>
              {headline}
            </Txt>
          </Animated.View>
          <View style={styles.card}>
            <Animated.View style={[styles.face, frontStyle]}>
              <Face {...front} label="You were" highlight={false} />
            </Animated.View>
            <Animated.View style={[styles.face, styles.faceBack, backStyle]}>
              <Face {...back} label="You are now" highlight />
            </Animated.View>
          </View>
          <Txt variant="caption" color={N.inkFaint} align="center" style={styles.brand}>
            GROW · Who are you becoming?
          </Txt>
        </View>
        <View style={styles.actions}>
          {canShare ? (
            <Button
              title="Share to Instagram"
              variant="secondary"
              icon={ShareGlyph}
              onPress={share}
              loading={sharing}
            />
          ) : null}
          {shareNote ? (
            <Txt variant="caption" color={N.inkSoft} align="center" style={styles.note}>
              {shareNote}
            </Txt>
          ) : null}
          <Button title="Keep growing" onPress={onDismiss} style={styles.keep} />
        </View>
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(4,4,6,0.94)',
  },
  shot: {
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: spacing.lg,
    backgroundColor: N.paper,
    borderRadius: radius.lg,
  },
  stage: {
    width: STAGE,
    height: STAGE,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  card: {
    width: 260,
    height: 92,
    marginTop: spacing.md,
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: N.outline ?? N.line,
    backgroundColor: N.card,
    backfaceVisibility: 'hidden',
  },
  faceBack: {
    borderColor: N.gold,
    borderWidth: 2,
  },
  faceTop: {
    marginTop: 2,
    fontFamily: fonts.bold,
  },
  brand: {
    marginTop: spacing.md,
  },
  actions: {
    marginTop: spacing.xl,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 340,
  },
  note: {
    marginTop: spacing.sm,
  },
  keep: {
    marginTop: spacing.md,
  },
});

export default LevelUpModal;
