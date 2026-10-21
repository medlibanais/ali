-- PrayerLock 0012: friends hardening.
--
-- Closes holes that let a user skip consent or read data they should not:
--   * friendships could be inserted/updated directly, so anyone could make
--     themselves "accepted" friends with anyone and read their stats.
--   * a blocked user could delete the block row and request again.
--   * every signed-in user could read every profile, including invite
--     codes, which redeem_invite turns into an instant friendship.
--   * search_users let '%' through, which listed every username.
--   * gamification and quest_completions were writable straight from the
--     client, so XP, level and streaks on the leaderboard could be faked.
-- All friendship writes now go through the security definer RPCs below.

----------------------------------------------------------------------
-- Who placed a block. Only the blocker can see or lift it.
----------------------------------------------------------------------
alter table public.friendships
  add column if not exists blocked_by uuid references public.profiles (id) on delete cascade;

-- Legacy blocks made through the insert path were placed by the requester.
update public.friendships
  set blocked_by = requester
  where status = 'blocked' and blocked_by is null and responded_at is null;

----------------------------------------------------------------------
-- friendships policies: read-only for participants (the blocked party
-- does not see the block), delete only for non-blocked rows.
----------------------------------------------------------------------
drop policy if exists friendships_select on public.friendships;
drop policy if exists friendships_insert on public.friendships;
drop policy if exists friendships_update on public.friendships;
drop policy if exists friendships_delete on public.friendships;

create policy friendships_select on public.friendships
  for select to authenticated
  using (
    (requester = auth.uid() or addressee = auth.uid())
    and (status <> 'blocked' or blocked_by = auth.uid())
  );
-- Unfriend / cancel / remove a declined row. Blocks are lifted with
-- unblock_user so the blocked side cannot undo them.
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (
    (requester = auth.uid() or addressee = auth.uid())
    and status <> 'blocked'
  );

----------------------------------------------------------------------
-- profiles: self, plus anyone you have a pending or accepted friendship
-- with. Strangers are found only through search_users, which returns
-- public fields.
----------------------------------------------------------------------
create or replace function public.can_see_profile(viewer uuid, owner uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select viewer = owner
    or exists (
      select 1 from friendships f
      where f.status in ('pending', 'accepted')
        and ((f.requester = viewer and f.addressee = owner)
          or (f.requester = owner and f.addressee = viewer))
    )
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.can_see_profile(auth.uid(), id));

----------------------------------------------------------------------
-- Scoring tables are written only by the quest RPCs, never by direct
-- table requests from the app. PostgREST sets request.path per request;
-- RPC calls run under /rpc/. Service role and migrations are not affected.
----------------------------------------------------------------------
create or replace function public.forbid_direct_client_write()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon')
     and coalesce(current_setting('request.path', true), '') not like '/rpc/%' then
    raise exception 'direct_write_forbidden' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists gamification_rpc_only on public.gamification;
create trigger gamification_rpc_only
  before insert or update or delete on public.gamification
  for each row execute function public.forbid_direct_client_write();

drop trigger if exists quest_completions_rpc_only on public.quest_completions;
create trigger quest_completions_rpc_only
  before insert or update or delete on public.quest_completions
  for each row execute function public.forbid_direct_client_write();

----------------------------------------------------------------------
-- search_users(query): exact + prefix username search. Wildcards are
-- escaped and at least 2 characters are required. Returns the caller's
-- relation to each result so the app can show Add / Pending / Friends.
----------------------------------------------------------------------
drop function if exists public.search_users(text);
create function public.search_users(p_query text)
returns table (
  id uuid,
  username citext,
  first_name text,
  avatar_config jsonb,
  photo_url text,
  avatar_mode text,
  relation text,
  friendship_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_q text := lower(trim(coalesce(p_query, '')));
  v_like text;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if length(v_q) < 2 then
    return;
  end if;
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select p.id, p.username, p.first_name, p.avatar_config, p.photo_url, p.avatar_mode,
           case
             when f.id is null or f.status = 'declined' then 'none'
             when f.status = 'accepted' then 'friends'
             when f.requester = v_me then 'outgoing'
             else 'incoming'
           end,
           f.id
    from profiles p
    left join friendships f
      on least(f.requester, f.addressee) = least(v_me, p.id)
     and greatest(f.requester, f.addressee) = greatest(v_me, p.id)
    where p.id <> v_me
      and p.username is not null
      and p.username::text like v_like
      and (f.id is null or f.status <> 'blocked')
    order by (p.username = v_q) desc, p.username
    limit 20;
end;
$$;

----------------------------------------------------------------------
-- send_friend_request(addressee)
--   * a pending request from them to you is accepted (mutual add)
--   * a declined pair can be re-requested by the person who declined at
--     any time, and by the original requester after 7 days
--   * at most 50 outgoing pending requests
----------------------------------------------------------------------
create or replace function public.send_friend_request(p_addressee uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_existing friendships%rowtype;
  v_row friendships%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_addressee is null or p_addressee = v_me then
    raise exception 'cannot_friend_yourself';
  end if;
  if not exists (select 1 from profiles where id = p_addressee) then
    raise exception 'user_not_found';
  end if;

  select * into v_existing from friendships
    where least(requester, addressee) = least(v_me, p_addressee)
      and greatest(requester, addressee) = greatest(v_me, p_addressee)
    for update;

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'already_friends';
    elsif v_existing.status = 'blocked' then
      raise exception 'cannot_request';
    elsif v_existing.status = 'pending' then
      if v_existing.requester = v_me then
        raise exception 'request_already_pending';
      end if;
      -- They already asked you: adding them back accepts.
      update friendships
        set status = 'accepted', responded_at = now()
        where id = v_existing.id
        returning * into v_row;
      perform public.evaluate_badges(v_row.requester);
      perform public.evaluate_badges(v_row.addressee);
      return to_jsonb(v_row);
    elsif v_existing.status = 'declined' then
      if v_existing.requester = v_me
         and v_existing.responded_at > now() - interval '7 days' then
        raise exception 'request_declined_recently';
      end if;
    end if;
  end if;

  if (select count(*) from friendships
      where requester = v_me and status = 'pending') >= 50 then
    raise exception 'too_many_pending';
  end if;

  if v_existing.id is not null then
    update friendships
      set status = 'pending',
          requester = v_me,
          addressee = p_addressee,
          created_at = now(),
          responded_at = null
      where id = v_existing.id
      returning * into v_row;
  else
    insert into friendships (requester, addressee)
    values (v_me, p_addressee)
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

----------------------------------------------------------------------
-- respond_friend_request(friendship_id, accept): addressee only.
----------------------------------------------------------------------
create or replace function public.respond_friend_request(
  p_friendship uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row friendships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_row from friendships where id = p_friendship for update;
  if not found or (v_row.status = 'blocked' and v_row.blocked_by <> auth.uid()) then
    raise exception 'not_found';
  end if;
  if v_row.addressee <> auth.uid() then
    raise exception 'not_your_request';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'already_responded';
  end if;

  update friendships
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
  where id = p_friendship
  returning * into v_row;

  if p_accept then
    perform public.evaluate_badges(v_row.requester);
    perform public.evaluate_badges(v_row.addressee);
  end if;

  return to_jsonb(v_row);
end;
$$;

----------------------------------------------------------------------
-- block_user / unblock_user. A block placed by the other side is never
-- taken over, so it cannot be lifted by the person it targets.
----------------------------------------------------------------------
create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row friendships%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'cannot_block_yourself';
  end if;
  if not exists (select 1 from profiles where id = p_user) then
    raise exception 'user_not_found';
  end if;
  select * into v_row from friendships
    where least(requester, addressee) = least(v_me, p_user)
      and greatest(requester, addressee) = greatest(v_me, p_user)
    for update;
  if found then
    if v_row.status = 'blocked' then
      return;
    end if;
    update friendships
      set status = 'blocked', blocked_by = v_me, responded_at = now()
      where id = v_row.id;
  else
    insert into friendships (requester, addressee, status, blocked_by, responded_at)
    values (v_me, p_user, 'blocked', v_me, now());
  end if;
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from friendships
    where status = 'blocked'
      and blocked_by = auth.uid()
      and least(requester, addressee) = least(auth.uid(), p_user)
      and greatest(requester, addressee) = greatest(auth.uid(), p_user);
end;
$$;

-- People you blocked, for the unblock list.
create or replace function public.blocked_users()
returns table (id uuid, username citext, first_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.first_name
  from friendships f
  join profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'blocked' and f.blocked_by = auth.uid()
  order by p.username
$$;

----------------------------------------------------------------------
-- redeem_invite(code): the invite is the inviter's consent and entering
-- it is the redeemer's, so pending/declined pairs become friends too.
----------------------------------------------------------------------
create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_inviter uuid;
  v_existing friendships%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  select id into v_inviter from profiles
    where invite_code = upper(trim(coalesce(p_code, '')));
  if v_inviter is null then
    return jsonb_build_object('redeemed', false, 'reason', 'invalid_code');
  end if;
  if v_inviter = v_me then
    return jsonb_build_object('redeemed', false, 'reason', 'own_code');
  end if;

  select * into v_existing from friendships
    where least(requester, addressee) = least(v_me, v_inviter)
      and greatest(requester, addressee) = greatest(v_me, v_inviter)
    for update;

  if found then
    if v_existing.status = 'accepted' then
      return jsonb_build_object('redeemed', false, 'reason', 'already_connected');
    elsif v_existing.status = 'blocked' then
      -- Do not reveal the block.
      return jsonb_build_object('redeemed', false, 'reason', 'invalid_code');
    end if;
    update friendships
      set status = 'accepted', responded_at = now()
      where id = v_existing.id;
  else
    insert into friendships (requester, addressee, status, responded_at)
    values (v_inviter, v_me, 'accepted', now());
  end if;

  perform public.evaluate_badges(v_inviter);
  perform public.evaluate_badges(v_me);

  return jsonb_build_object('redeemed', true, 'inviter', v_inviter);
end;
$$;

----------------------------------------------------------------------
-- friend_leaderboard(): you + accepted friends in one call. Stats are
-- null for friends who keep them private. Weekly XP counts from Monday
-- in the caller's own timezone.
----------------------------------------------------------------------
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
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_week date;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  v_week := date_trunc('week', public.user_today(v_me))::date;

  return query
    with people as (
      select v_me as uid, null::uuid as fid, null::timestamptz as since, true as is_me
      union all
      select case when f.requester = v_me then f.addressee else f.requester end,
             f.id, coalesce(f.responded_at, f.created_at), false
      from friendships f
      where f.status = 'accepted'
        and (f.requester = v_me or f.addressee = v_me)
    )
    select p.id, p.username, p.first_name, p.avatar_config, p.photo_url, p.avatar_mode,
           pe.fid, pe.since, pe.is_me,
           (pe.is_me or p.stats_visibility = 'friends'),
           case when pe.is_me or p.stats_visibility = 'friends' then g.level end,
           case when pe.is_me or p.stats_visibility = 'friends' then g.current_streak end,
           case when pe.is_me or p.stats_visibility = 'friends' then g.best_streak end,
           case when pe.is_me or p.stats_visibility = 'friends' then
             coalesce((select sum(d.xp_earned)::int from daily_scores d
                       where d.user_id = p.id and d.score_date >= v_week), 0)
           end
    from people pe
    join profiles p on p.id = pe.uid
    left join gamification g on g.user_id = p.id;
end;
$$;

----------------------------------------------------------------------
-- Execute grants: signed-in users only.
----------------------------------------------------------------------
revoke all on function public.search_users(text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.blocked_users() from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
revoke all on function public.friend_leaderboard() from public, anon;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.blocked_users() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.friend_leaderboard() to authenticated;
