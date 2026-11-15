import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { LOCK_AFTER_MS, shouldLockOnResume } from './policy';

export interface AppLockState {
  locked: boolean;
  unlock: () => void;
}

/**
 * Tracks how long the app spends in the background and locks it when it
 * comes back after `lockAfterMs`.
 *
 * Only the 'background' state starts the clock. iOS also reports 'inactive'
 * while the Face ID sheet, Control Center or a call banner is up; counting
 * those would re-lock the app in the middle of unlocking it.
 *
 * Pass `enabled: false` on web and for signed-out users: nothing is tracked
 * and any lock is cleared.
 */
export function useAppLock(
  enabled: boolean,
  lockAfterMs: number = LOCK_AFTER_MS,
  now: () => number = Date.now,
): AppLockState {
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      backgroundedAt.current = null;
      setLocked(false);
      return undefined;
    }
    const onChange = (next: AppStateStatus) => {
      if (next === 'background') {
        if (backgroundedAt.current === null) backgroundedAt.current = now();
        return;
      }
      if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (shouldLockOnResume(since, now(), lockAfterMs)) setLocked(true);
      }
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [enabled, lockAfterMs, now]);

  const unlock = useCallback(() => setLocked(false), []);
  return { locked, unlock };
}
