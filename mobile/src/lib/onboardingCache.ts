// Remembers, per account on this device, that onboarding is finished.
// A returning user who opens the app with no network (or while the profile
// read fails) must land on Today with their cached data, not be sent back
// through onboarding. Only a known "finished" is remembered; an unfinished
// or unknown state always asks the server.

import { kvStore } from './kvStore';

const KEY = 'grow.onboarded';

export function rememberOnboardingCompleted(userId: string): void {
  try {
    kvStore.set(`${KEY}.${userId}`, '1');
  } catch {
    // Storage full or unavailable: the server answer is still used.
  }
}

export function wasOnboardingCompleted(userId: string): boolean {
  try {
    return kvStore.getString(`${KEY}.${userId}`) === '1';
  } catch {
    return false;
  }
}
