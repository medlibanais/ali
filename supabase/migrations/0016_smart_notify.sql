-- PrayerLock 0016: smart streak notifications (smart-notify Edge Function).
--
-- Every 2 hours pg_cron calls smart-notify. The function asks
-- smart_notify_candidates() for users who, in their own timezone:
--   * are between 4:00 PM and 8:00 PM right now,
--   * have a live streak (current_streak > 0),
--   * have not completed any quest today,
--   * allow push and "Streak at risk" in notification_preferences,
--   * have at least one device token,
--   * have not already been sent a streak alert today.
-- It claims a row in notification_sends before sending, and the primary
-- key (user_id, kind, local_date) makes a second send that day impossible,
-- even if two runs overlap.
--
-- (0015 is left free for the offline-sync migration in the open PR #34.)

----------------------------------------------------------------------
-- Send log: one row per user, per kind, per local day.
----------------------------------------------------------------------
create table if not exists public.notification_sends (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  local_date date not null,
  status text not null default 'claimed',
  detail text,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);

-- Service role only: RLS on with no policies, so app users can neither
-- read nor write it.
alter table public.notification_sends enable row level security;

----------------------------------------------------------------------
-- Weakest pillar: lowest average pillar score over the last 7 local days
-- (today excluded, it is still in progress). Falls back to the pillar of
-- one of today's open quests, then to health.
----------------------------------------------------------------------
create or replace function public.weakest_pillar(p_user uuid, p_today date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select x.pillar
      from (
        select 'health' as pillar, avg(health) as v, 1 as ord from daily_scores
          where user_id = p_user and score_date >= p_today - 7 and score_date < p_today
        union all
        select 'family', avg(family), 2 from daily_scores
          where user_id = p_user and score_date >= p_today - 7 and score_date < p_today
        union all
        select 'work', avg(work), 3 from daily_scores
          where user_id = p_user and score_date >= p_today - 7 and score_date < p_today
        union all
        select 'fun', avg(fun), 4 from daily_scores
          where user_id = p_user and score_date >= p_today - 7 and score_date < p_today
        union all
        select 'spirituality', avg(spirituality), 5 from daily_scores
          where user_id = p_user and score_date >= p_today - 7 and score_date < p_today
      ) x
      where x.v is not null
      order by x.v asc, x.ord asc
      limit 1
    ),
    (
      select q.pillar
      from quests q
      where q.user_id = p_user
        and q.assigned_date = p_today
        and not q.skipped
      order by q.xp_reward asc, q.pillar
      limit 1
    ),
    'health'
  )
$$;

revoke execute on function public.weakest_pillar(uuid, date) from public, anon, authenticated;
grant execute on function public.weakest_pillar(uuid, date) to service_role;

----------------------------------------------------------------------
-- Who should get a streak-risk push right now.
-- p_start_hour / p_end_hour: local window, end exclusive (16..20 = 4-8 PM).
----------------------------------------------------------------------
create or replace function public.smart_notify_candidates(
  p_start_hour int default 16,
  p_end_hour int default 20,
  p_limit int default 500
)
returns table (
  user_id uuid,
  first_name text,
  timezone text,
  local_date date,
  current_streak int,
  weakest_pillar text
)
language sql
stable
security definer
set search_path = public
as $$
  with clock as (
    select
      p.id,
      p.first_name,
      public.safe_tz(p.timezone) as tz,
      (now() at time zone public.safe_tz(p.timezone)) as local_now
    from profiles p
    where p.onboarding_completed
  ),
  local as (
    select
      c.id,
      c.first_name,
      c.tz,
      c.local_now::date as d,
      extract(hour from c.local_now)::int as h,
      -- [start, end) of the user's local day as timestamptz
      (c.local_now::date::timestamp at time zone c.tz) as day_start,
      ((c.local_now::date + 1)::timestamp at time zone c.tz) as day_end
    from clock c
  )
  select
    l.id,
    l.first_name,
    l.tz,
    l.d,
    g.current_streak,
    public.weakest_pillar(l.id, l.d)
  from local l
  join gamification g on g.user_id = l.id
  left join notification_preferences np on np.user_id = l.id
  where l.h >= p_start_hour
    and l.h < p_end_hour
    and g.current_streak > 0
    -- Nothing done today: no live completion in the local day, and the
    -- streak has not already been counted for today (covers completions
    -- synced from offline with an earlier timestamp).
    and g.last_active_date is distinct from l.d
    and not exists (
      select 1 from quest_completions qc
      where qc.user_id = l.id
        and qc.undone_at is null
        and qc.completed_at >= l.day_start
        and qc.completed_at < l.day_end
    )
    -- Preferences (missing row = defaults, which are on).
    and coalesce(np.push_enabled, true)
    and coalesce(np.streak_risk, true)
    and exists (select 1 from device_tokens dt where dt.user_id = l.id)
    -- Any streak alert already sent today (coach-nudges history, or the
    -- streak_rescue push from the prediction job).
    and not exists (
      select 1 from notifications n
      where n.user_id = l.id
        and n.type in ('streak_risk', 'streak_rescue')
        and n.created_at >= l.day_start
    )
    and not exists (
      select 1 from notification_sends s
      where s.user_id = l.id
        and s.kind = 'streak_risk'
        and s.local_date = l.d
    )
  order by g.current_streak desc
  limit greatest(p_limit, 0)
$$;

revoke execute on function public.smart_notify_candidates(int, int, int) from public, anon, authenticated;
grant execute on function public.smart_notify_candidates(int, int, int) to service_role;

----------------------------------------------------------------------
-- Invoke the Edge Function. Production reads the project URL and cron
-- secret from Supabase Vault (secrets named 'project_url' and
-- 'cron_secret'); without them it falls back to the local dev values
-- every other cron job in this repo uses.
----------------------------------------------------------------------
create or replace function public.invoke_smart_notify()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  exception when others then
    v_url := null;
    v_secret := null;
  end;

  select net.http_post(
    url := coalesce(rtrim(v_url, '/'), 'http://host.docker.internal:54321')
           || '/functions/v1/smart-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(v_secret, 'prayerlock-dev-cron-secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;

revoke execute on function public.invoke_smart_notify() from public, anon, authenticated;

----------------------------------------------------------------------
-- Every 2 hours on the hour (UTC). The 4 PM-8 PM window is 4 hours wide,
-- so every whole-hour and half-hour timezone gets two chances a day.
----------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'smart-notify-2h') then
    perform cron.unschedule('smart-notify-2h');
  end if;
  perform cron.schedule(
    'smart-notify-2h',
    '0 */2 * * *',
    'select public.invoke_smart_notify()'
  );
end;
$$;
