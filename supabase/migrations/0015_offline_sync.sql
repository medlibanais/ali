-- PrayerLock 0015: offline quest completions.
--
-- The app queues completions made without a connection and replays them
-- in order when it is back online, through sync_quest_completion():
--
--  1. Idempotency. Every queued completion carries a client-generated
--     id. A replay of the same id (lost response, app killed mid-sync,
--     two tabs draining the same queue) never awards XP twice, even if
--     the first completion was undone since.
--  2. Day attribution. The completion counts on the day it happened in
--     the user's timezone, not the day it reached the server: the
--     15-per-day limit, the 500 XP/day cap, the +5 before-6-PM bonus
--     and the streak all use that day. A streak that the midnight job
--     zeroed because the completion was still in the queue is repaired.
--  3. Anti-cheat bounds on the client timestamp. The server cannot
--     verify a device clock, so the claimed time is only trusted inside
--     a narrow window:
--       * never in the future (clamped to now()),
--       * never before the quest existed (clamped to quests.created_at),
--       * never more than offline_sync_grace() (24 h) ago -> rejected,
--       * the quest must belong to that day (+/- 1 like complete_quest).
--     The worst a forged timestamp can do is what an honest offline user
--     gets: +5 XP for a quest claimed before 6 PM, and keep yesterday's
--     streak alive with a quest that was really assigned yesterday. Every
--     completion that arrives late is marked (synced_at) for auditing.
--  4. sync_quest_undo(): an undo tapped offline inside the 10 s window is
--     honoured when it arrives later, judged by when it was tapped. An
--     undo only takes XP away, so trusting its time cannot farm anything;
--     it is still bounded (not before the completion, not in the future,
--     not older than the grace window).
--  5. complete_quest() and undo_quest_completion() are unchanged and stay
--     the online path.

----------------------------------------------------------------------
-- Columns
----------------------------------------------------------------------
alter table public.quest_completions
  add column if not exists client_id uuid,
  add column if not exists synced_at timestamptz;

create unique index if not exists quest_completions_client_uidx
  on public.quest_completions (user_id, client_id)
  where client_id is not null;

-- The streak a reset destroyed, kept for one day so a completion that
-- was waiting in the offline queue can repair it.
alter table public.gamification
  add column if not exists lapsed_streak int,
  add column if not exists lapsed_last_active_date date;

-- How far back a queued completion may claim to have happened.
create or replace function public.offline_sync_grace()
returns interval language sql immutable as $$ select interval '24 hours' $$;

----------------------------------------------------------------------
-- Streak rule (from 0013) now also remembers the streak it ends.
-- Whenever a live-but-stale streak is replaced (the 15-minute job
-- zeroes it, or complete_quest restarts it at 1), the old value and its
-- last active day go to lapsed_*. A write that extends the old chain
-- (the offline repair below) is not a reset and records nothing.
----------------------------------------------------------------------
create or replace function public.enforce_streak_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.user_today(new.user_id);
begin
  if tg_op = 'UPDATE'
     and coalesce(old.current_streak, 0) > 0
     and old.last_active_date is not null
     and old.last_active_date < v_today - 1
     and coalesce(new.current_streak, 0) <= old.current_streak then
    new.lapsed_streak := old.current_streak;
    new.lapsed_last_active_date := old.last_active_date;
  end if;

  new.current_streak := greatest(coalesce(new.current_streak, 0), 0);
  if new.current_streak > 0 and (
       new.last_active_date is null
       or new.last_active_date < v_today - 1) then
    new.current_streak := 0;
  end if;
  new.best_streak := greatest(coalesce(new.best_streak, 0), new.current_streak);
  return new;
end;
$$;

----------------------------------------------------------------------
-- sync_quest_completion(quest, client id, when it happened)
----------------------------------------------------------------------
create or replace function public.sync_quest_completion(
  p_quest_id uuid,
  p_client_id uuid,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_gam gamification%rowtype;
  v_quest quests%rowtype;
  v_dup_quest uuid;
  v_tz text;
  v_at timestamptz;
  v_today date;
  v_day date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_done_day int;
  v_time_bonus int := 0;
  v_streak_bonus int := 0;
  v_first_day boolean;
  v_xp int;
  v_cap int := 500;
  v_xp_day int;
  v_awarded int;
  v_old_level int;
  v_new_total int;
  v_new_level int;
  v_level_up boolean;
  v_cur_streak int;
  v_best_streak int;
  v_last_active date;
  v_chain int;
  v_streak_through_day int;
  v_used_lapsed boolean := false;
  v_today_first uuid;
  v_score int;
  v_new_badges text[] := '{}';
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_client_id is null or p_completed_at is null then
    raise exception 'invalid_sync_payload';
  end if;

  -- Serialize this user's calls (same lock order as complete_quest).
  select * into v_gam from gamification where user_id = v_user for update;
  if not found then
    raise exception 'no_gamification';
  end if;

  -- (1) Replay of a completion we already took: report, never re-award.
  select quest_id into v_dup_quest from quest_completions
    where user_id = v_user and client_id = p_client_id;
  if found then
    return public.quest_state(v_dup_quest)
      || jsonb_build_object('duplicate', true);
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

  -- Already completed by another call: another device, or the online
  -- call whose answer was lost before the app queued it. Server wins;
  -- nothing more is awarded. 'conflict' lets the app tell the user.
  if exists (select 1 from quest_completions
             where quest_id = p_quest_id and undone_at is null) then
    return public.quest_state(p_quest_id)
      || jsonb_build_object('duplicate', true, 'conflict', true);
  end if;

  -- (3) Bound the device's claimed time.
  v_at := least(p_completed_at, v_now);
  if v_at < v_now - public.offline_sync_grace() then
    raise exception 'offline_completion_too_old';
  end if;
  v_at := greatest(v_at, v_quest.created_at);

  select public.safe_tz(timezone) into v_tz from profiles where id = v_user;
  v_today := (v_now at time zone v_tz)::date;
  v_day := (v_at at time zone v_tz)::date;
  if v_day < v_today - 1 then
    raise exception 'offline_completion_too_old';
  end if;
  if v_quest.assigned_date not between v_day - 1 and v_day + 1 then
    raise exception 'quest_not_today';
  end if;

  v_day_start := v_day::timestamp at time zone v_tz;
  v_day_end := (v_day + 1)::timestamp at time zone v_tz;

  -- (2) Limits of the day the quest was done on. Undone ones count.
  select count(*) into v_done_day
  from quest_completions c
  where c.user_id = v_user
    and c.completed_at >= v_day_start and c.completed_at < v_day_end;
  if v_done_day >= public.daily_completion_limit() then
    raise exception 'daily_completion_limit'
      using hint = format('At most %s quest completions per day.',
                          public.daily_completion_limit());
  end if;

  if extract(hour from v_at at time zone v_tz)::int < 18 then
    v_time_bonus := 5;
  end if;

  v_first_day := not exists (
    select 1 from quest_completions c
    join quests q on q.id = c.quest_id
    where c.user_id = v_user and c.undone_at is null
      and (q.assigned_date = v_day
           or (c.completed_at >= v_day_start and c.completed_at < v_day_end))
  );

  -- Streak, seen from the day of the completion.
  v_cur_streak := coalesce(v_gam.current_streak, 0);
  v_last_active := v_gam.last_active_date;
  v_streak_through_day := null;

  if v_day = v_today then
    -- Same rule as complete_quest.
    if v_last_active = v_today then
      v_cur_streak := greatest(v_cur_streak, 1);
    elsif v_last_active = v_today - 1 then
      v_cur_streak := v_cur_streak + 1;
    else
      v_cur_streak := 1;
    end if;
    v_last_active := v_today;
    v_streak_through_day := v_cur_streak;
  else
    -- v_day is yesterday.
    if v_last_active = v_day then
      v_streak_through_day := greatest(v_cur_streak, 1);
    elsif v_last_active = v_day - 1 then
      -- The chain ended the day before: extend it, even if the midnight
      -- job already zeroed it.
      v_chain := case
        when v_cur_streak > 0 then v_cur_streak
        when v_gam.lapsed_last_active_date = v_day - 1
          then coalesce(v_gam.lapsed_streak, 0)
        else 0 end;
      v_used_lapsed := v_cur_streak = 0 and v_chain > 0;
      v_cur_streak := v_chain + 1;
      v_last_active := v_day;
      v_streak_through_day := v_cur_streak;
    elsif v_last_active = v_today then
      if v_first_day and v_cur_streak <= 1 then
        -- Today restarted at 1 because yesterday looked empty. Yesterday
        -- was not empty: rebuild the chain through yesterday into today.
        v_chain := case
          when v_gam.lapsed_last_active_date = v_day - 1
            then coalesce(v_gam.lapsed_streak, 0)
          else 0 end;
        v_used_lapsed := v_chain > 0;
        v_streak_through_day := v_chain + 1;
        v_cur_streak := v_streak_through_day + 1;
        -- An undo of today's first completion must fall back to the
        -- repaired yesterday, not to the broken state.
        select c.id into v_today_first
        from quest_completions c
        where c.user_id = v_user and c.undone_at is null
          and c.prev_current_streak is not null
          and c.completed_at >= v_today::timestamp at time zone v_tz
        order by c.completed_at
        limit 1;
        if v_today_first is not null then
          update quest_completions set
            prev_current_streak = v_streak_through_day,
            prev_best_streak = greatest(coalesce(v_gam.best_streak, 0),
                                        v_streak_through_day),
            prev_last_active_date = v_day
          where id = v_today_first;
        end if;
      else
        v_streak_through_day := greatest(v_cur_streak - 1, 1);
      end if;
    else
      v_cur_streak := 1;
      v_last_active := v_day;
      v_streak_through_day := 1;
    end if;
  end if;
  v_best_streak := greatest(coalesce(v_gam.best_streak, 0), v_cur_streak);

  if v_first_day then
    v_streak_bonus := least(10 * v_streak_through_day, 100);
  end if;
  v_xp := v_quest.xp_reward + v_time_bonus + v_streak_bonus;

  -- Daily XP cap of that day.
  if v_day = v_today then
    v_xp_day := case when v_gam.xp_today_date = v_today then v_gam.xp_today else 0 end;
  else
    select coalesce(sum(c.xp_awarded), 0) into v_xp_day
    from quest_completions c
    where c.user_id = v_user and c.undone_at is null
      and c.completed_at >= v_day_start and c.completed_at < v_day_end;
  end if;
  v_awarded := greatest(0, least(v_xp, v_cap - v_xp_day));

  insert into quest_completions (
    user_id, quest_id, xp_awarded, completed_at, client_id, synced_at,
    prev_current_streak, prev_best_streak, prev_last_active_date
  ) values (
    v_user, p_quest_id, v_awarded, v_at, p_client_id,
    case when v_now - v_at > interval '1 minute' then v_now end,
    case when v_first_day and v_day = v_today then coalesce(v_gam.current_streak, 0) end,
    case when v_first_day and v_day = v_today then coalesce(v_gam.best_streak, 0) end,
    case when v_first_day and v_day = v_today then v_gam.last_active_date end
  );

  v_old_level := coalesce(v_gam.level, 1);
  v_new_total := coalesce(v_gam.total_xp, 0) + v_awarded;
  v_new_level := public.level_for_xp(v_new_total);

  update gamification set
    total_xp = v_new_total,
    level = v_new_level,
    xp_today = case when v_day = v_today then v_xp_day + v_awarded else xp_today end,
    xp_today_date = case when v_day = v_today then v_today else xp_today_date end,
    current_streak = v_cur_streak,
    best_streak = v_best_streak,
    last_active_date = greatest(coalesce(last_active_date, v_last_active), v_last_active),
    lapsed_streak = case when v_used_lapsed then null else lapsed_streak end,
    lapsed_last_active_date = case when v_used_lapsed then null else lapsed_last_active_date end
  where user_id = v_user;

  perform public.recompute_daily_score(v_user, v_quest.assigned_date);
  v_new_badges := public.evaluate_badges(v_user);

  select g.total_xp, g.level, g.current_streak, g.best_streak
    into v_new_total, v_new_level, v_cur_streak, v_best_streak
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
    'completed_at', v_at,
    'counted_on', v_day,
    'duplicate', false
  );
end;
$$;

revoke execute on function public.sync_quest_completion(uuid, uuid, timestamptz)
  from public, anon;
grant execute on function public.sync_quest_completion(uuid, uuid, timestamptz)
  to authenticated;

----------------------------------------------------------------------
-- sync_quest_undo(quest, when the undo was tapped)
----------------------------------------------------------------------
create or replace function public.sync_quest_undo(
  p_quest_id uuid,
  p_undone_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_comp quest_completions%rowtype;
  v_at timestamptz;
  v_tz text;
  v_today date;
  v_comp_day date;
  v_next uuid;
  v_new_total int;
  v_streak int;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_undone_at is null then
    raise exception 'invalid_sync_payload';
  end if;

  perform 1 from gamification where user_id = v_user for update;

  select * into v_comp from quest_completions
    where quest_id = p_quest_id and undone_at is null;
  if not found then
    -- Nothing live to undo: undone already (replay, or another device).
    if exists (select 1 from quests where id = p_quest_id and user_id = v_user) then
      return jsonb_build_object('quest_id', p_quest_id, 'duplicate', true, 'conflict', true);
    end if;
    raise exception 'quest_not_found';
  end if;
  if v_comp.user_id <> v_user then
    raise exception 'not_your_quest';
  end if;

  v_at := least(p_undone_at, v_now);
  if v_at < v_now - public.offline_sync_grace() then
    raise exception 'offline_undo_too_old';
  end if;
  v_at := greatest(v_at, v_comp.completed_at);
  -- Same window the online undo allows (UI shows 10 s).
  if v_at > v_comp.completed_at + interval '15 seconds' then
    raise exception 'undo_window_expired';
  end if;

  update quest_completions set undone_at = v_now where id = v_comp.id;

  select public.safe_tz(timezone) into v_tz from profiles where id = v_user;
  v_today := (v_now at time zone v_tz)::date;
  v_comp_day := (v_comp.completed_at at time zone v_tz)::date;

  update gamification g set
    total_xp = greatest(0, g.total_xp - v_comp.xp_awarded),
    xp_today = case
      when v_comp_day = v_today and g.xp_today_date = v_today
        then greatest(0, g.xp_today - v_comp.xp_awarded)
      else g.xp_today end,
    level = public.level_for_xp(greatest(0, g.total_xp - v_comp.xp_awarded))
  where g.user_id = v_user
  returning total_xp, current_streak into v_new_total, v_streak;

  -- Streak rollback, as in undo_quest_completion.
  if v_comp.prev_current_streak is not null then
    select c.id into v_next
    from quest_completions c
    join quests q on q.id = c.quest_id
    where c.user_id = v_user and c.undone_at is null
      and q.assigned_date = v_comp_day
    order by c.completed_at
    limit 1;

    if v_next is null then
      update gamification set
        current_streak = v_comp.prev_current_streak,
        best_streak = v_comp.prev_best_streak,
        last_active_date = v_comp.prev_last_active_date
      where user_id = v_user
      returning current_streak into v_streak;
    else
      update quest_completions set
        prev_current_streak = v_comp.prev_current_streak,
        prev_best_streak = v_comp.prev_best_streak,
        prev_last_active_date = v_comp.prev_last_active_date
      where id = v_next;
    end if;
  end if;

  perform public.recompute_daily_score(v_user,
    (select assigned_date from quests where id = p_quest_id));

  return jsonb_build_object(
    'quest_id', p_quest_id,
    'xp_refunded', v_comp.xp_awarded,
    'total_xp', v_new_total,
    'current_streak', v_streak,
    'duplicate', false
  );
end;
$$;

revoke execute on function public.sync_quest_undo(uuid, timestamptz) from public, anon;
grant execute on function public.sync_quest_undo(uuid, timestamptz) to authenticated;
