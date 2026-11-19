// Android-only helpers that talk to the emulator over adb. The journey uses
// them to keep Android system windows (permission prompts, the Google
// password-save prompt) from taking focus away from the app, which makes
// Detox fail with "root ... has-window-focus=false".
import { execFileSync } from 'child_process';
import { device } from 'detox';

export const APP_ID = 'com.prayerlock.app';

function adbPath(): string {
  const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  return home ? `${home}/platform-tools/adb` : 'adb';
}

function adb(args: string[]): string {
  return execFileSync(adbPath(), ['-s', device.id, ...args], {
    encoding: 'utf8',
    timeout: 20000,
  });
}

/** Name of the window that has input focus right now, e.g. "com.prayerlock.app/.MainActivity". */
export function focusedWindow(): string {
  try {
    const out = adb(['shell', 'dumpsys', 'window']);
    const line = out.split('\n').find((l) => l.includes('mCurrentFocus='));
    return line ? line.trim() : '(unknown)';
  } catch {
    return '(adb failed)';
  }
}

/** One-time setup after the app is installed: no prompts that could steal focus. */
export function prepareEmulator(): void {
  const attempts: string[][] = [
    // Notification permission (Android 13+), asked for right after sign-in.
    ['shell', 'pm', 'grant', APP_ID, 'android.permission.POST_NOTIFICATIONS'],
    // The Google "save password?" prompt appears after typing a password.
    ['shell', 'settings', 'put', 'secure', 'autofill_service', 'null'],
  ];
  for (const args of attempts) {
    try {
      adb(args);
    } catch (e) {
      console.warn(`adb ${args.join(' ')} failed: ${(e as Error).message.split('\n')[0]}`);
    }
  }
}

/**
 * If something other than the app has focus, say what it is and send Back
 * (denies a permission prompt, dismisses a save prompt) until the app is
 * focused again. The log line is the diagnostic when a CI run goes wrong.
 */
export function ensureAppFocus(): void {
  for (let i = 0; i < 3; i += 1) {
    const focus = focusedWindow();
    if (focus.includes(APP_ID) || focus.startsWith('(')) return;
    if (focus.includes('launcher')) {
      // The app left the foreground (crash or exit): Back cannot help. Print
      // why, then let the test fail with a clear message.
      console.warn(`The app is no longer in the foreground: ${focus}`);
      try {
        console.warn(adb(['logcat', '-d', '-b', 'crash', '-t', '60']));
        console.warn(adb(['shell', 'pidof', APP_ID]) || 'app process is not running');
      } catch (e) {
        console.warn(`logcat failed: ${(e as Error).message.split('\n')[0]}`);
      }
      return;
    }
    console.warn(`Another window has focus, pressing Back: ${focus}`);
    try {
      adb(['shell', 'input', 'keyevent', '4']);
    } catch {
      return;
    }
    execFileSync('sleep', ['1']);
  }
}
