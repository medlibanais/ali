# Anti-cheat: what it does and how to test it

Migration: `supabase/migrations/0013_anti_cheat.sql`
Tests: `supabase/tests/anti_cheat_test.sql` (31 pgTAP checks)

## What changed

| Cheat | Before | After |
| --- | --- | --- |
| Call `complete_quest` over and over | Only the 500 XP/day cap | At most **15 completions per local day**. Undo does not give the slot back, so complete → undo → complete cannot farm XP. |
| Fire many requests at once | Two parallel calls could both pass the "already completed?" check | Calls are serialized per user (row lock first). 10 parallel calls on one quest give 1 completion. |
| Edit `total_xp`, `level`, `current_streak` from the app | Blocked only by a trigger that looked at the request URL | INSERT/UPDATE/DELETE privileges on `gamification`, `quest_completions`, `quests`, `daily_scores`, `achievements` are revoked from `anon` and `authenticated`. Postgres itself refuses (`42501 permission denied`). |
| Insert your own 50 XP quests, or raise a quest's reward | Allowed (`quests_owner` policy was `for all`) | Quests are read-only for the app. |
| Change the phone clock to create quests for other days | `assign_daily_quests` accepted any date | Only today ± 1 day in the profile timezone (`quest_date_out_of_range`). Completing a quest from another day raises `quest_not_today`. |
| Keep an old streak after missing a day | `current_streak` was only recalculated on the next completion, so it showed the old number until then | A pg_cron job every 15 minutes sets `current_streak = 0` for anyone whose last active day is before yesterday **in their own timezone**. A BEFORE trigger on `gamification` applies the same rule on every write. |
| Use the streak freeze the day after a missed day to bridge it | Worked | Refused (`no_streak_to_freeze`). The freeze protects today only. |
| Hop timezones to start a "new day" early (fresh XP cap and limit) | Unlimited | After onboarding, the timezone can change once every 7 days (`timezone_change_too_soon`). |

Game rules are unchanged: Easy 10 / Medium 20 / Hard 50, +5 before 6 PM local, streak bonus +10 per streak day (max 100) once a day, 500 XP/day cap, 10 s undo.

### Why a cron job and not "a trigger at midnight"

A Postgres trigger runs only when a row is inserted or updated. Nothing happens to the row at midnight, so a trigger alone can never reset a streak for someone who simply doesn't open the app. The migration therefore uses both:

- **pg_cron job `expire-stale-streaks`**, every 15 minutes. pg_cron runs on UTC, and users have different midnights (including +05:30 and +05:45 zones), so it runs often and only touches rows that are actually stale. Each user's streak is reset within 15 minutes of their own midnight after a missed day.
- **Trigger `gamification_streak_rules`** (BEFORE INSERT/UPDATE). Any write that would save a streak whose last active day is older than yesterday stores 0 instead. This also protects the undo path, which restores an old snapshot.

pg_cron is already enabled by migration 0005 (`create extension pg_cron`). On hosted Supabase you can confirm under **Database → Extensions → pg_cron**, and see the job on the dashboard's Cron page or with `select * from cron.job;`.

## How to test

### 1. Automated (local)

```bash
npm run db:start
npm run db:reset          # applies 0001–0013 + seed
npm run db:test           # runs friends_test.sql and anti_cheat_test.sql
```

Expected: `anti_cheat_test.sql .. ok` (31 tests) and `friends_test.sql .. ok` (40 tests).

The test covers: every direct write is refused; normal completion, idempotent re-send and undo still work; the 16th completion is refused; the 500 XP cap still holds; old quests and far-future dates are refused; a stale streak cannot be saved; the midnight job resets a user whose midnight has passed (simulated by moving them from UTC-11 to UTC+14) and leaves a live streak alone; completing today extends a streak from 3 to 4; a second timezone change in 7 days is refused.

### 2. By hand in the SQL editor (hosted project)

Run this inside a transaction so nothing is kept. Replace the UUID with a test account.

```sql
begin;
-- act as the user
select set_config('request.jwt.claim.sub', '<user-uuid>', true),
       set_config('request.jwt.claims', json_build_object('sub', '<user-uuid>', 'role', 'authenticated')::text, true);
set local role authenticated;

-- (2) must fail with: permission denied for table gamification
update gamification set total_xp = 999999 where user_id = auth.uid();
rollback;
```

```sql
begin;
select set_config('request.jwt.claim.sub', '<user-uuid>', true),
       set_config('request.jwt.claims', json_build_object('sub', '<user-uuid>', 'role', 'authenticated')::text, true);
set local role authenticated;
select assign_daily_quests(null);
-- (1) complete quests one by one; the 16th call of the day raises daily_completion_limit
select complete_quest(id) from quests
 where user_id = auth.uid() and assigned_date = user_today(auth.uid())
 limit 16;
rollback;
```

(3) Streak reset, as `postgres`:

```sql
begin;
update gamification set current_streak = 5, last_active_date = user_today(user_id) - 1
 where user_id = '<user-uuid>';
select expire_stale_streaks();                 -- 0: active yesterday, still alive
update profiles set timezone = 'Pacific/Kiritimati' where id = '<user-uuid>';
update gamification set last_active_date = user_today(user_id) - 2
 where user_id = '<user-uuid>';                -- trigger stores 0 right away
select current_streak from gamification where user_id = '<user-uuid>';  -- 0
rollback;
```

Check the job is running: `select * from cron.job_run_details where command like '%expire_stale_streaks%' order by start_time desc limit 5;`

### 3. From the app

- Complete 15 quests in one day. The 16th shows "You reached today's limit of 15 completed quests."
- In the browser console on the web build, `await supabase.from('gamification').update({ total_xp: 999999 }).eq('user_id', '<id>')` returns a `42501` error.
- Change the timezone in Profile → Timezone, then change it again: the second change shows "You can change your timezone once every 7 days."
- Complete a quest, skip a full day, and open the app after your local midnight: the streak shows 0 (within 15 minutes of midnight).

## Tuning

- Daily limit: `public.daily_completion_limit()` returns 15. Today's assignment gives 2–3 quests per pillar (10–15) plus nightly AI quests, so a very full day can exceed 15 quests; raise the number in a new migration if real users hit it.
- Timezone throttle: `interval '7 days'` in `public.throttle_timezone_change()`. The service role and the dashboard are never throttled, so support can fix a timezone for a traveller.
