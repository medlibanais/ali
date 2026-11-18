-- PrayerLock 0035: realtime friends leaderboard + cheers.
--
--   (1) friends_weekly_xp: a view of you + your accepted friends with this
--       week's XP. security_invoker = true, so every row it returns has
--       already passed the RLS of profiles, friendships, gamification and
--       daily_scores for the person asking. Nothing is bypassed: a friend
--       with private stats shows up with null stats, a stranger not at all.
--   (2) Realtime XP events on private broadcast topics "xp:<user_id>".
--       A trigger on quest_completions sends {user_id, xp_delta} (never
--       the quest) whenever a quest is completed or undone. The
--       realtime.messages policy lets you join a topic only when it is
--       your own or belongs to an accepted friend who shares stats.
--       There is no insert policy, so no client can publish fake XP.
--       quest_completions itself stays owner-only.
--   (3) cheers: one row per cheer, written only by send_cheer(), which
--       checks the friendship and rate limits (once per friend every
--       3 hours, 20 a day). The notify-friend Edge Function turns the row
--       into a push, once.

----------------------------------------------------------------------
-- (3, first: the view reads it) cheers
----------------------------------------------------------------------
create table if not exists public.cheers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  check (from_user <> to_user)
);
create index if not exists cheers_from_idx on public.cheers (from_user, created_at desc);
create index if not exists cheers_pair_idx on public.cheers (from_user, to_user, created_at desc);
create index if not exists cheers_to_idx on public.cheers (to_user, created_at desc);

alter table public.cheers enable row level security;

drop policy if exists cheers_read on public.cheers;
create policy cheers_read on public.cheers
  for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
-- No insert/update/delete policies: writes go through send_cheer().
revoke insert, update, delete, truncate on public.cheers from anon, authenticated;

create or replace function public.cheer_cooldown()
returns interval language sql immutable as $$ select interval '3 hours' $$;

create or replace function public.cheer_daily_limit()
returns int language sql immutable as $$ select 20 $$;

create or replace function public.send_cheer(p_friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row cheers%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_friend is null or p_friend = v_me then
    raise exception 'cannot_cheer_yourself';
  end if;
  -- Accepted friends only. A blocked pair is never 'accepted'.
  if not public.is_friend(v_me, p_friend) then
    raise exception 'not_friends';
  end if;

  -- One sender at a time, so two fast taps cannot both pass the checks.
  perform pg_advisory_xact_lock(hashtext('cheer:' || v_me::text));

  if exists (
    select 1 from cheers
    where from_user = v_me and to_user = p_friend
      and created_at > now() - public.cheer_cooldown()
  ) then
    raise exception 'cheer_cooldown';
  end if;
  if (select count(*) from cheers
      where from_user = v_me and created_at > now() - interval '24 hours')
     >= public.cheer_daily_limit() then
    raise exception 'cheer_limit';
  end if;

  insert into cheers (from_user, to_user) values (v_me, p_friend)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.send_cheer(uuid) from public, anon;
grant execute on function public.send_cheer(uuid) to authenticated;

----------------------------------------------------------------------
-- (1) friends_weekly_xp
-- Weekly XP = sum of daily_scores.xp_earned (kept in step with
-- quest_completions by recompute_daily_score) since Monday of the
-- viewer's own week. daily_scores is readable by friends who share stats
-- (policy daily_scores_read); quest_completions is not.
----------------------------------------------------------------------
drop view if exists public.friends_weekly_xp;
create view public.friends_weekly_xp
with (security_invoker = true)
as
with me as (
  select auth.uid() as uid,
         date_trunc('week', public.user_today(auth.uid()))::date as week_start
),
circle as (
  select me.uid as user_id, null::uuid as friendship_id,
         null::timestamptz as since, true as is_me
  from me
  where me.uid is not null
  union all
  select case when f.requester = me.uid then f.addressee else f.requester end,
         f.id, coalesce(f.responded_at, f.created_at), false
  from friendships f
  cross join me
  where f.status = 'accepted'
    and (f.requester = me.uid or f.addressee = me.uid)
)
select
  p.id,
  p.username,
  p.first_name,
  p.avatar_config,
  p.photo_url,
  p.avatar_mode,
  c.friendship_id,
  c.since,
  c.is_me,
  (c.is_me or p.stats_visibility = 'friends') as stats_shared,
  case when c.is_me or p.stats_visibility = 'friends' then g.level end as level,
  case when c.is_me or p.stats_visibility = 'friends' then g.current_streak end as current_streak,
  case when c.is_me or p.stats_visibility = 'friends' then g.best_streak end as best_streak,
  case when c.is_me or p.stats_visibility = 'friends' then
    coalesce((
      select sum(d.xp_earned)::int
      from daily_scores d
      where d.user_id = p.id and d.score_date >= me.week_start
    ), 0)
  end as weekly_xp,
  me.week_start,
  case when c.is_me then null else (
    select max(ch.created_at)
    from cheers ch
    where ch.from_user = me.uid and ch.to_user = p.id
  ) end as last_cheered_at
from circle c
cross join me
join profiles p on p.id = c.user_id
left join gamification g on g.user_id = p.id;

revoke all on public.friends_weekly_xp from public, anon;
grant select on public.friends_weekly_xp to authenticated;

-- The old RPC now reads the same view, so both always agree. It runs as
-- the caller (security invoker) instead of the table owner.
create or replace function public.friend_leaderboard()
returns table (
  id uuid,
  username citext,
  first_name text,
  avatar_config jsonb,
  photo_url text,
  avatar_mode text,
  friendship_id uuid,
  since timestamptz,
  is_me boolean,
  stats_shared boolean,
  level int,
  current_streak int,
  best_streak int,
  weekly_xp int
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return query
    select v.id, v.username, v.first_name, v.avatar_config, v.photo_url,
           v.avatar_mode, v.friendship_id, v.since, v.is_me, v.stats_shared,
           v.level, v.current_streak, v.best_streak, v.weekly_xp
    from friends_weekly_xp v;
end;
$$;

----------------------------------------------------------------------
-- (2) Realtime XP events
----------------------------------------------------------------------
create or replace function public.xp_topic_owner(p_topic text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic ~ '^xp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, 4)::uuid
  end
$$;

create or replace function public.broadcast_xp_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta int;
begin
  if tg_op = 'INSERT' and new.undone_at is null then
    v_delta := new.xp_awarded;
  elsif tg_op = 'UPDATE' and old.undone_at is null and new.undone_at is not null then
    v_delta := -new.xp_awarded;
  else
    return null;
  end if;

  -- A Realtime hiccup must never block a quest completion.
  begin
    perform realtime.send(
      jsonb_build_object('user_id', new.user_id, 'xp_delta', v_delta, 'at', now()),
      'xp_changed',
      'xp:' || new.user_id::text,
      true
    );
  exception when others then
    raise warning 'broadcast_xp_change: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_xp_change() from public, anon, authenticated;

drop trigger if exists quest_completions_broadcast_xp on public.quest_completions;
create trigger quest_completions_broadcast_xp
  after insert or update of undone_at on public.quest_completions
  for each row execute function public.broadcast_xp_change();

-- Who may listen on "xp:<user_id>": that user, or an accepted friend who
-- can see their stats (can_view_stats = same rule as the leaderboard).
-- Only created where Realtime is installed (always on Supabase Cloud).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists friends_xp_listen on realtime.messages';
    execute $p$
      create policy friends_xp_listen on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and public.xp_topic_owner(realtime.topic()) is not null
          and public.can_view_stats(auth.uid(), public.xp_topic_owner(realtime.topic()))
        )
    $p$;
  end if;
end;
$$;
