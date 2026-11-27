/**
 * Pure rules for the biometric app lock, kept free of native imports so they
 * can be unit tested and shared by web and native code.
 */

/** How long the app may sit in the background before it locks. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

/**
 * True when the app was in the background long enough to need unlocking.
 * A cold start has no background timestamp, so it never locks: the user
 * just came through sign-in or a restored session.
 */
export function shouldLockOnResume(
  backgroundedAt: number | null,
  now: number,
  lockAfterMs: number = LOCK_AFTER_MS,
): boolean {
  if (backgroundedAt === null) return false;
  return now - backgroundedAt >= lockAfterMs;
}

export type DeviceAuthLevel = 'biometric' | 'passcode' | 'none';

export interface DeviceAuthInfo {
  /** Strongest lock the device has enrolled. */
  level: DeviceAuthLevel;
  /** "Face ID", "Touch ID", "fingerprint" or "face unlock", when enrolled. */
  biometricName: string | null;
}

export type DeviceAuthFailure =
  | 'cancelled'
  | 'failed'
  | 'lockout'
  | 'unavailable';

export type DeviceAuthResult =
  | { ok: true }
  | { ok: false; reason: DeviceAuthFailure };

/** Maps expo-local-authentication's error codes to what the lock screen shows. */
export function failureFromErrorCode(code: string): DeviceAuthFailure {
  switch (code) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
    case 'user_fallback':
      return 'cancelled';
    case 'lockout':
    case 'lockout_permanent':
      return 'lockout';
    case 'not_enrolled':
    case 'not_available':
    case 'passcode_not_set':
    case 'no_space':
    case 'unable_to_process':
      return 'unavailable';
    default:
      return 'failed';
  }
}

export function failureMessage(reason: DeviceAuthFailure): string {
  switch (reason) {
    case 'cancelled':
      return 'Unlock was cancelled.';
    case 'lockout':
      return 'Too many attempts. Use your phone passcode or your GROW password.';
    case 'unavailable':
      return "This phone can't verify you right now. Use your GROW password.";
    case 'failed':
      return "That didn't match. Try again.";
  }
}
