-- PrayerLock 0008: Sunday 18:00 UTC weekly insights for all users.

select cron.schedule(
  'weekly-insights-sunday',
  '0 18 * * 0',
  $$
  select net.http_post(
    url := 'http://host.docker.internal:54321/functions/v1/weekly-insights',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "prayerlock-dev-cron-secret"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
