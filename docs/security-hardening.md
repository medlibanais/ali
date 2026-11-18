# Security hardening (migration 0030)

Builds on 0012 (friends) and 0013 (anti-cheat). Tests: `supabase/tests/security_hardening_test.sql` (40 pgTAP checks) and `supabase/functions/_shared/__tests__/promptGuard_test.ts` (9 Deno tests).

## What was already in place before 0030

- `gamification`, `quest_completions`, `quests`, `daily_scores`, `achievements`: no INSERT/UPDATE/DELETE for `anon`/`authenticated` (0013), plus a trigger that refuses non-RPC writes (0012).
- `complete_quest`: SECURITY DEFINER, per-user row lock, 15 completions per local day, 500 XP/day cap, quest must belong to the caller (0013).
- `messages`/`conversations`: owner-only RLS. `daily_scores`/`gamification`/`achievements`: owner, or accepted friends when `stats_visibility = 'friends'`. `profiles`: self, and people with a pending or accepted friendship (0012).
- Coach: 500-character input cap and 20 messages/day, enforced in the Edge Function.

## What 0030 adds

| Area | Change |
| --- | --- |
| `complete_quest` | Not-found and not-yours give the same `quest_not_found`. Quest must be assigned for **today** in the user's timezone (yesterday only during the first 2 h after midnight, for offline ticks). Already completed raises `already_completed`. More than 10 calls in 5 s raises `rate_limited` (new `rate_limits` table). Accepted calls wait 0.5 s (`pg_sleep`). |
| `gamification` | Table and column-level INSERT/UPDATE revoked again; SELECT only. |
| `messages` | The app can read and set `feedback` only. No insert (forged coach replies), no delete (resetting the daily limit). `conversations` cannot be deleted by the app. |
| `profiles` | Trigger: `timezone_changed_at` is server-only, `onboarding_completed` cannot go back to false (both bypassed the 7-day timezone throttle), photo URLs must be in the user's own `profile-photos/<user_id>/` folder, first name <= 50 chars, avatar config <= 32 KB. Goal text <= 300 chars. |
| Storage `profile-photos` | API listing/reading limited to your folder and people who can see your profile. Images only (jpeg/png/webp), 5 MB max. |
| Coach | `_shared/promptGuard.ts`: strips override phrases, chat-template tokens and invisible characters from the message, history and goals; system prompt wrapped in `### SYSTEM INSTRUCTIONS ###` delimiters with priority rules; a reply that echoes the delimiters is discarded. |

## Tunables

`complete_quest_rate_max()` (10), `complete_quest_rate_window()` (5 s), `late_completion_grace()` (2 h), `complete_quest_delay()` (0.5 s). Change one with `create or replace function` in a new migration. To drop the sleep, make `complete_quest_delay()` return `interval '0'`.

## Limits, honestly

- `pg_sleep(0.5)` does not stop timing attacks in any meaningful way and holds a DB connection while it waits. It is applied only to accepted calls, after the rate limit, so a flood of bad calls is not slowed down into a pool exhaustion. The rate limit and the checks do the real work.
- A rejected call rolls back its transaction, so it is not counted by the rate limit. Only accepted calls count.
- The prompt guard reduces prompt injection; it cannot prevent it. Paraphrases and other languages get through. The coach has nothing privileged to leak beyond its own prompt and the user's own data.
- The `profile-photos` bucket stays public so existing avatar links keep working: anyone with the exact file URL can open the image. Fully private needs signed URLs in the app.

## Manual steps

1. `npx supabase db push` (applies 0030).
2. `npx supabase functions deploy coach`.
