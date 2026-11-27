# PrayerLock

Identity-based habit tracking. You define who you want to become across five
life pillars (Health, Family, Work, Fun, Spirituality); an AI-generated
"Future Self" coaches you through daily quests, and every day is scored 0–100.

```
PrayerLock/
├── mobile/            Expo SDK 51 React Native + TypeScript (Android + web)
│   ├── src/avatar/    Realistic 3D avatar (MakeHuman-based, three.js in a
│   │                  hidden WebView) + its JSON config and editor catalogs
│   ├── avatar3d/      Source of the WebView viewer (built to assets/avatar3d)
│   ├── src/features/  React Query data layers (friends, analytics, offline,
│   │                  quest search, celebrations, notifications, share)
│   ├── src/screens/   23 screens
│   └── src/store/     Redux Toolkit slices + XState offline-sync machine
├── supabase/
│   ├── migrations/    Versioned SQL migrations (schema, RLS, RPCs, cron)
│   ├── functions/     13 Deno Edge Functions (coach, generate-quests,
│   │                  weekly-insights, generate-insights, predict-streak,
│   │                  smart-notify, coach-nudges, notify-friend,
│   │                  generate-avatar, generate-avatar-config,
│   │                  search-quests, generate-embeddings, delete-account)
│   └── seed.sql       100 predefined quests + 15-badge catalog
├── tests/e2e.ps1      16-assertion end-to-end suite (3 flows + RLS proofs)
├── docs/              CI/CD, anti-cheat and security-hardening notes
├── preview.html       LEGACY: preview of the old 2D SVG avatar (not used)
├── docker-compose.yml LEGACY: old FastAPI/Ollama stack (does not run)
└── SECURITY.md        npm audit posture + app security model
```

## Architecture today (and how it differs from the SRS)

The SRS (v1.0, Aug 2026) planned React Native + a Python/FastAPI REST API on
AWS, Redis, a local Ollama/LLaMA 2 coach and Google Imagen for the avatar.
**None of that exists in this repo.** What runs instead:

- **No REST API.** The app talks to Supabase directly (tables and RPCs, all
  behind RLS) and to Supabase Edge Functions. The OpenAPI file in the SRS
  package describes endpoints that were never built.
- **Business rules in Postgres.** XP, streaks, badges, skips, undo and rate
  limits are SQL functions in `supabase/migrations`.
- **AI through Edge Functions only.** Groq (`openai/gpt-oss-120b`, fallback
  `llama-3.3-70b-versatile`) for the coach, quests and insights; fal.ai for
  images. Keys live only in Supabase function secrets.
- **Avatar.** A realistic 3D human rendered on device, plus optional photo
  modes (real photo, AI photo from a selfie, photoreal render). The earlier
  2D SVG, toon, anime and VRM avatars were removed.

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
On the Android emulator use `http://10.0.2.2:54321` as the URL in
`mobile/.env` (a phone needs your laptop's LAN IP).

## Verify everything

```powershell
# unit tests (level math, formatting, password rules)
cd mobile; npx jest

# type safety
npx tsc --noEmit

# bundle check
npx expo export --platform web

# database rules: friends consent, blocking, privacy, leaderboard (pgTAP)
npm run db:test

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
- **Avatar:** realistic 3D human (MakeHuman-based, male/female) shaped by
  sliders, with hairstyles, outfits, colors and poses; it breathes and
  blinks at a pace set by the Daily Life Score. Rendered by three.js in a
  hidden WebView and cached as images (`mobile/src/avatar/Avatar3D.tsx`).
  Optional picture modes: real photo (crop/compress/upload to Storage),
  AI "Future Self" photo from a selfie (`generate-avatar`, fal.ai, 5/day),
  photoreal render of the 3D look, and "Make it look like me" (selfie read
  by AI into editor settings, `generate-avatar-config`). The 3D avatar is
  the fallback for all of them.
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
  input, 420-char replies (SRS said 200), thumbs feedback, regenerate, quick replies.
- **Notifications:** in-app notification center (bell on Today, 3 s
  banner, mark read, clear all) + push. Hourly coach nudges: missed quest
  at 6 PM, streak at risk, neglected pillar (<30% over 3 days), repeated
  misses (3 days in a row); level-ups, badges and titles land instantly.
  Max 3 pushes/day, 8 AM-10 PM local by default, opt-out per type.
- **Friends:** username search, requests with realtime inbox, accept/decline,
  unfriend/block, invite links with auto-connect, weekly XP leaderboard,
  privacy toggle, push via Expo (quiet hours + opt-outs enforced).
- **Insights:** week/month view with a plain-language headline and
  takeaways, streak-probability gauge (`predict-streak`), pillar bars,
  score trend line, time-of-day histogram, year XP heatmap, and 2 AI
  pattern insights (`generate-insights`, cached 24 h). The weekly report
  (Sunday cron, `weekly-insights`) stores best/worst pillar, change vs the
  previous week, streak, next-week forecast and focus pillars. The SRS
  radar chart was dropped when Insights was simplified.
- **Gamification:** level curve `500·N` per level (one shared TS+SQL formula,
  unit tested in levels.test.ts), 5 level titles + 5 pillar titles (Fitness Warrior, Family
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
- The coach and the AI avatar need server secrets, a deploy and the
  migrations (see "Switching on the AI" below). Without a key the app now
  says which one is missing instead of failing quietly.

## Switching on the AI

Run from the repo root, linked to your project (`npx supabase link`):

```bash
npx supabase db push                                   # migrations, incl. 0011_ai_avatar
npx supabase secrets set GROQ_API_KEY=<groq key>       # coach  (console.groq.com/keys)
npx supabase secrets set FAL_KEY=<fal key>             # avatar (fal.ai/dashboard/keys)
npx supabase functions deploy coach generate-avatar    # redeploy after every merge
npx supabase secrets list                              # check both names are there
```

`coach` and `generate-avatar` run with `verify_jwt = false` (set in
`supabase/config.toml`) and check the session themselves, so they also work
on projects that use the newer JWT signing keys. What the app shows when
something is missing:

| App message | Fix |
| --- | --- |
| "...missing its GROQ_API_KEY" / "...missing its FAL_KEY" | `secrets set`, as above |
| "...function is not deployed" | `functions deploy coach generate-avatar` |
| "The AI image service refused our key" | the fal key is wrong or out of credit |
| "The AI could not be reached, so that reply came from your saved plan" | Groq was down or slow; the key is set |

### "Make it look like me" (selfie to avatar)

The editor's face button takes a selfie, uploads it to the private `selfies`
bucket and queues a row in `avatar_generation_jobs` (migration 0030). The
insert calls `generate-avatar-config` through a database webhook made in SQL.
It reads the selfie with Groq's vision model (`GROQ_API_KEY`, the coach's
key), then fal.ai (`FAL_KEY`) if Groq fails, and falls back to a random look.

```bash
npx supabase db push
npx supabase functions deploy generate-avatar-config
# webhook target and secret (once, in the SQL editor of the dashboard):
#   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
#   select vault.create_secret('<long random string>', 'avatar_webhook_secret');
npx supabase secrets set AVATAR_WEBHOOK_SECRET=<the same long random string>
```

Without the two Vault secrets the app still works: it calls the function
itself for its own job after 6 seconds. Optional: `AVATAR_VISION_MODEL`
(Groq model id), `AVATAR_FAL_VISION_ENDPOINT` / `AVATAR_FAL_VISION_MODEL`.

### What the coach remembers

Each coach request carries today's quests, yesterday's quests per pillar
(done / skipped / not done), the last 5 completed quests, the 2 weakest
pillars of the last 7 days and the last 10 messages of the open chat. Before
it is sent, the request is shrunk to a token budget (default 3,500 estimated
input tokens) so it stays under Groq's per-minute limits: the oldest chat
turns go first, then a shorter context is used. Set
`COACH_PROMPT_TOKEN_BUDGET` with `secrets set` to raise it on a paid Groq
tier. When a prompt is trimmed, the function logs `coach prompt trimmed`.

Locally, put the same names in `supabase/.env.local`. `GROQ_BASE_URL` and
`FAL_BASE_URL` can point the functions at a mock server for offline tests.

### Scheduled jobs

For scheduled jobs, configure `project_url` and a randomly generated
`cron_secret` in Supabase Vault. Set the matching `CRON_SECRET` in Edge
Function secrets. Use the local gateway URL and a separate secret for
development. Configure the Vault values before deploying the hardened
functions. Apply migration 0044 before deploying `search-quests`.

## Languages (English, French, Arabic)

The app follows the phone's language on first launch, and Profile →
Preferences → Language switches it instantly. The pick is saved on the
device and in `profiles.language` (migration `0040_profile_language.sql`,
run `npx supabase db push`), so it follows the account to a new phone.

- Strings live in `mobile/src/i18n/locales/{en,fr,ar}.json`. `en.json` is
  the source of truth: `tsc` fails on a key that is not in it, and
  `src/i18n/__tests__/locales.test.ts` fails when French or Arabic misses a
  key or uses a variable English does not pass.
- Arabic is right to left. Layout flips at once (the root view sets
  `direction: 'rtl'`); Android's own RTL flag (`I18nManager.forceRTL`)
  takes effect after the app is closed and reopened, which mostly affects
  system parts such as the keyboard and back gesture. Arabic text uses the
  Cairo font, because Anton, Inter and JetBrains Mono have no Arabic letters.
- Use `marginStart`/`marginEnd` (not Left/Right) in new styles so they flip.
- Text written by the server stays in English for now: coach replies,
  generated and predefined quests, push notifications, weekly insights and
  badge names.

## Security

RLS on every table (privacy matrix proven in `tests/e2e.ps1`), no secrets in
the client bundle, server-side rate limiting (auth, coach 20/day, quest
limits), no PII in logs. See `SECURITY.md` for the dependency audit posture.

## CI/CD

GitHub Actions runs typecheck, unit tests, the API E2E script and Detox on every push to `main`, and deploys the web app to Netlify when all of it passes. Setup and secrets: [docs/ci-cd.md](docs/ci-cd.md).
