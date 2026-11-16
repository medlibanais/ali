-- PrayerLock 0017: predicted chance of keeping the streak tomorrow.
--
-- The predict-streak Edge Function (hourly, below) fills these columns
-- with the service role. The app cannot write them: 0013 revoked
-- INSERT/UPDATE/DELETE on gamification from anon/authenticated and 0012's
-- gamification_rpc_only trigger blocks direct writes. Reads follow the
-- existing gamification_read policy (owner, plus friends who can already
-- see the streak and daily scores the number is computed from).

alter table public.gamification
  add column if not exists streak_probability smallint
    check (streak_probability between 0 and 100),
  add column if not exists streak_prediction_for date,
  add column if not exists streak_prediction_at timestamptz,
  add column if not exists streak_prediction_detail jsonb;

comment on column public.gamification.streak_probability is
  'Chance (0-100) of completing at least one quest on streak_prediction_for (the user''s local tomorrow). NULL = fewer than 7 days of data.';
comment on column public.gamification.streak_prediction_detail is
  'Inputs behind streak_probability (active days, same-weekday record) for the Insights gauge.';

-- Hourly at :35, after the :05 coach nudges and the :00/:15/:30 streak expiry.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'predict-streak-hourly') then
    perform cron.unschedule('predict-streak-hourly');
  end if;
  perform cron.schedule(
    'predict-streak-hourly',
    '35 * * * *',
    $job$
    select net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/predict-streak',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "prayerlock-dev-cron-secret"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
    $job$
  );
end;
$$;
