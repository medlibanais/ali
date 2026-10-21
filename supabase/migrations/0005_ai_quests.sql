-- PrayerLock 0005: scheduled AI quest generation support.
-- 1) generation log (retry/audit)
-- 2) pg_cron + pg_net calling the generate-quests Edge Function nightly

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.quest_generation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_date date not null,
  status text not null check (status in ('ok','fallback','failed')),
  generated_count int not null default 0,
  error text,
  duration_ms int,
  created_at timestamptz not null default now(),
  unique (user_id, target_date)
);

alter table public.quest_generation_log enable row level security;
create policy quest_generation_log_read on public.quest_generation_log
  for select to authenticated using (user_id = auth.uid());

-- Nightly at 23:00 UTC the Edge Function generates tomorrow's AI quests
-- for every user (per-user "tomorrow" resolved from profile timezones).
-- The x-cron-secret header must match the function's CRON_SECRET env var.
-- Local dev value only; production: rotate + store in vault.secrets.
select cron.schedule(
  'generate-ai-quests-nightly',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'http://host.docker.internal:54321/functions/v1/generate-quests',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "prayerlock-dev-cron-secret"}'::jsonb,
    body := '{"mode": "nightly"}'::jsonb
  ) as request_id;
  $$
);
