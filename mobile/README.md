# PrayerLock Mobile

Identity-based habit tracker. Expo SDK 51, React Native 0.74, TypeScript strict, Redux Toolkit, React Navigation.

## Setup

```powershell
cd mobile
npm install
```

## Run

```powershell
npx expo start          # Metro bundler
npx expo start --android
npx expo start --ios
npx expo start --web
```

## Phone build (needed for voice input)

The Coach mic uses `expo-speech-recognition`, a native module that **Expo Go
does not have**. In Expo Go the mic only says it needs the installed app.
Make a development build once, then keep using `npx expo start --dev-client`
the same way you used Expo Go.

First pull and install:

```powershell
git pull
cd mobile
npm install
```

`mobile/.env` must have `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy `.env.example`).

### Option A: build in the cloud with EAS (no Android Studio needed, works for iPhone too)

```powershell
npm install -g eas-cli
eas login                                   # free Expo account
eas init                                    # links the project, first time only
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value <your url> --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <your anon key> --visibility plaintext
npm run build:dev:android                   # eas build --profile development --platform android
```

When the build finishes, open the link on your phone, install the APK, then
on the laptop run `npm run start:dev` and scan the QR code with the new app.
For an iPhone, use `eas build --profile development --platform ios` (it asks
you to register the device; needs an Apple developer account).

### Option B: build on your computer (Android Studio)

Needs Android Studio (Android SDK + JDK 17) and the phone plugged in with
USB debugging on, or an emulator running. `adb devices` should list it.

```powershell
npm run android:dev                         # expo run:android
```

This generates the `android/` folder (git-ignored), builds and installs the
app. After that, `npm run start:dev` is enough until native packages change.

## API base URL

The base URL lives in `app.json` under `expo.extra.apiUrl`.

- Default: `http://10.0.2.2:8000/v1` (Android emulator loopback to the host machine).
- iOS simulator: change it to `http://localhost:8000/v1`.
- Physical device: use your machine's LAN IP, for example `http://192.168.1.20:8000/v1`.

## Demo account

The login screen has a "Preview with demo account" button that signs in as:

- Email: `demo@prayerlock.app`
- Password: `Demo1234!`

The backend seeds this account with 30 days of real history (quests, scores, streaks, chat), which makes it useful for reviewing the dashboard, insights, coach, and achievements screens.

## Architecture

```
src/
  api/          axios client (JWT interceptor, 401 -> refresh once -> retry -> logout)
                plus typed request/response models mirroring the OpenAPI spec
  components/   design system: Screen, Txt, Button, Card, Field, Chip, Stepper,
                SegmentedControl, ScoreRing, PillarBar, RadarChart, QuestRow,
                BadgeMedallion, Skeleton, Toast, ConfettiLite, custom svg icons
  lib/          token storage (expo-secure-store on device, AsyncStorage on web)
  navigation/   RootNavigator (auth state switch), MainTabs, typed param lists
  screens/      16 screens: Splash, Login, Register, VerifyEmail, Onboarding,
                GeneratingAvatar, AvatarReveal, Today, Quests, QuestDetail (modal),
                Coach, Insights, Achievements, Profile, NotificationSettings,
                TermsOfService, PrivacyPolicy
  store/        Redux Toolkit slices: auth, user, quests (optimistic complete,
                10s undo, skips), gamification, chat, analytics
  theme/        tokens.ts, the only file with raw hex values
```

### Design system rules enforced

- Paper background `#F7F4ED`, card `#FCFAF4`, ink `#23201A`. No pure white, no pure black.
- One accent (deep green `#1F5138`) plus a muted five color pillar palette. Gold reserved for streaks and badges.
- No gradients, no shadows, no blur. Separation comes from 1px hairline borders (`#E4DECF`) and background contrast.
- Corner radius scale: 3 / 5 / 8 only. The only circular elements are the avatar ring and the score ring, which are geometric shapes, not softened rectangles.
- IM Fell Great Primer for titles, Nunito for body. Loaded locally via `@expo-google-fonts`, with a paper splash fallback while fonts load.
- All icons and glyphs are hand-drawn `react-native-svg` line work (1.5 stroke). No icon fonts, no emoji anywhere in the UI.
- Skeleton loaders (pulsing `paperAlt` blocks) on dashboard, quests, coach, insights, achievements, and profile. No spinner-only states.
- Press feedback is a single opacity 0.96 state.

### Auth flow

`RootNavigator` switches on `auth.status`:

- `restoring` shows Splash while tokens load from secure storage.
- `unauthenticated` shows Login, Register, VerifyEmail.
- `needsOnboarding` shows Onboarding, GeneratingAvatar, AvatarReveal.
- `ready` shows the main tabs plus pushed screens.

The axios client attaches the access token, and on a 401 tries `/auth/refresh` once, retries the original request, and otherwise signs the user out.

### Notes on endpoints

- Quest completion is optimistic with rollback on failure, a 10 second undo window (toast with live countdown), and 3 skips per day tracked client side. The OpenAPI spec has no skip endpoint, so skips reset when the next day's quest list loads.
- The Month section of Insights aggregates the last four `/analytics/weekly-report` responses, since the spec defines no monthly endpoint.
- Export my data calls `GET /users/export` and hands the JSON to the native share sheet. Delete account calls `DELETE /users/account` after two confirmations. Both are specified in the product spec but not yet in the OpenAPI file, so failures surface an honest toast.
- Resend verification calls `POST /auth/resend-verification` as a best effort stub for the same reason.

### Type checking and bundling

```powershell
npx tsc --noEmit
npx expo export --platform web --output-dir dist-check
```
