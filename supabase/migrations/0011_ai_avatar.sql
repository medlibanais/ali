-- PrayerLock 0011: AI "Future Self" avatar generated from a photo.
-- The image is produced by the generate-avatar Edge Function and stored in
-- profile-photos/{user_id}/ai-avatar.jpg. The SVG avatar stays the fallback.

alter table public.profiles
  add column if not exists ai_avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_avatar_mode_check;
alter table public.profiles
  add constraint profiles_avatar_mode_check
  check (avatar_mode in ('avatar', 'photo', 'ai'));

-- One row per generation attempt. Used for the daily limit (cost control)
-- and latency tracking. Written only by the Edge Function (service role).
create table public.avatar_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ok boolean not null,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);

create index avatar_generations_user_created_idx
  on public.avatar_generations (user_id, created_at desc);

alter table public.avatar_generations enable row level security;

create policy avatar_generations_select_own on public.avatar_generations
  for select to authenticated
  using (user_id = auth.uid());
