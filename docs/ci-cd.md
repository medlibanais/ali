# CI/CD: GitHub Actions + Netlify

Two workflows live in `.github/workflows/`.

## `ci.yml` (every push to `main`, every PR into `main`, or by hand)

| Job | What it runs | Fails when |
| --- | --- | --- |
| Typecheck, unit tests, web export | `npm ci`, `npx tsc --noEmit`, `npx tsc -p e2e` (once Detox is merged), `npx jest --ci`, `npx expo export -p web` | any TypeScript error, any failing test, or the web export breaks / misses `_redirects` or `.nojekyll` |
| E2E (tests/e2e.ps1) | starts a local Supabase in Docker (all migrations + `seed.sql`, Mailpit on), then runs `tests/e2e.ps1` with PowerShell 7 | any of the 16 assertions fails |
| Detox (Android emulator) | `npx detox build -c android.emu.release`, then `npx detox test` on an API 34 x86_64 emulator via `reactivecircus/android-emulator-runner`, against the same local Supabase | the journey test fails. Skips (and passes) until the Detox setup from PR #35 is on `main` |

No secrets are used by CI: it only talks to the throwaway local Supabase inside the runner.

## `deploy.yml` (after CI succeeds on `main`)

Runs only when the whole CI workflow finished with **success** for a **push to `main`**
(a merged PR counts). It checks out the exact commit CI tested, runs
`npx expo export -p web`, makes sure `dist/` holds `_redirects`, `.nojekyll` and
`netlify.toml` (`skip_processing = true`), then deploys with the Netlify CLI to production.

## One-time setup: GitHub secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**. Add these four:

| Secret name | Where to find the value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase dashboard → your project → Project Settings → API → Project URL (`https://<ref>.supabase.co`). Same value as in `mobile/.env`. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same page → Project API keys → `anon` `public`. Same value as in `mobile/.env`. |
| `NETLIFY_AUTH_TOKEN` | Netlify → avatar (top right) → User settings → Applications → Personal access tokens → New access token. Copy it once. |
| `NETLIFY_SITE_ID` | Netlify → your existing site → Site configuration → General → Site details → **Site ID** (a UUID). |

Never put the Groq or FAL keys here: they stay in Supabase Edge Function secrets only.

The Netlify site needs no build settings: the workflow builds in GitHub and uploads `dist/` (same as the manual drag and drop).

## Running the same checks on your laptop

```powershell
cd mobile
npx tsc --noEmit
npx jest
cd ..
npx supabase start
powershell -ExecutionPolicy Bypass -File tests\e2e.ps1
```
