// "Alive" idle motion for avatars: breathing and blinking, both driven on
// the UI thread with react-native-reanimated, so they never touch the JS
// thread or re-render React after mount.
//
// The breathing pace follows the user's daily life score: a low score
// breathes fast and shallow (stress), a high score slow and deep (calm).
// The score can be a plain number or a SharedValue. Pass a SharedValue
// (useLifeScoreValue) when the score changes often: the pace then changes
// on the UI thread with no React re-render of the avatar.
//
// Android performance: the hooks only produce numbers; callers apply them
// as View transforms/opacity (composited by the GPU), never as animated
// SVG props, which would re-rasterize the SVG every frame on Android.

import { useEffect } from 'react';
import {
  isSharedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

/** One full in-and-out breath at score 0 (stressed) and 100 (calm), in ms. */
export const BREATH_STRESSED_MS = 2400;
export const BREATH_CALM_MS = 5600;
/** Average gap between blinks at score 0 and 100, in ms. */
export const BLINK_GAP_STRESSED_MS = 2200;
export const BLINK_GAP_CALM_MS = 4800;
/** How long a blink keeps the eyes shut, close + open, in ms. */
export const BLINK_CLOSE_MS = 70;
export const BLINK_OPEN_MS = 120;

/** Clamp a life score to 0..100 (NaN counts as a neutral 50). */
export function clampScore(score: number): number {
  'worklet';
  if (!Number.isFinite(score)) return 50;
  return Math.min(100, Math.max(0, score));
}

/** Length of one breath for a daily life score: faster when low. */
export function breathPeriodMs(score: number): number {
  'worklet';
  const t = clampScore(score) / 100;
  return BREATH_STRESSED_MS + (BREATH_CALM_MS - BREATH_STRESSED_MS) * t;
}

/** Depth of a breath, 0..1: shallow when stressed, full when calm. */
export function breathDepth(score: number): number {
  'worklet';
  return 0.65 + 0.35 * (clampScore(score) / 100);
}

/** Gap before the next blink. `jitter` in 0..1 spreads gaps ±35%. */
export function blinkGapMs(score: number, jitter: number): number {
  'worklet';
  const t = clampScore(score) / 100;
  const base = BLINK_GAP_STRESSED_MS + (BLINK_GAP_CALM_MS - BLINK_GAP_STRESSED_MS) * t;
  return base * (0.65 + 0.7 * Math.min(1, Math.max(0, jitter)));
}

/** Breath curve: 0 = exhaled, 1 = full inhale, smooth at both ends. */
export function breathAt(phase: number): number {
  'worklet';
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
}

/**
 * Keep a SharedValue in step with a score that may be a number or
 * already a SharedValue. Returns a stable SharedValue either way.
 */
function useScoreValue(score: number | SharedValue<number> | undefined): SharedValue<number> {
  const own = useSharedValue(typeof score === 'number' ? score : 50);
  const isShared = isSharedValue(score);
  useEffect(() => {
    if (typeof score === 'number') own.value = score;
  }, [score, own]);
  return isShared ? (score as SharedValue<number>) : own;
}

export interface AliveMotion {
  /** 0 = exhaled, 1 = full inhale, already scaled by the breath depth. */
  breath: SharedValue<number>;
  /** 1 = eyes open, 0 = shut. */
  eyes: SharedValue<number>;
}

/** Eye openness `elapsed` ms into a blink (or double blink). */
export function blinkEyesAt(elapsed: number, double: boolean): number {
  'worklet';
  const one = BLINK_CLOSE_MS + BLINK_OPEN_MS;
  if (elapsed < 0 || elapsed >= (double ? 2 * one : one)) return 1;
  const e = elapsed % one;
  return e < BLINK_CLOSE_MS ? 1 - e / BLINK_CLOSE_MS : (e - BLINK_CLOSE_MS) / BLINK_OPEN_MS;
}

/**
 * Breathing + blinking for one avatar, both from one frame callback on
 * the UI thread. Breathing advances a phase by the current pace, so a
 * pace change never jumps mid-breath; blinking counts down to the next
 * blink and plays it, sometimes as a quick double blink.
 */
export function useAliveMotion(
  score: number | SharedValue<number> | undefined,
  animated: boolean,
): AliveMotion {
  const scoreValue = useScoreValue(score);
  const start = typeof score === 'number' ? score : 50;
  const breath = useSharedValue(0);
  const eyes = useSharedValue(1);
  const phase = useSharedValue(0);
  // The pace eases toward the score's pace so a big score jump settles
  // over a couple of breaths instead of snapping.
  const period = useSharedValue(breathPeriodMs(start));
  const depth = useSharedValue(breathDepth(start));
  // ms until the next blink starts; while negative, ms into the blink.
  const blinkClock = useSharedValue(blinkGapMs(start, 0.5));
  const doubleBlink = useSharedValue(false);

  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = Math.min(64, info.timeSincePreviousFrame ?? 16);
    const s = scoreValue.value;
    const ease = Math.min(1, dt / 900);
    period.value += (breathPeriodMs(s) - period.value) * ease;
    depth.value += (breathDepth(s) - depth.value) * ease;
    phase.value = (phase.value + dt / period.value) % 1;
    breath.value = breathAt(phase.value) * depth.value;

    blinkClock.value -= dt;
    if (blinkClock.value <= 0) {
      const into = -blinkClock.value;
      const open = blinkEyesAt(into, doubleBlink.value);
      const length = (BLINK_CLOSE_MS + BLINK_OPEN_MS) * (doubleBlink.value ? 2 : 1);
      if (into >= length) {
        eyes.value = 1;
        blinkClock.value = blinkGapMs(s, Math.random());
        doubleBlink.value = Math.random() < 0.18;
      } else {
        eyes.value = open;
      }
    }
  }, false);

  useEffect(() => {
    frame.setActive(animated);
    if (!animated) {
      breath.value = 0;
      eyes.value = 1;
    }
    return () => frame.setActive(false);
    // frame and the shared values are stable for the component's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated]);

  return { breath, eyes };
}
