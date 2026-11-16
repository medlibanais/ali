-- PrayerLock 0015: "Make it look like me".
-- The app uploads a square selfie to the private `selfies` bucket
-- ({user_id}.jpg, under 500 KB) and inserts a row here. The insert calls
-- the generate-avatar-config Edge Function (a database webhook made in
-- SQL, below), which reads the selfie with a vision model and writes
-- result_config. The app polls the row every 3 seconds.

----------------------------------------------------------------------
-- Jobs
----------------------------------------------------------------------
create table public.avatar_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  -- { sex, skinTone, hairStyle, hairColor, eyeColor, glasses, facialHair, source }
  result_config jsonb,
  -- Why the AI result was not used (rate_limited, timeout, no_face, ...).
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index avatar_generation_jobs_user_created_idx
  on public.avatar_generation_jobs (user_id, created_at desc);

alter table public.avatar_generation_jobs enable row level security;

-- A person sees only their own jobs.
create policy avatar_generation_jobs_select_own on public.avatar_generation_jobs
  for select to authenticated
  using (user_id = auth.uid());

-- A person can only queue a fresh job for themselves. Status, result and
-- error are written by the Edge Function (service role) alone; there is
-- no update or delete policy for clients.
create policy avatar_generation_jobs_insert_own on public.avatar_generation_jobs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and result_config is null
    and error is null
    and attempts = 0
  );

-- Cost control, enforced in the database: 10 jobs per rolling 24 hours
-- and one job at a time (a job stuck for over 2 minutes no longer counts).
create or replace function public.avatar_generation_jobs_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
  active int;
begin
  select count(*) into recent
  from public.avatar_generation_jobs
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';
  if recent >= 10 then
    raise exception 'daily_limit' using errcode = 'P0001',
      hint = 'You can make 10 avatars from a photo per day.';
  end if;

  select count(*) into active
  from public.avatar_generation_jobs
  where user_id = new.user_id
    and status in ('pending', 'processing')
    and created_at > now() - interval '2 minutes';
  if active > 0 then
    raise exception 'job_in_progress' using errcode = 'P0001',
      hint = 'An avatar is already being made from your photo.';
  end if;
  return new;
end;
$$;

create trigger avatar_generation_jobs_limit
  before insert on public.avatar_generation_jobs
  for each row execute function public.avatar_generation_jobs_limit();

----------------------------------------------------------------------
-- Database webhook: every new job calls generate-avatar-config.
-- Same payload as a Supabase dashboard webhook (type/table/record).
-- Production reads the project URL and shared secret from Vault:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<long random string>', 'avatar_webhook_secret');
-- and the function gets the same secret as AVATAR_WEBHOOK_SECRET.
-- Without them it uses the local dev stack's URL and secret. If the call
-- cannot be sent, the insert still succeeds: the app then calls the
-- function itself for its own job after a few seconds.
----------------------------------------------------------------------
create or replace function public.dispatch_avatar_generation_job()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text;
  secret text;
begin
  begin
    select decrypted_secret into base_url
      from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'avatar_webhook_secret' limit 1;
  exception when others then
    base_url := null;
    secret := null;
  end;

  perform net.http_post(
    url := rtrim(coalesce(base_url, 'http://host.docker.internal:54321'), '/')
      || '/functions/v1/generate-avatar-config',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, 'prayerlock-dev-cron-secret')
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', 'public',
      'table', 'avatar_generation_jobs',
      'record', jsonb_build_object('id', new.id, 'user_id', new.user_id),
      'old_record', null
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'avatar job webhook not sent: %', sqlerrm;
  return new;
end;
$$;

create trigger avatar_generation_jobs_dispatch
  after insert on public.avatar_generation_jobs
  for each row execute function public.dispatch_avatar_generation_job();

----------------------------------------------------------------------
-- Private selfies bucket: one file per person, {user_id}.jpg, JPEG only,
-- 500 KB at most. Only its owner can read or write it; the Edge Function
-- uses the service role and deletes the selfie once it has been read.
----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', false, 512000, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy selfies_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'selfies' and name = auth.uid()::text || '.jpg');

create policy selfies_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'selfies' and name = auth.uid()::text || '.jpg');

create policy selfies_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'selfies' and name = auth.uid()::text || '.jpg')
  with check (bucket_id = 'selfies' and name = auth.uid()::text || '.jpg');

create policy selfies_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'selfies' and name = auth.uid()::text || '.jpg');
