// Keeps Android's native splash screen up until the app has something
// real to show, so the user never sees a blank frame or a half-styled
// screen while fonts, theme and session load.
//
// The splash hides when the first real screen has been laid out
// (markFirstScreenPainted), which only happens after the fonts, the saved
// theme and the session are restored. A safety timer hides it anyway, so a
// slow network can never trap the user on the splash.
//
// On web expo-splash-screen does nothing, so these calls are harmless.

import * as SplashScreen from 'expo-splash-screen';

/** The longest the native splash may stay up, whatever happens. */
export const SPLASH_MAX_MS = 6000;

let hidden = false;
let safety: ReturnType<typeof setTimeout> | null = null;
/** ms since the JS bundle started, for the startup measurement log. */
const bundleStart = Date.now();

/** Call once, at module load of App.tsx, before the first render. */
export function holdSplash(): void {
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
  safety = setTimeout(() => hideSplash('timeout'), SPLASH_MAX_MS);
}

function hideSplash(reason: string): void {
  if (hidden) return;
  hidden = true;
  if (safety) clearTimeout(safety);
  safety = null;
  if (__DEV__) {
    // Read with `adb logcat -s ReactNativeJS` to compare builds.
    // eslint-disable-next-line no-console
    console.log(`[startup] first screen after ${Date.now() - bundleStart} ms (${reason})`);
  }
  SplashScreen.hideAsync().catch(() => undefined);
}

/**
 * The first real screen (Today, or Login / Onboarding) has been laid out.
 * Waits one frame so that layout has actually reached the screen.
 */
export function markFirstScreenPainted(screen: string): void {
  if (hidden) return;
  requestAnimationFrame(() => hideSplash(screen));
}

export function isSplashHidden(): boolean {
  return hidden;
}
