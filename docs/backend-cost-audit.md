# Expensive backend entry points (audit, 2026-11-25)

Every paid or heavy call, traced from who may call it to the work it does.
"Reserved" means the quota is taken in Postgres under a per-account lock
before the provider call (migration 0045, or 0044 for search), so parallel
requests cannot pass it. Tests: `supabase/tests/ai_quotas_test.sql` and
`supabase/tests/ai_quota_race.sh` (30 parallel requests per quota).

| Entry point | Caller check | Bounds | Budget | Notes |
| --- | --- | --- | --- | --- |
| `coach` (Groq, stream or not) | user JWT (`getUser`) | 500 chars, UUID conversation, own conversation | 20 user messages per local day, **reserved** (0045); 429 with `resets_at` + `Retry-After` | The reservation saves the message. Was count-then-insert: 45 of 20 got through in a 30-way race. |
| `generate-avatar` (fal.ai image) | user JWT | 1.4 MB photo / 4.5 MB render base64 | 5 per rolling 24 h, **reserved** (0045); provider-side failures (401/403/429/5xx/network) release the slot | Timeouts and content rejections still count. |
| `avatar_generation_jobs` + `generate-avatar-config` (vision model) | insert by RLS; function by webhook secret or job owner | selfie under 500 KB, one job at a time | 10 per 24 h, trigger now **serialized** (0045) | Was 24 jobs in a 30-way race where 1 is allowed. Claim of a job is single-winner. |
| `generate-quests` on demand (Groq) | user JWT, self only | one account and date | **single-flight claim** per account/date + 6 claims per hour (0045) | Its log upsert now targets `(user_id, target_date)`; before, every write after the first of a day failed, so fallback days re-called Groq on every Today load. |
| `generate-quests` nightly | cron secret (0044 rejects the retired dev secret) | all onboarded users | claim per account/date | |
| `search-quests` (embeddings) | user JWT | query bounds (PR #64) | 30 per minute, reserved (0044) | |
| `generate-insights` (Groq) | user JWT; reads as the caller | cached 24 h, 15 min cooldown | 6 model calls per hour, **reserved** (0045), rules past it | |
| `weekly-insights` on demand (Groq) | user JWT | once per week per account | 3 per hour, **reserved** (0045), 429 past it | Cron path unchanged. |
| `smart-notify`, `coach-nudges`, `predict-streak`, `generate-embeddings` | cron secret only | batch | cron schedule | 0044 skips dispatch when Vault secrets are missing or the retired dev value. |
| `notify-friend` | cron secret, or user JWT for own events (each type checks the friendship or cheer exists) | PR #64 validation | 30 pushes per hour per sender, **reserved** (0045) | Before, a pending request push could be re-sent without limit. |
| `delete-account` | user JWT, self only | | | |

## To verify in the hosted project (cannot be checked from the repo)

- Groq: a monthly spend limit or hard cap on the API key's organization, and
  the per-key rate limits, since the per-account limits above do not bound the
  total across all accounts.
- fal.ai: a spending limit or prepaid balance on `FAL_KEY`.
- Supabase Edge Functions: invocation and egress spend caps for the plan, and
  that `verify_jwt = false` functions are the ones listed in `config.toml`.
- Supabase Auth: sign-up rate limits and email confirmation on, so new
  accounts cannot be minted to multiply per-account budgets.
- Vault: `project_url`, `cron_secret` and `avatar_webhook_secret` set, with
  matching `CRON_SECRET` and `AVATAR_WEBHOOK_SECRET` function secrets (PR #64).
