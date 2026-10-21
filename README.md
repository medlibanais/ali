# PrayerLock

Identity-based habit tracking. You define who you want to become across five
life pillars (Health, Family, Work, Fun, Spirituality); an AI-generated
"Future Self" coaches you through daily quests, and every day is scored 0–100.

```
PrayerLock/
├── mobile/            Expo React Native + TypeScript (iOS, Android, Web)
│   ├── src/avatar/    Layered-SVG avatar system (original art, JSON config)
│   ├── src/features/  React Query data layers (friends, analytics)
│   ├── src/screens/   20 screens
│   └── src/store/     Redux Toolkit (auth/theme/session state)
├── supabase/
│   ├── migrations/    10 versioned SQL migrations (schema, RLS, RPCs, cron)
│   ├── functions/     Edge Functions (coach, coach-nudges, generate-quests,
│   │                  notify-friend, weekly-insights, delete-account)
│   └── seed.sql       100 predefined quests + 15-badge catalog
├── tests/e2e.ps1      16-assertion end-to-end suite (3 flows + RLS proofs)
├── preview.html       Static avatar art preview (open in a browser)
└── SECURITY.md        npm audit posture + app security model
```

## Stack

- **Client:** Expo 51, React Navigation, Redux Toolkit, React Query,
  react-native-svg (all charts + avatar are custom SVG)
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions).
  Every table has RLS; all XP/streak/badge logic lives in Postgres functions.
- **AI:** Groq (`openai/gpt-oss-120b`) called ONLY from Edge Functions.
  The key never ships in the client.

## Run it locally

Prereqs: Node 22+, Docker Desktop running, PowerShell.

```powershell
# 1) start the full backend (db, auth, storage, realtime, studio, functions)
cd PrayerLock
npm install
npx supabase start        # applies all migrations + seed on first run

# 2) edge functions (needs the LLM key once)
copy supabase\.env.local.example supabase\.env.local
#    -> paste your Groq key into supabase/.env.local
npx supabase functions serve --env-file supabase/.env.local

# 3) the app
cd mobile
npm install
copy .env.example .env    # values come from `npx supabase start` output
npx expo start            # or: npx expo start --web
```

Local services: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`,
email testing (Mailpit) `http://127.0.0.1:54324`.
Android emulator reaches them automatically (client rewrites to `10.0.2.2`).

## Verify everything

```powershell
# unit tests (level math, formatting, password rules)
cd mobile; npx jest

# type safety
npx tsc --noEmit

# bundle check
npx expo export --platform web

# end-to-end: signup->onboarding->avatar->quest, friends+privacy, forgot
# password, RLS spot checks (16 assertions)
powershell -File tests\e2e.ps1
```

## Feature map (spec traceability)

- **Auth:** email+password with server-enforced strength rules, verification
  via email link (PKCE), forgot/reset password with deep link back into the
  app, sessions in expo-secure-store.
- **Onboarding:** 5-pillar questionnaire, unique username, auto-detected
  timezone, ends in the avatar creator.
- **Avatar:** original layered-SVG system (8 faces, 12 skins, 20 hairstyles
  incl. hijab/cap, 20 colors, 10 eyes, 8 brows/mouths, 6 outfits,
  accessories, backgrounds), mood reacts to Daily Life Score, idle
  breathing/blink, level-locked items, randomize + undo/redo.
  Optional real photo (crop/compress/upload to Storage) with mode toggle.
  AI "Future Self" avatar from a selfie (`generate-avatar` Edge Function,
  fal.ai Flux Kontext, 5/day); the SVG avatar is the fallback.
- **Quests:** 15/day (10 predefined + 5 AI "Coach picks" personalized by
  goals/hobbies/religion), no consecutive-day repeats, 3 skips/day (a
  skipped quest returns the next day), 10-second undo (server allows 15 s
  for latency; undo also rolls back that day's streak bump), XP fully
  server-side: base + 5 before 6 PM local + streak bonus (+10/streak day,
  max +100, once per day), 500/day cap.
- **Daily Life Score:** average of the five pillar percentages; skipped
  quests leave the denominator.
- **Coach:** Groq LLM with intent routing — crisis, health symptoms and
  out-of-scope (medical/legal/financial) are deterministic safety paths;
  everything else gets your real goals/scores/streak/missed quests
  injected, plus the last 20 messages. 20 msgs/day server-side, 500-char
  input, 200-char replies, thumbs feedback, regenerate, quick replies.
- **Notifications:** in-app notification center (bell on Today, 3 s
  banner, mark read, clear all) + push. Hourly coach nudges: missed quest
  at 6 PM, streak at risk, neglected pillar (<30% over 3 days), repeated
  misses (3 days in a row); level-ups, badges and titles land instantly.
  Max 3 pushes/day, 8 AM-10 PM local by default, opt-out per type.
- **Friends:** username search, requests with realtime inbox, accept/decline,
  unfriend/block, invite links with auto-connect, weekly XP leaderboard,
  privacy toggle, push via Expo (quiet hours + opt-outs enforced).
- **Insights:** 12 charts (radar overlays, trend lines, XP bars w/ cap,
  stacked pillars, donut, 12-week heatmap, weekday performance, hour
  histogram, streak timeline, funnel, level journey) + weekly AI pattern
  insights and report (Sunday cron): best/worst pillar, change vs the
  previous week, streak, next-week score forecast and focus pillars.
- **Gamification:** level curve `500·N` per level (one shared TS+SQL formula,
  23 unit tests), 5 level titles + 5 pillar titles (Fitness Warrior, Family
  First, Deep Worker, Adventurer, Prayer Master) with unlock dates and
  progress, all 15 badges evaluated server-side (AI quests are classified
  by title for prayer/workout/parents/deep-work badges), streak freeze
  (1/week).

## Known flags

- Level 100 needs 2,524,500 XP by the formula = **5,049 days at the 500/day
  cap (~13.8 years)**. The curve needs a rebalance decision (see
  SECURITY/handover notes); formula left exactly as specified until decided.
- Push delivery requires a physical device (Expo push tokens are stored and
  the notify pipeline is fully tested up to the Expo API).
- AI avatar needs a fal.ai key: `npx supabase secrets set FAL_KEY=...`
  (locally: `FAL_KEY` in `supabase/.env.local`). Without it the app says
  AI avatars are off and offers the hand-built avatar.

## Security

RLS on every table (privacy matrix proven in `tests/e2e.ps1`), no secrets in
the client bundle, server-side rate limiting (auth, coach 20/day, quest
limits), no PII in logs. See `SECURITY.md` for the dependency audit posture.
