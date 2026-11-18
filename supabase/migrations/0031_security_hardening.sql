-- PrayerLock 0031: backend hardening against client-side manipulation.
-- (Renumbered from 0030: main had two 0030 files, and db push refuses a
-- duplicate version. 0030_avatar_generation_jobs sorts first, so on a
-- project where one 0030 already ran, it is that one; this file still runs.)
--
-- Builds on 0012 (friends hardening) and 0013 (anti-cheat), which already
-- made XP, completions, quests, scores and badges RPC-only. This adds:
--
--  1. complete_quest, stricter:
--     * the quest must belong to the caller. A quest that does not exist
--       and a quest that belongs to someone else give the SAME error
--       (quest_not_found), so quest ids of other users cannot be probed;
--     * the quest must be assigned for today in the user's timezone.
--       One exception: yesterday's quest is still accepted during the
--       first late_completion_grace() (2 h) after local midnight, so a
--       quest ticked offline at 23:50 and synced at 00:10 is not lost.
--       (0013 accepted yesterday AND tomorrow at any hour.);
--     * a quest that is already completed raises already_completed
--       (0013 silently returned the current state);
--     * rate limit: more than 10 calls in 5 seconds raises rate_limited.
--       Counted in the new rate_limits table;
--     * a fixed delay (complete_quest_delay(), 0.5 s) on accepted calls.
--       See the note at complete_quest_delay() for what it does and does
--       not do, and how to switch it off.
--  2. gamification: INSERT/UPDATE/DELETE privileges revoked again from
--     anon/authenticated, including any column-level UPDATE grant, so the
--     only way XP changes is the SECURITY DEFINER RPCs.
--  3. messages (coach chat): the app may only read its own messages and
--     change the thumbs up/down. Inserting (forging "assistant" replies
--     that the coach then reads back as history) and deleting (resetting
--     the 20 messages/day count) are revoked. The coach Edge Function
--     writes with the service role, so it is not affected. Conversations
--     can no longer be deleted by the app for the same reason.
--  4. profiles: a trigger stops the app from
--     * clearing timezone_changed_at (which bypassed the 7-day timezone
--       throttle from 0013),
--     * turning onboarding_completed back to false (same bypass),
--     * pointing photo/avatar URLs at anything but the user's own folder
--       in the profile-photos bucket,
--     * storing oversized names or avatar configs.
--     Goal free-text fields (they are read into the coach prompt) are
--     capped at 300 characters.
--  5. Storage, profile-photos bucket: listing/reading through the API is
--     limited to your own folder and to people who can see your profile
--     (friends, pending requests). Uploads must be images of at most
--     5 MB. The bucket stays "public" so existing avatar links keep
--     working; see the note in section 5.

----------------------------------------------------------------------
-- (1a) Rate limits
----------------------------------------------------------------------
create table if not exists public.rate_limits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  called_at timestamptz not null default now()
);

create index if not exists rate_limits_user_action_time_idx
  on public.rate_limits (user_id, action, called_at desc);

-- Server-only table: RLS on, no policies, no client privileges.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Records one call of p_action by p_user, or raises rate_limited when
-- the user already made p_max calls in the last p_window. Old rows of
-- this user/action are pruned on the way, so the table stays small.
-- Note: when the calling RPC later raises an error, its transaction is
-- rolled back and the call is not counted. Only accepted calls count.
create or replace function public.hit_rate_limit(
  p_user uuid,
  p_action text,
  p_max int,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  delete from rate_limits
  where user_id = p_user and action = p_action
    and called_at < now() - greatest(p_window, interval '1 minute');

  select count(*) into v_recent
  from rate_limits
  where user_id = p_user and action = p_action
    and called_at > now() - p_window;

  if v_recent >= p_max then
    raise exception 'rate_limited'
      using errcode = 'P0001',
            hint = format('At most %s calls per %s. Try again in a moment.',
                          p_max, p_window);
  end if;

  insert into rate_limits (user_id, action) values (p_user, p_action);
end;
$$;

revoke execute on function public.hit_rate_limit(uuid, text, int, interval)
  from public, anon, authenticated;

----------------------------------------------------------------------
-- (1b) Tunables for complete_quest. Change one with
-- `create or replace function ...` in a new migration.
----------------------------------------------------------------------

-- Calls per window for complete_quest.
create or replace function public.complete_quest_rate_max()
returns int language sql immutable as $$ select 10 $$;
create or replace function public.complete_quest_rate_window()
returns interval language sql immutable as $$ select interval '5 seconds' $$;

-- How long after local midnight yesterday's quests can still be completed.
create or replace function public.late_completion_grace()
returns interval language sql immutable as $$ select interval '2 hours' $$;

-- Fixed delay on every ACCEPTED complete_quest call.
-- What it does: makes each completion take at least 0.5 s server-side,
-- which slows any script that grinds through quests. It does not add
-- real protection against timing attacks (the error codes already say
-- what failed, and those are now uniform where it matters), and it holds
-- a database connection while it waits. It is applied after the rate
-- limit, so one user can hold at most ~1 s of connection time per 5 s.
-- Rejected calls are not delayed, so a flood of bad calls cannot tie up
-- the connection pool. The app shows completions optimistically, so the
-- person does not see the wait.
-- To switch it off: create or replace this function to return 0 seconds.
create or replace function public.complete_quest_delay()
returns interval language sql immutable as $$ select interval '0.5 seconds' $$;

----------------------------------------------------------------------
-- (1c) complete_quest. Game rules unchanged from 0013: Easy 10 /
-- Medium 20 / Hard 50, +5 before 6 PM local, streak bonus +10 per streak
-- day (max 100) once per day, 500 XP/day cap, 15 completions per day.
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
  v_now_local timestamp;
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
  if p_quest_id is null then
    raise exception 'quest_not_found';
  end if;

  -- Parallel calls from one user wait for each other below; don't let a
  -- flood of them wait forever.
  perform set_config('lock_timeout', '3s', true);

  -- Serialize this user's calls: parallel requests wait here, so the
  -- checks below always see the previous call's completion.
  select * into v_gam from gamification where user_id = v_user for update;
  if not found then
    raise exception 'no_gamification';
  end if;

  -- Rate limit (inside the lock, so the count is exact).
  perform public.hit_rate_limit(
    v_user, 'complete_quest',
    public.complete_quest_rate_max(), public.complete_quest_rate_window());

  -- Ownership. Not found and not yours are the same answer on purpose.
  select * into v_quest from quests
  where id = p_quest_id and user_id = v_user;
  if not found then
    raise exception 'quest_not_found';
  end if;
  if v_quest.skipped then
    raise exception 'quest_skipped';
  end if;

  if exists (select 1 from quest_completions
             where quest_id = p_quest_id and undone_at is null) then
    raise exception 'already_completed';
  end if;

  -- Today in the user's timezone (plus the short after-midnight grace).
  select public.safe_tz(timezone) into v_tz from profiles where id = v_user;
  v_now_local := now() at time zone v_tz;
  v_today := v_now_local::date;
  v_day_start := v_today::timestamp at time zone v_tz;
  v_day_end := (v_today + 1)::timestamp at time zone v_tz;

  if not (
       v_quest.assigned_date = v_today
       or (v_quest.assigned_date = v_today - 1
           and v_now_local < v_today::timestamp + public.late_completion_grace())
     ) then
    raise exception 'quest_not_today';
  end if;

  -- Daily completion limit (0013). Undone completions still count.
  select count(*) into v_done_today
  from quest_completions c
  where c.user_id = v_user
    and c.completed_at >= v_day_start and c.completed_at < v_day_end;
  if v_done_today >= public.daily_completion_limit() then
    raise exception 'daily_completion_limit'
      using hint = format('At most %s quest completions per day.',
                          public.daily_completion_limit());
  end if;

  -- Every check passed: fixed delay (see complete_quest_delay()).
  if public.complete_quest_delay() > interval '0' then
    perform pg_sleep(extract(epoch from public.complete_quest_delay()));
  end if;

  v_hour := extract(hour from v_now_local)::int;
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

revoke execute on function public.complete_quest(uuid) from public, anon;
grant execute on function public.complete_quest(uuid) to authenticated;

----------------------------------------------------------------------
-- (2) Immutable XP. Users can SELECT gamification (own row, plus friends
-- who share stats); they can never write it. Column-level UPDATE grants
-- survive a table-level REVOKE, so they are removed explicitly.
----------------------------------------------------------------------
revoke insert, update, delete, truncate on public.gamification
  from anon, authenticated;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(attname), ', ') into v_cols
  from pg_attribute
  where attrelid = 'public.gamification'::regclass
    and attnum > 0 and not attisdropped;
  execute format(
    'revoke insert (%1$s), update (%1$s) on public.gamification from anon, authenticated',
    v_cols);
end;
$$;
grant select on public.gamification to authenticated;
drop policy if exists gamification_update on public.gamification;

----------------------------------------------------------------------
-- (3) Coach chat: read your own messages, rate them, nothing else.
----------------------------------------------------------------------
revoke insert, update, delete, truncate on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant update (feedback) on public.messages to authenticated;
revoke delete, truncate on public.conversations from anon, authenticated;

----------------------------------------------------------------------
-- (4) Profiles: fields the app may not tamper with.
----------------------------------------------------------------------
-- True for null, or an http(s) URL into the user's own folder of the
-- profile-photos bucket (what getPublicUrl returns, with or without ?t=).
create or replace function public.is_own_photo_url(p_user uuid, p_url text)
returns boolean
language sql immutable
as $$
  select p_url is null
      or (p_url ~ '^https?://[^/?#]+/storage/v1/object/public/profile-photos/'
          and split_part(split_part(p_url, '/profile-photos/', 2), '/', 1) = p_user::text
          and position('..' in p_url) = 0)
$$;

create or replace function public.guard_profile_client_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Server roles (service_role, migrations, dashboard) are not limited.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Only the timezone throttle trigger may move this.
    new.timezone_changed_at := old.timezone_changed_at;
    if old.onboarding_completed and not new.onboarding_completed then
      raise exception 'onboarding_cannot_be_reset' using errcode = '42501';
    end if;
  end if;

  -- Photo URLs must point into the user's own folder. Only values the
  -- app is changing are checked, so an older row never blocks an edit.
  if not public.is_own_photo_url(new.id, new.photo_url)
       and (tg_op = 'INSERT' or new.photo_url is distinct from old.photo_url)
     or not public.is_own_photo_url(new.id, new.ai_avatar_url)
       and (tg_op = 'INSERT' or new.ai_avatar_url is distinct from old.ai_avatar_url)
     or not public.is_own_photo_url(new.id, new.photoreal_head_url)
       and (tg_op = 'INSERT' or new.photoreal_head_url is distinct from old.photoreal_head_url)
     or not public.is_own_photo_url(new.id, new.photoreal_body_url)
       and (tg_op = 'INSERT' or new.photoreal_body_url is distinct from old.photoreal_body_url)
  then
    raise exception 'invalid_photo_url' using errcode = '22023';
  end if;

  if char_length(coalesce(new.first_name, '')) > 50 then
    raise exception 'first_name_too_long' using errcode = '22001';
  end if;
  if pg_column_size(new.avatar_config) > 32768 then
    raise exception 'avatar_config_too_large' using errcode = '22001';
  end if;
  return new;
end;
$$;

-- Fires before profiles_timezone_throttle (trigger names run in
-- alphabetical order), so the throttle still sets timezone_changed_at.
drop trigger if exists profiles_client_guard on public.profiles;
create trigger profiles_client_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_client_write();

-- Goal free text is read into the coach prompt: keep it short.
-- NOT VALID: existing rows are left alone, new writes are checked.
alter table public.user_goals
  drop constraint if exists user_goals_text_length;
alter table public.user_goals
  add constraint user_goals_text_length check (
    char_length(coalesce(career_goal, '')) <= 300
    and char_length(coalesce(skill_to_develop, '')) <= 300
    and char_length(coalesce(religion, '')) <= 300
    and char_length(coalesce(prayer_frequency, '')) <= 300
    and char_length(coalesce(spiritual_practice, '')) <= 300
    and char_length(coalesce(dream_body, '')) <= 300
    and char_length(coalesce(call_parents_frequency, '')) <= 300
    and char_length(array_to_string(hobbies, ',')) <= 1000
    and char_length(array_to_string(dream_personality, ',')) <= 1000
  ) not valid;

----------------------------------------------------------------------
-- (5) Storage: profile-photos.
-- Reading/listing through the storage API: your own folder, or the
-- folder of someone whose profile you may see (can_see_profile: friends
-- and pending requests). Writes: your own folder only (0001, unchanged).
--
-- The bucket stays public = true. That means anyone who has the exact
-- URL of a file can open it without signing in (that is how avatars
-- appear in the app today). Paths contain the user's id, which is not
-- listed anywhere a stranger can read. Making the bucket fully private
-- needs the app to switch to signed URLs; that is a separate change.
----------------------------------------------------------------------
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'profile-photos';

drop policy if exists profile_photos_read on storage.objects;
create policy profile_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(name))[1]
          and public.can_see_profile(auth.uid(), p.id)
      )
    )
  );
