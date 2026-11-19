---
description: Run the standing pre-finish checks (tsc, jest, web export with _redirects and .nojekyll)
allowed-tools: Bash(npx tsc:*), Bash(npx jest:*), Bash(npx expo export:*), Bash(test:*), Bash(grep:*), Bash(ls:*), Bash(rm -rf dist-check:*), Bash(cd:*)
---

Run the project's verification checklist in `mobile/`, the same checks as the
`checks` job in `.github/workflows/ci.yml`. Run every step even if an earlier
one fails, then report a short pass/fail table.

1. **Typecheck:** `cd mobile && npx tsc --noEmit` must exit 0.
2. **Unit tests:** `cd mobile && npx jest --ci` must pass every test. Report
   the count (for example "41/41").
3. **Web export:** `cd mobile && npx expo export -p web --output-dir dist-check`.
   If `mobile/.env` is missing, prefix the command with
   `EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key`.
   Never print or copy the values from a real `.env`.
4. **Netlify files** in `mobile/dist-check/`:
   - `index.html` exists
   - `_redirects` exists and contains `/* /index.html 200`
   - `.nojekyll` exists
   And `mobile/netlify.toml` still has `skip_processing = true` under `[build.processing]`.
5. Remove `mobile/dist-check` afterwards.

If something fails, show the first relevant errors and fix them only if the
user asked for fixes. Never run `npm audit fix --force`.
