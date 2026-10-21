-- PrayerLock 0004: timezone day-boundary helpers used by Edge Functions
-- (coach rate limit, daily scores, reports).

-- "Today" as a date in the given IANA timezone.
create or replace function public.today_in_tz(p_tz text)
returns date
language sql stable
as $$
  select (now() at time zone coalesce(p_tz, 'UTC'))::date
$$;

-- [start, end) of the current day in the given timezone, as timestamptz.
create or replace function public.day_bounds_in_tz(p_tz text)
returns table(day_start timestamptz, day_end timestamptz, d date)
language sql stable
as $$
  select
    ((now() at time zone coalesce(p_tz, 'UTC'))::date::timestamp
      at time zone coalesce(p_tz, 'UTC')),
    (((now() at time zone coalesce(p_tz, 'UTC'))::date + 1)::timestamp
      at time zone coalesce(p_tz, 'UTC')),
    (now() at time zone coalesce(p_tz, 'UTC'))::date
$$;
