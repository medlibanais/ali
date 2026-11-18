# End-to-end tests (Detox)

`journey.e2e.ts` walks a brand-new user through the app on a real
Android emulator or iOS simulator:

1. Launch, tap **Create account**, register with a fresh email and a password
   that meets the rules (8+ chars, upper, number, symbol).
2. Confirm the email (the test reads the confirmation mail from the local
   mail catcher and opens the link), then sign in.
3. Go through all 7 onboarding steps (name + a unique username on the last).
4. Pick **Design it by hand instead**, roll the dice 3 times, save.
5. On Today, note the XP, tick the first quest.
6. Check the XP on screen went up, and that `gamification.total_xp` in the
   database matches it.

It also checks the database after onboarding (`onboarding_completed`,
`username`) and after the avatar (`avatar_config` saved). All database reads
use the test user's own session, so RLS applies as in the app.

## Why local Supabase

Every run creates a real account, so the tests use the local stack, never the
live project. The build script refuses a `*.supabase.co` URL unless
`E2E_ALLOW_REMOTE=1` is set. Local Supabase has email confirmation on (like
production), and its mail catcher (Mailpit, port 54324) is how the test gets
the confirmation link. Test accounts pile up locally; `npm run db:reset`
from the repo root clears them.

## One-time setup

- Docker running, then from the repo root: `npm install` and `npm run db:start`.
- **Android** (Windows, macOS or Linux): Android Studio with an emulator,
  **JDK 17** (`JAVA_HOME`; Gradle 8.8 cannot run on Java 22+) and
  `ANDROID_HOME` set (`setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"` in
  PowerShell). Use an **API 34 emulator**: Detox 20.28's test runner crashes
  on Android 37 (`InputManager.getInstance` was removed).
  The default AVD name is `Pixel_7_API_34`; use yours with
  `set DETOX_AVD=<name>` (Windows) or `export DETOX_AVD=<name>`.
  `emulator -list-avds` lists them. `ANDROID_HOME` must be set.
- **iOS** (macOS only): Xcode with an iPhone simulator, and
  `brew tap wix/brew && brew install applesimutils`. Default device is
  `iPhone 15`; change it with `DETOX_IOS_DEVICE`.

## Run

From `mobile/`:

```
npm run e2e:build:android   # once per app change, ~10 min the first time
npm run e2e:test:android

npm run e2e:build:ios       # macOS only
npm run e2e:test:ios
```

The build is a **Release** build made just for tests (`e2e/scripts/build.js`):
it runs `expo prebuild --clean` with `DETOX_E2E=1`, which makes
`app.config.js` add the Detox native harness (`@config-plugins/detox`), then
builds natively. The Supabase URL and key come from `supabase status`
(the Android app uses `10.0.2.2`, the emulator's name for your computer).
The script checks the built bundle contains that URL before it finishes.
Your normal dev client and EAS builds do not get any Detox code.

iOS can't be built on Windows. To run it without a Mac, use a macOS CI
runner (for example GitHub Actions `macos-14`) with the same two commands
after `npm run db:start`.

Failing steps save a screenshot and the device log in `e2e/artifacts/`.

## Notes

- Detox's automatic idle-waiting is off: the app has never-ending
  animations (ambient background, breathing avatar), so every step waits for
  its own element instead.
- The test finds things by `testID`, never by text, so it works in English, French and Arabic. If you rename or remove one of these,
  update the test: `login-create-account`, `login-email`, `login-password`,
  `login-submit`, `register-email`, `register-password`, `register-submit`,
  `verify-title`, `verify-back-to-sign-in`, `onboarding-step-1` to `onboarding-step-7`, `onboarding-scroll`, `onboarding-continue`,
  `onboarding-first-name`, `onboarding-username`, `ai-avatar-design-by-hand`,
  `avatar-randomize`, `avatar-save`, `today-scroll`, `quest-complete`,
  `today-total-xp`.
- `npm run typecheck:e2e` typechecks the test files.
