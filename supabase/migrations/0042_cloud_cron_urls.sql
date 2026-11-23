-- PrayerLock 0042: scheduled jobs call the functions on the live project.
--
-- The hourly and nightly jobs used to post to http://host.docker.internal,
-- which only exists on a local Supabase. On the cloud project they never
-- reached the functions. This adds one helper that reads the project URL
-- and cron secret from Supabase Vault (the same names smart-notify uses:
-- 'project_url' and 'cron_secret') and falls back to the local dev values
-- when they are missing, so local development keeps working.
--
-- Production setup (once, by the project owner):
--   Vault:            project_url = https://<project-ref>.supabase.co
--                     cron_secret = <long random string>
--   Edge Functions:   CRON_SECRET = the same cron_secret value
-- Without CRON_SECRET the functions accept the public dev default.

create or replace function public.invoke_cron_function(p_path text, p_body jsonb)
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
           || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(v_secret, 'prayerlock-dev-cron-secret')
    ),
    body := p_body,
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;

revoke execute on function public.invoke_cron_function(text, jsonb)
  from public, anon, authenticated;

-- Reschedule every job that calls a function, through the helper.
do $$
declare
  j record;
begin
  for j in
    select unnest(array[
      'coach-nudges-hourly',
      'weekly-insights-sunday',
      'generate-ai-quests-nightly',
      'predict-streak-hourly'
    ]) as name
  loop
    if exists (select 1 from cron.job where jobname = j.name) then
      perform cron.unschedule(j.name);
    end if;
  end loop;
end;
$$;

select cron.schedule(
  'coach-nudges-hourly', '5 * * * *',
  $$ select public.invoke_cron_function('/functions/v1/coach-nudges', '{}'::jsonb) $$
);

select cron.schedule(
  'weekly-insights-sunday', '0 18 * * 0',
  $$ select public.invoke_cron_function('/functions/v1/weekly-insights', '{}'::jsonb) $$
);

select cron.schedule(
  'generate-ai-quests-nightly', '0 23 * * *',
  $$ select public.invoke_cron_function('/functions/v1/generate-quests', '{"mode": "nightly"}'::jsonb) $$
);

select cron.schedule(
  'predict-streak-hourly', '35 * * * *',
  $$ select public.invoke_cron_function('/functions/v1/predict-streak', '{}'::jsonb) $$
);
