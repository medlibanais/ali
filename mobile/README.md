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

### Option A: build in the cloud with EAS (no Android Studio needed)

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

### Option B: build on your computer (Android Studio)

Needs Android Studio (Android SDK + JDK 17) and the phone plugged in with
USB debugging on, or an emulator running. `adb devices` should list it.

```powershell
npm run android:dev                         # expo run:android
```

This generates the `android/` folder (git-ignored), builds and installs the
app. After that, `npm run start:dev` is enough until native packages change.

## Backend connection

There is no separate API server. The app talks to Supabase directly
(`src/lib/supabase.ts`) using `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` from `mobile/.env`, plus Supabase Edge
Functions for AI work. For a local Supabase on the Android emulator, put
`http://10.0.2.2:54321` in `.env` (a phone needs your laptop's LAN IP).

## Architecture

```
src/
  api/          shared TypeScript types for Supabase rows and responses
  avatar/       realistic 3D avatar (Avatar3D, rendered by three.js in a
                hidden WebView, cached as images) and its config/catalogs
  components/   design system: Screen, Txt, Button, Card, Field, Chip,
                PillarOrbit, PillarBubble, PillarBar, QuestRow, Skeleton,
                Toast, sheets for photo/selfie avatars, charts/ (LineChart,
                YearHeatmap, StreakGauge, TimeOfDayHistogram), svg icons
  features/     React Query data layers: analytics, celebrations, friends,
                notifications, offline sync, quest search, share
  lib/          supabase client (SecureStore on device, localStorage on
                web), haptics, voice input, coach streaming, offline queue
  navigation/   RootNavigator (auth state switch), MainTabs, typed params
  screens/      23 screens (Today, Quests, Coach, Insights, Profile tabs
                plus auth, onboarding, avatar, friends, settings, legal)
  store/        Redux Toolkit slices (auth, user, quests, gamification,
                chat, analytics, celebrations, sync, theme) and the XState
                offline-sync machine
  theme/        themes.ts (9 palettes, Neon is the default), tokens.ts,
                fonts.ts
```

### Look and feel (current)

- Default theme **Neon**: near-black canvas, mint accent `#3CFFD0`, solid
  color-block quest tiles. Eight more themes in `src/theme/themes.ts`,
  picked in Profile and saved to `profiles.theme_preference`.
- Fonts: Anton (titles), Inter (body), JetBrains Mono (small labels).
- Icons are `react-native-svg` line work; charts are custom SVG.
- Skeleton loaders on the main screens, haptics on native only.

### Auth flow

`RootNavigator` switches on `auth.status`:

- `restoring` shows Splash while the session loads from secure storage.
- `unauthenticated` shows Login, Register, VerifyEmail, ForgotPassword,
  ResetPassword.
- `needsOnboarding` shows Onboarding, then the avatar steps.
- `ready` shows the main tabs plus pushed screens.

The Supabase client stores the session and refreshes the access token itself.

### Type checking and bundling

```powershell
npx tsc --noEmit
npx expo export --platform web --output-dir dist-check
```
