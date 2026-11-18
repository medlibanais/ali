// Haptics: one place that decides how every interaction feels.
//
// Screens never call expo-haptics directly. They play a named event
// (`haptics.play('questComplete')`) and this file maps the event to a
// vibration. To tune the feel of the whole app, edit PRESETS below, or
// change the global intensity with setHapticIntensity().
//
// Web has no haptics: every call is a no-op there, so the web build never
// touches the native module. Calls are fire-and-forget and never throw.

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticEvent =
  /** Any ordinary button or row tap. */
  | 'tap'
  /** Switching bottom tabs. */
  | 'tab'
  /** Tapping a pillar orb on Today. */
  | 'pillar'
  /** Changing a picker, segment or toggle. */
  | 'select'
  /** Checking off a quest. */
  | 'questComplete'
  /** Undoing a quest. */
  | 'questUndo'
  /** Every pillar done for the day. */
  | 'perfectDay'
  /** Reaching a new level. */
  | 'levelUp'
  | 'success'
  | 'warning'
  | 'error';

/** off: no vibration. soft: one step lighter. strong: one step heavier. */
export type HapticIntensity = 'off' | 'soft' | 'normal' | 'strong';

type ImpactLevel = 'light' | 'medium' | 'heavy';

type HapticStep =
  | { kind: 'impact'; level: ImpactLevel }
  | { kind: 'selection' }
  | { kind: 'notify'; type: 'success' | 'warning' | 'error' }
  /** Pause before the next step, in ms. */
  | { kind: 'wait'; ms: number };

/** The feel of each event at 'normal' intensity. Tune here. */
export const PRESETS: Record<HapticEvent, HapticStep[]> = {
  tap: [{ kind: 'impact', level: 'light' }],
  tab: [{ kind: 'selection' }],
  pillar: [{ kind: 'impact', level: 'medium' }],
  select: [{ kind: 'selection' }],
  questComplete: [
    { kind: 'impact', level: 'medium' },
    { kind: 'wait', ms: 90 },
    { kind: 'notify', type: 'success' },
  ],
  questUndo: [{ kind: 'impact', level: 'light' }],
  perfectDay: [
    { kind: 'impact', level: 'heavy' },
    { kind: 'wait', ms: 120 },
    { kind: 'impact', level: 'medium' },
    { kind: 'wait', ms: 120 },
    { kind: 'notify', type: 'success' },
  ],
  levelUp: [
    { kind: 'impact', level: 'heavy' },
    { kind: 'wait', ms: 140 },
    { kind: 'impact', level: 'heavy' },
    { kind: 'wait', ms: 180 },
    { kind: 'notify', type: 'success' },
  ],
  success: [{ kind: 'notify', type: 'success' }],
  warning: [{ kind: 'notify', type: 'warning' }],
  error: [{ kind: 'notify', type: 'error' }],
};

/** The same event can't fire again within this window (stops buzz storms). */
const MIN_GAP_MS = 40;

const LEVELS: ImpactLevel[] = ['light', 'medium', 'heavy'];

const IMPACT_STYLE: Record<ImpactLevel, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

const NOTIFY_TYPE: Record<'success' | 'warning' | 'error', Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

let intensity: HapticIntensity = 'normal';
const lastPlayed: Partial<Record<HapticEvent, number>> = {};

export const hapticsSupported = Platform.OS !== 'web';

export function setHapticIntensity(next: HapticIntensity): void {
  intensity = next;
}

export function getHapticIntensity(): HapticIntensity {
  return intensity;
}

/** Shift an impact one step lighter or heavier for the current intensity. */
export function tuneImpact(level: ImpactLevel, at: HapticIntensity): ImpactLevel {
  const shift = at === 'soft' ? -1 : at === 'strong' ? 1 : 0;
  const index = Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(level) + shift));
  return LEVELS[index];
}

function swallow(promise: Promise<void>): void {
  promise.catch(() => undefined);
}

function runStep(step: HapticStep): void {
  switch (step.kind) {
    case 'impact':
      swallow(Haptics.impactAsync(IMPACT_STYLE[tuneImpact(step.level, intensity)]));
      return;
    case 'selection':
      swallow(Haptics.selectionAsync());
      return;
    case 'notify':
      // Soft mode trades the long notification buzz for a light tick.
      if (intensity === 'soft') {
        swallow(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      } else {
        swallow(Haptics.notificationAsync(NOTIFY_TYPE[step.type]));
      }
      return;
    case 'wait':
      return;
  }
}

/** Play a named haptic. Safe to call anywhere, on any platform. */
export function playHaptic(event: HapticEvent): void {
  if (!hapticsSupported || intensity === 'off') return;
  const now = Date.now();
  const last = lastPlayed[event];
  if (last !== undefined && now - last < MIN_GAP_MS) return;
  lastPlayed[event] = now;

  let delay = 0;
  for (const step of PRESETS[event]) {
    if (step.kind === 'wait') {
      delay += step.ms;
      continue;
    }
    try {
      if (delay === 0) runStep(step);
      else setTimeout(() => runStep(step), delay);
    } catch {
      // A missing native module (old dev build) must never break a tap.
    }
  }
}
