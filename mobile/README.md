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
- Fraunces for display and numerals, Source Sans 3 for body. Loaded locally via `@expo-google-fonts`, with a paper splash fallback while fonts load.
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
