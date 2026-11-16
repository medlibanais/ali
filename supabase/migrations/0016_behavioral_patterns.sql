-- PrayerLock 0016: behavioral pattern detection for Insights.
--
-- (0015 is left free on purpose: open PR #34 ships a 0014 that collides
-- with main and will need renumbering.)
--
-- 1. View public.user_behavioral_patterns: one row for the signed-in user.
--    * The weekday they most often miss quests (last 8 weeks).
--    * Quest completions per time of day (last 8 weeks), in their own
--      timezone: morning 05:00-11:59, afternoon 12:00-16:59, evening
--      17:00-04:59.
--    * The pillar they neglected most in the last 14 days.
--    security_invoker = true, so the caller's RLS on quests and
--    quest_completions applies (owner only). On top of that the view is
--    pinned to auth.uid(): it never returns anyone else's row, and a
--    service-role caller (no auth.uid()) gets nothing.
-- 2. Table public.pattern_insights: the last 2 AI insights per user,
--    written by the generate-insights Edge Function, read by the owner.
--
-- "Missed" = not completed and either skipped or from an earlier day.
-- Today's still-open quests are left out entirely so a morning visit
-- doesn't make every pillar look neglected.

----------------------------------------------------------------------
-- Indexes: none new. The view reads one user's last 56 days through
-- quests_user_date_idx (user_id, assigned_date) and probes each quest's
-- live completion through quest_completions_live_uidx (quest_id) where
-- undone_at is null. EXPLAIN ANALYZE on 3.65M quests / 2.55M
-- completions (2,001 users x 365 days): ~5 ms.
----------------------------------------------------------------------

----------------------------------------------------------------------
-- Fast timezone guard. public.safe_tz scans pg_timezone_names, which
-- costs ~80 ms per call on its own (measured locally) and would blow the
-- view's 100 ms budget. Asking Postgres to use the zone and catching the
-- error gives the same answer (unknown zone -> 'UTC') in microseconds.
----------------------------------------------------------------------
create or replace function public.tz_or_utc(p_tz text)
returns text
language plpgsql stable
set search_path = pg_catalog
as $$
begin
  if p_tz is null or p_tz = '' then
    return 'UTC';
  end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end
$$;

----------------------------------------------------------------------
-- The view
----------------------------------------------------------------------
create or replace view public.user_behavioral_patterns
with (security_invoker = true, security_barrier = true)
as
with me as (
  select
    p.id as user_id,
    tz.name as tz,
    (now() at time zone tz.name)::date as today
  from public.profiles p
  cross join lateral (select public.tz_or_utc(p.timezone) as name) tz
  where p.id = (select auth.uid())
),
q as (
  -- Resolved quests (done, skipped, or from a past day) of the last 8
  -- weeks, with the local hour they were completed in (null = missed).
  select
    q.pillar,
    q.assigned_date,
    extract(dow from q.assigned_date)::int as dow,
    extract(hour from c.completed_at at time zone me.tz)::int as done_hour
  from me
  join public.quests q
    on q.user_id = me.user_id
   and q.assigned_date between me.today - 55 and me.today
  left join public.quest_completions c
    on c.quest_id = q.id
   and c.undone_at is null
  where c.completed_at is not null
     or q.skipped
     or q.assigned_date < me.today
),
by_dow as (
  select
    dow,
    count(*) as total,
    count(*) filter (where done_hour is null) as missed
  from q
  group by dow
),
skip_day as (
  -- At least 3 resolved quests on that weekday, so one bad Tuesday
  -- isn't called a pattern.
  select dow, total, missed, round(100.0 * missed / total)::int as rate
  from by_dow
  where total >= 3 and missed > 0
  order by missed::numeric / total desc, missed desc, dow
  limit 1
),
skip_pillar as (
  select q.pillar
  from q
  join skip_day s on s.dow = q.dow
  where q.done_hour is null
  group by q.pillar
  order by count(*) desc, q.pillar
  limit 1
),
tod as (
  select
    count(*) filter (where done_hour >= 5 and done_hour < 12) as morning,
    count(*) filter (where done_hour >= 12 and done_hour < 17) as afternoon,
    count(*) filter (where done_hour >= 17 or done_hour < 5) as evening
  from q
  where done_hour is not null
),
pillar_last_done as (
  select pillar, max(assigned_date) filter (where done_hour is not null) as last_done
  from q
  group by pillar
),
pillar14 as (
  select
    q.pillar,
    count(*) as total,
    count(q.done_hour) as done
  from q, me
  where q.assigned_date >= me.today - 13
  group by q.pillar
),
neglected as (
  select pillar, total, done, round(100.0 * done / total)::int as rate
  from pillar14
  where done < total
  order by done::numeric / total, done, total desc, pillar
  limit 1
)
select
  me.user_id,
  me.tz as timezone,
  me.today - 55 as window_start,
  me.today as window_end,
  -- Weekday most likely to be skipped. 0 = Sunday .. 6 = Saturday.
  s.dow as skip_weekday,
  trim(to_char(date '2023-01-01' + s.dow, 'Day')) as skip_weekday_name,
  s.rate as skip_rate,
  s.missed::int as skip_missed,
  s.total::int as skip_total,
  sp.pillar as skip_top_pillar,
  -- Completions per time of day.
  t.morning::int as morning_count,
  t.afternoon::int as afternoon_count,
  t.evening::int as evening_count,
  case
    when t.morning + t.afternoon + t.evening = 0 then null
    when t.morning >= t.afternoon and t.morning >= t.evening then 'morning'
    when t.afternoon >= t.evening then 'afternoon'
    else 'evening'
  end as peak_time_of_day,
  -- Most neglected pillar in the last 14 days.
  n.pillar as neglected_pillar,
  n.rate as neglected_rate,
  n.done::int as neglected_done,
  n.total::int as neglected_total,
  me.today - l.last_done as neglected_days_since
from me
cross join tod t
left join skip_day s on true
left join skip_pillar sp on true
left join neglected n on true
left join pillar_last_done l on l.pillar = n.pillar;

comment on view public.user_behavioral_patterns is
  'Skip weekday, time-of-day completions and most neglected pillar for auth.uid() only. security_invoker: RLS of the caller applies.';

revoke all on public.user_behavioral_patterns from anon, public;
grant select on public.user_behavioral_patterns to authenticated;

----------------------------------------------------------------------
-- AI insights cache (generate-insights Edge Function)
----------------------------------------------------------------------
create table if not exists public.pattern_insights (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  insights jsonb not null default '[]'::jsonb,
  -- The view row the insights were written from, so the app and the
  -- function can tell when the data has moved on.
  patterns jsonb not null default '{}'::jsonb,
  source text not null default 'ai' check (source in ('ai', 'rules')),
  generated_at timestamptz not null default now()
);

alter table public.pattern_insights enable row level security;

drop policy if exists pattern_insights_read on public.pattern_insights;
create policy pattern_insights_read on public.pattern_insights
  for select to authenticated using (user_id = (select auth.uid()));

-- Only the Edge Function (service role) writes.
revoke insert, update, delete, truncate on public.pattern_insights
  from anon, authenticated;
