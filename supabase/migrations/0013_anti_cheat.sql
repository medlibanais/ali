-- PrayerLock 0013: anti-cheat for XP, quest completions and streaks.
--
--  1. complete_quest: at most 15 completions per local day per user.
--     Undoing a completion does not give the slot back, so the
--     complete -> undo -> complete loop cannot farm XP. Calls are
--     serialized per user (row lock taken first), so firing many
--     requests in parallel cannot double-award a quest.
--  2. The app can no longer write XP, levels, streaks, completions,
--     quests or scores at all: INSERT/UPDATE/DELETE privileges are
--     revoked from anon/authenticated and the old "owner can update"
--     policies are dropped. Only the quest RPCs (now SECURITY DEFINER,
--     each checking auth.uid()) and the service role write them.
--  3. Streaks follow the user's timezone: a pg_cron job every 15 min
--     sets current_streak to 0 for anyone whose last active day is
--     before yesterday in their own timezone, and a BEFORE trigger on
--     gamification applies the same rule to every write, so a stale
--     streak can never be saved or restored.
--  4. Timezone hopping (to get a "new day" early and reset the daily
--     XP cap and completion limit) is throttled: after onboarding, the
--     timezone can change once every 7 days.

----------------------------------------------------------------------
-- Timezone helpers. An unknown zone name falls back to UTC instead of
-- raising, so one bad profile cannot break the nightly/streak jobs.
----------------------------------------------------------------------
create or replace function public.safe_tz(p_tz text)
returns text
language sql stable
set search_path = public, pg_catalog
as $$
  select case
    when p_tz is not null
     and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz)
    then p_tz else 'UTC' end
$$;

create or replace function public.user_today(p_user uuid)
returns date language sql stable security definer
set search_path = public as $$
  select (now() at time zone public.safe_tz(
    (select timezone from profiles where id = p_user)))::date
$$;

-- How many quests one user may complete per local day.
create or replace function public.daily_completion_limit()
returns int language sql immutable as $$ select 15 $$;

create index if not exists quest_completions_user_time_idx
  on public.quest_completions (user_id, completed_at);
create index if not exists gamification_active_streak_idx
  on public.gamification (last_active_date) where current_streak > 0;

----------------------------------------------------------------------
-- (2) Lock the scoring tables. Reads keep working through the
-- existing select policies; every write must go through an RPC.
----------------------------------------------------------------------
revoke insert, update, delete, truncate on
  public.gamification, public.quest_completions, public.quests,
  public.daily_scores, public.achievements
  from anon, authenticated;

drop policy if exists gamification_update on public.gamification;

drop policy if exists completions_owner on public.quest_completions;
drop policy if exists completions_read on public.quest_completions;
create policy completions_read on public.quest_completions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists quests_owner on public.quests;
drop policy if exists quests_read on public.quests;
create policy quests_read on public.quests
  for select to authenticated using (user_id = auth.uid());

-- The quest RPCs now run as the table owner. Each one already checks
-- auth.uid() and quest ownership before touching anything.
alter function public.assign_daily_quests(date) security definer;
alter function public.skip_quest(uuid) security definer;
alter function public.undo_quest_completion(uuid) security definer;

----------------------------------------------------------------------
-- (3) Streak rule, applied on every write to gamification.
-- A streak is alive only if the last active day is today or yesterday
-- in the user's timezone. Runs after the RPC-only trigger (name order).
----------------------------------------------------------------------
create or replace function public.enforce_streak_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.current_streak := greatest(coalesce(new.current_streak, 0), 0);
  if new.current_streak > 0 and (
       new.last_active_date is null
       or new.last_active_date < public.user_today(new.user_id) - 1) then
    new.current_streak := 0;
  end if;
  new.best_streak := greatest(coalesce(new.best_streak, 0), new.current_streak);
  return new;
end;
$$;

drop trigger if exists gamification_streak_rules on public.gamification;
create trigger gamification_streak_rules
  before insert or update on public.gamification
  for each row execute function public.enforce_streak_rules();

-- Midnight reset for everyone, in their own timezone. pg_cron runs on
-- UTC, so this runs every 15 minutes: that catches midnight in every
-- zone (including +05:30 and +05:45) within 15 minutes, and running it
-- more often than needed is harmless because it only touches rows
-- that are actually stale.
create or replace function public.expire_stale_streaks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update gamification g set current_streak = 0
  from profiles p
  where p.id = g.user_id
    and g.current_streak > 0
    and (g.last_active_date is null
         or g.last_active_date
            < (now() at time zone public.safe_tz(p.timezone))::date - 1);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_streaks() from public, anon, authenticated;
grant execute on function public.expire_stale_streaks() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-stale-streaks') then
    perform cron.unschedule('expire-stale-streaks');
  end if;
  perform cron.schedule(
    'expire-stale-streaks',
    '*/15 * * * *',
    'select public.expire_stale_streaks()'
  );
end;
$$;

-- Fix anyone who is already stale when this migration runs.
select public.expire_stale_streaks();

----------------------------------------------------------------------
-- Streak freeze: protects today only. It can no longer revive a streak
-- that already broke (freezing the day after a missed day used to
-- bridge the gap).
----------------------------------------------------------------------
create or replace function public.use_streak_freeze()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_gam gamification%rowtype;
  v_today date := public.user_today(auth.uid());
  v_week date := date_trunc('week', public.user_today(auth.uid()))::date;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_gam from gamification where user_id = v_user for update;
  if not found then
    raise exception 'no_gamification';
  end if;
  if coalesce(v_gam.current_streak, 0) = 0
     or v_gam.last_active_date is null
     or v_gam.last_active_date < v_today - 1 then
    raise exception 'no_streak_to_freeze';
  end if;
  if v_gam.streak_freeze_week = v_week then
    raise exception 'freeze_already_used_this_week';
  end if;
  if v_gam.last_active_date = v_today then
    raise exception 'already_active_today';
  end if;

  update gamification set
    last_active_date = v_today,
    streak_freeze_week = v_week
  where user_id = v_user;

  return jsonb_build_object(
    'used', true,
    'week', v_week,
    'current_streak', v_gam.current_streak
  );
end;
$$;

----------------------------------------------------------------------
-- (1) complete_quest with the daily completion limit.
-- Game rules unchanged from 0010: Easy 10 / Medium 20 / Hard 50,
-- +5 before 6 PM local, streak bonus +10 per streak day (max 100)
-- once per day, 500 XP/day cap.
----------------------------------------------------------------------
create or replace function public.complete_quest(p_quest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quest quests%rowtype;
  v_tz text;
  v_today date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_done_today int;
  v_hour int;
  v_base int;
  v_time_bonus int := 0;
  v_streak_bonus int := 0;
  v_first_today boolean;
  v_xp int;
  v_cap int := 500;
  v_xp_today int;
  v_awarded int;
  v_gam gamification%rowtype;
  v_old_level int;
  v_new_total int;
  v_new_level int;
  v_level_up boolean;
  v_last_active date;
  v_cur_streak int;
  v_best_streak int;
  v_score int;
  v_new_badges text[] := '{}';
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  -- Serialize this user's calls: parallel requests wait here, so the
  -- checks below always see the previous call's completion.
  select * into v_gam from gamification where user_id = v_user for update;
  if not found then
    raise exception 'no_gamification';
  end if;

  select * into v_quest from quests where id = p_quest_id;
  if not found then
    raise exception 'quest_not_found';
  end if;
  if v_quest.user_id <> v_user then
    raise exception 'not_your_quest';
  end if;
  if v_quest.skipped then
    raise exception 'quest_skipped';
  end if;

  -- idempotent: already live-completed -> return current state
  if exists (select 1 from quest_completions
             where quest_id = p_quest_id and undone_at is null) then
    return public.quest_state(p_quest_id);
  end if;

  select public.safe_tz(timezone) into v_tz from profiles where id = v_user;
  v_today := (now() at time zone v_tz)::date;
  v_day_start := v_today::timestamp at time zone v_tz;
  v_day_end := (v_today + 1)::timestamp at time zone v_tz;

  -- Only today's quests (yesterday/tomorrow allowed for offline sync
  -- and a device clock that disagrees with the profile timezone).
  if v_quest.assigned_date not between v_today - 1 and v_today + 1 then
    raise exception 'quest_not_today';
  end if;

  -- Daily completion limit. Undone completions still count.
  select count(*) into v_done_today
  from quest_completions c
  where c.user_id = v_user
    and c.completed_at >= v_day_start and c.completed_at < v_day_end;
  if v_done_today >= public.daily_completion_limit() then
    raise exception 'daily_completion_limit'
      using hint = format('At most %s quest completions per day.',
                          public.daily_completion_limit());
  end if;

  v_hour := extract(hour from now() at time zone v_tz)::int;
  v_base := v_quest.xp_reward;
  if v_hour < 18 then
    v_time_bonus := 5;
  end if;

  v_first_today := not exists (
    select 1 from quest_completions c
    join quests q on q.id = c.quest_id
    where c.user_id = v_user and c.undone_at is null
      and q.assigned_date = v_today
  );

  -- streak: consecutive-day logic on the user's timezone
  v_cur_streak := coalesce(v_gam.current_streak, 0);
  v_last_active := v_gam.last_active_date;
  if v_last_active = v_today then
    v_cur_streak := greatest(v_cur_streak, 1);
  elsif v_last_active = v_today - 1 then
    v_cur_streak := v_cur_streak + 1;
  else
    v_cur_streak := 1;
  end if;
  v_best_streak := greatest(coalesce(v_gam.best_streak, 0), v_cur_streak);

  -- streak bonus once per day, sized by the streak including today
  if v_first_today then
    v_streak_bonus := least(10 * v_cur_streak, 100);
  end if;
  v_xp := v_base + v_time_bonus + v_streak_bonus;

  -- daily XP cap with per-day reset
  v_xp_today := case when v_gam.xp_today_date = v_today then v_gam.xp_today else 0 end;
  v_awarded := greatest(0, least(v_xp, v_cap - v_xp_today));

  insert into quest_completions (
    user_id, quest_id, xp_awarded,
    prev_current_streak, prev_best_streak, prev_last_active_date
  ) values (
    v_user, p_quest_id, v_awarded,
    case when v_first_today then coalesce(v_gam.current_streak, 0) end,
    case when v_first_today then coalesce(v_gam.best_streak, 0) end,
    case when v_first_today then v_gam.last_active_date end
  );

  v_old_level := coalesce(v_gam.level, 1);
  v_new_total := coalesce(v_gam.total_xp, 0) + v_awarded;
  v_new_level := public.level_for_xp(v_new_total);

  update gamification set
    total_xp = v_new_total,
    xp_today = v_xp_today + v_awarded,
    xp_today_date = v_today,
    level = v_new_level,
    current_streak = v_cur_streak,
    best_streak = v_best_streak,
    last_active_date = v_today
  where user_id = v_user;

  perform public.recompute_daily_score(v_user, v_quest.assigned_date);

  -- badge evaluation may add badge XP + level-ups; read the FINAL state
  v_new_badges := public.evaluate_badges(v_user);

  select g.total_xp, g.level into v_new_total, v_new_level
  from gamification g where g.user_id = v_user;
  v_level_up := v_new_level > v_old_level;

  select overall into v_score from daily_scores
    where user_id = v_user and score_date = v_quest.assigned_date;

  return jsonb_build_object(
    'quest_id', p_quest_id,
    'xp_awarded', v_awarded,
    'time_bonus', v_time_bonus,
    'streak_bonus', v_streak_bonus,
    'total_xp', v_new_total,
    'level', v_new_level,
    'level_up', v_level_up,
    'daily_score', coalesce(v_score, 0),
    'current_streak', v_cur_streak,
    'best_streak', v_best_streak,
    'new_badges', to_jsonb(v_new_badges),
    'completions_today', v_done_today + 1,
    'completions_limit', public.daily_completion_limit()
  );
end;
$$;

----------------------------------------------------------------------
-- assign_daily_quests takes the device's local date. A quest created
-- on behalf of a signed-in user (auth.uid() set) must be for today
-- +/- 1 day in the profile timezone, so a changed device clock cannot
-- stock up quests for other days. Server jobs (no auth.uid()) are not
-- limited.
----------------------------------------------------------------------
create or replace function public.guard_quest_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.assigned_date not between public.user_today(new.user_id) - 1
                                   and public.user_today(new.user_id) + 1 then
    raise exception 'quest_date_out_of_range';
  end if;
  return new;
end;
$$;

drop trigger if exists quests_date_guard on public.quests;
create trigger quests_date_guard
  before insert on public.quests
  for each row execute function public.guard_quest_date();

----------------------------------------------------------------------
-- (4) Timezone changes: free during onboarding, then once per 7 days.
-- Server roles (service_role, migrations, dashboard) are not limited.
----------------------------------------------------------------------
alter table public.profiles
  add column if not exists timezone_changed_at timestamptz;

create or replace function public.throttle_timezone_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.timezone is not distinct from old.timezone then
    return new;
  end if;
  if not old.onboarding_completed then
    return new;
  end if;
  if current_user in ('authenticated', 'anon')
     and old.timezone_changed_at is not null
     and old.timezone_changed_at > now() - interval '7 days' then
    raise exception 'timezone_change_too_soon'
      using errcode = 'P0001',
            hint = 'The timezone can be changed once every 7 days.';
  end if;
  new.timezone_changed_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_timezone_throttle on public.profiles;
create trigger profiles_timezone_throttle
  before update of timezone on public.profiles
  for each row execute function public.throttle_timezone_change();

----------------------------------------------------------------------
-- Who may call what. Definer functions are exposed only to signed-in
-- users; their own auth.uid() checks do the rest.
----------------------------------------------------------------------
revoke execute on function public.complete_quest(uuid) from public, anon;
revoke execute on function public.undo_quest_completion(uuid) from public, anon;
revoke execute on function public.skip_quest(uuid) from public, anon;
revoke execute on function public.assign_daily_quests(date) from public, anon;
revoke execute on function public.use_streak_freeze() from public, anon;
grant execute on function public.complete_quest(uuid) to authenticated;
grant execute on function public.undo_quest_completion(uuid) to authenticated;
grant execute on function public.skip_quest(uuid) to authenticated;
grant execute on function public.assign_daily_quests(date) to authenticated;
grant execute on function public.use_streak_freeze() to authenticated;
