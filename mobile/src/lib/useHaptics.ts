// useHaptics: the hook screens use to vibrate.
//
//   const haptics = useHaptics();
//   haptics.play('questComplete');
//   haptics.tap();
//
// The returned object never changes identity, so it is safe in the
// dependency list of useCallback/useMemo and never causes a re-render.
// Tune the feel in lib/haptics.ts (PRESETS and setHapticIntensity).

import {
  getHapticIntensity,
  playHaptic,
  setHapticIntensity,
  type HapticEvent,
  type HapticIntensity,
} from './haptics';

export interface HapticsApi {
  play: (event: HapticEvent) => void;
  tap: () => void;
  select: () => void;
  success: () => void;
  warning: () => void;
  error: () => void;
  setIntensity: (intensity: HapticIntensity) => void;
  getIntensity: () => HapticIntensity;
}

const api: HapticsApi = {
  play: playHaptic,
  tap: () => playHaptic('tap'),
  select: () => playHaptic('select'),
  success: () => playHaptic('success'),
  warning: () => playHaptic('warning'),
  error: () => playHaptic('error'),
  setIntensity: setHapticIntensity,
  getIntensity: getHapticIntensity,
};

export function useHaptics(): HapticsApi {
  return api;
}

export type { HapticEvent, HapticIntensity };
export default useHaptics;
