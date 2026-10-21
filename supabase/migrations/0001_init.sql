-- PrayerLock 0001: core schema, RLS, triggers, gamification math
-- All tables have RLS enabled. Business logic lives in SQL functions.

create extension if not exists pgcrypto;
create extension if not exists citext;

----------------------------------------------------------------------
-- PROFILES
----------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext unique,
  first_name text,
  avatar_config jsonb not null default '{}'::jsonb,
  photo_url text,
  avatar_mode text not null default 'avatar' check (avatar_mode in ('avatar', 'photo')),
  timezone text not null default 'UTC',
  invite_code text unique,
  stats_visibility text not null default 'friends' check (stats_visibility in ('friends', 'private')),
  theme_id text not null default 'parchment',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (
    username is null or username ~ '^[a-z0-9_]{3,20}$'
  )
);

----------------------------------------------------------------------
-- USER GOALS (from onboarding questionnaire)
----------------------------------------------------------------------
create table public.user_goals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  workouts_per_week int not null default 3 check (workouts_per_week between 0 and 7),
  sleep_target_hours numeric(3,1) not null default 8 check (sleep_target_hours between 6 and 10),
  water_liters_per_day numeric(3,1) not null default 2.5 check (water_liters_per_day between 1 and 5),
  call_parents_frequency text not null default 'weekly',
  quality_time_hours_per_week int not null default 5,
  deep_work_hours_per_week int not null default 20 check (deep_work_hours_per_week between 0 and 50),
  career_goal text,
  skill_to_develop text,
  hobbies text[] not null default '{}',
  weekly_fun_hours int not null default 7,
  religion text,
  prayer_frequency text,
  spiritual_practice text,
  dream_body text,
  dream_personality text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

----------------------------------------------------------------------
-- QUEST POOL + ASSIGNED QUESTS + COMPLETIONS
----------------------------------------------------------------------
create table public.predefined_quests (
  id uuid primary key default gen_random_uuid(),
  pillar text not null check (pillar in ('health','family','work','fun','spirituality')),
  title text not null,
  description text not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  xp_reward int not null check (xp_reward in (10,20,50)),
  time_estimate_minutes int,
  why_this_matters text,
  tags text[] not null default '{}',
  recurring_pattern text check (recurring_pattern in ('daily','weekly') or recurring_pattern is null),
  unique (pillar, title)
);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  predefined_id uuid references public.predefined_quests (id) on delete set null,
  pillar text not null check (pillar in ('health','family','work','fun','spirituality')),
  title text not null,
  description text not null default '',
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  xp_reward int not null check (xp_reward in (10,20,50)),
  is_ai_generated boolean not null default false,
  why_this_matters text,
  assigned_date date not null,
  skipped boolean not null default false,
  skipped_at timestamptz,
  priority int not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, title, assigned_date)
);
create index quests_user_date_idx on public.quests (user_id, assigned_date);

create table public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  completed_at timestamptz not null default now(),
  xp_awarded int not null,
  undone_at timestamptz
);
-- A quest can have at most one live (not undone) completion.
create unique index quest_completions_live_uidx
  on public.quest_completions (quest_id) where undone_at is null;
create index quest_completions_user_date_idx
  on public.quest_completions (user_id, completed_at);

----------------------------------------------------------------------
-- GAMIFICATION
----------------------------------------------------------------------
create table public.gamification (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  level int not null default 1 check (level between 1 and 100),
  total_xp int not null default 0 check (total_xp >= 0),
  xp_today int not null default 0,
  xp_today_date date,
  current_streak int not null default 0,
  best_streak int not null default 0,
  last_active_date date,
  streak_freezes int not null default 1,
  streak_freeze_week date,
  updated_at timestamptz not null default now()
);

create table public.badge_catalog (
  badge_id text primary key,
  name text not null,
  description text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','epic','legendary')),
  xp_reward int not null default 0,
  pillar text check (pillar in ('health','family','work','fun','spirituality') or pillar is null),
  sort int not null default 0
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null references public.badge_catalog (badge_id),
  unlocked_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create table public.daily_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  score_date date not null,
  overall int not null default 0 check (overall between 0 and 100),
  health int not null default 0,
  family int not null default 0,
  work int not null default 0,
  fun int not null default 0,
  spirituality int not null default 0,
  assigned_count int not null default 0,
  completed_count int not null default 0,
  skipped_count int not null default 0,
  xp_earned int not null default 0,
  primary key (user_id, score_date)
);

----------------------------------------------------------------------
-- COACH
----------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index conversations_user_idx on public.conversations (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  feedback smallint not null default 0 check (feedback in (-1, 0, 1)),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

----------------------------------------------------------------------
-- FRIENDS
----------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> addressee)
);
-- Canonical unordered pair: prevents A->B and B->A duplicates.
create unique index friendships_pair_uidx on public.friendships
  (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee, status);
create index friendships_requester_idx on public.friendships (requester, status);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android','web')),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, token)
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_enabled boolean not null default true,
  friend_requests boolean not null default true,
  quest_reminders boolean not null default true,
  streak_risk boolean not null default true,
  coach_messages boolean not null default true,
  weekly_report boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  max_per_day int not null default 3,
  updated_at timestamptz not null default now()
);

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  completion_rate int not null default 0,
  total_xp int not null default 0,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  insights jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

----------------------------------------------------------------------
-- GAMIFICATION MATH (shared, mirrors mobile/src/lib/levels.ts)
----------------------------------------------------------------------
-- XP cost to go from level N-1 to N is 500*N.
-- Cumulative XP needed to REACH level N is 500*(N*(N+1)/2 - 1).
create or replace function public.xp_for_level(n int)
returns int language sql immutable as $$
  select 500 * n
$$;

create or replace function public.cumulative_xp_for_level(n int)
returns int language sql immutable as $$
  select 500 * ((n * (n + 1) / 2) - 1)
$$;

create or replace function public.level_for_xp(xp int)
returns int language plpgsql immutable as $$
declare
  l int;
begin
  if xp is null or xp <= 0 then
    return 1;
  end if;
  -- invert cumulative_xp_for_level: L(L+1)/2 - 1 <= xp/500
  l := floor((sqrt(8.0 * (xp / 500.0 + 1.0) + 1.0) - 1.0) / 2.0);
  return greatest(1, least(100, l));
end;
$$;

create or replace function public.title_for_level(l int)
returns text language sql immutable as $$
  select case
    when l <= 10 then 'Novice'
    when l <= 25 then 'Disciplined Human'
    when l <= 50 then 'Iron Mind'
    when l <= 75 then 'Guardian of Family'
    else 'Legendary'
  end
$$;

----------------------------------------------------------------------
-- NEW USER BOOTSTRAP
----------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, invite_code)
  values (new.id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  on conflict (id) do nothing;

  insert into public.user_goals (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.gamification (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_goals_touch before update on public.user_goals
  for each row execute function public.touch_updated_at();
create trigger gamification_touch before update on public.gamification
  for each row execute function public.touch_updated_at();
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

----------------------------------------------------------------------
-- ROW LEVEL SECURITY
----------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_goals enable row level security;
alter table public.predefined_quests enable row level security;
alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.gamification enable row level security;
alter table public.badge_catalog enable row level security;
alter table public.achievements enable row level security;
alter table public.daily_scores enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.friendships enable row level security;
alter table public.device_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.ai_insights enable row level security;

-- helper: are two users accepted friends?
create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b)
        or (f.requester = b and f.addressee = a))
  )
$$;

-- helper: does user b share stats with viewer a?
create or replace function public.can_view_stats(viewer uuid, owner uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select viewer = owner
    or (
      public.is_friend(viewer, owner)
      and (select p.stats_visibility from profiles p where p.id = owner) = 'friends'
    )
$$;

-- profiles: authenticated users can read basic profile rows (needed for
-- username search); only the owner can insert/update/delete.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on public.profiles
  for delete to authenticated using (id = auth.uid());

-- goals: owner only
create policy goals_owner on public.user_goals
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- quest pool + badge catalog: read-only for everyone signed in
create policy predefined_read on public.predefined_quests
  for select to authenticated using (true);
create policy badge_catalog_read on public.badge_catalog
  for select to authenticated using (true);

-- quests: owner only (a user's daily plan is private)
create policy quests_owner on public.quests
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy completions_owner on public.quest_completions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- gamification: owner + friends with shared stats (leaderboard)
create policy gamification_read on public.gamification
  for select to authenticated
  using (public.can_view_stats(auth.uid(), user_id));
create policy gamification_update on public.gamification
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- achievements: owner + friends with shared stats
create policy achievements_read on public.achievements
  for select to authenticated
  using (public.can_view_stats(auth.uid(), user_id));

-- daily_scores: owner + friends with shared stats
create policy daily_scores_read on public.daily_scores
  for select to authenticated
  using (public.can_view_stats(auth.uid(), user_id));

-- coach: strictly private
create policy conversations_owner on public.conversations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy messages_owner on public.messages
  for all to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- friendships: participants can read; requester inserts; addressee
-- responds; either participant can delete (unfriend / cancel).
create policy friendships_select on public.friendships
  for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (requester = auth.uid());
create policy friendships_update on public.friendships
  for update to authenticated
  using (requester = auth.uid() or addressee = auth.uid())
  with check (requester = auth.uid() or addressee = auth.uid());
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

-- device tokens: owner only
create policy device_tokens_owner on public.device_tokens
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification preferences: owner only
create policy notification_preferences_owner on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports + insights: owner read; written by service role only
create policy weekly_reports_read on public.weekly_reports
  for select to authenticated using (user_id = auth.uid());
create policy ai_insights_read on public.ai_insights
  for select to authenticated using (user_id = auth.uid());

----------------------------------------------------------------------
-- STORAGE: profile-photos bucket (public read, owner-folder write)
----------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

create policy profile_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos');

create policy profile_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy profile_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy profile_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
