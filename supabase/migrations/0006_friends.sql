-- PrayerLock 0006: friends support — search view, RPCs, realtime, badge hookup.

-- Realtime for the requests inbox.
alter publication supabase_realtime add table public.friendships;

----------------------------------------------------------------------
-- search_users(query): username exact + prefix search.
-- Returns only public, non-sensitive fields. Excludes the caller.
----------------------------------------------------------------------
create or replace function public.search_users(p_query text)
returns table (
  id uuid,
  username citext,
  first_name text,
  avatar_config jsonb,
  photo_url text,
  avatar_mode text
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
    select p.id, p.username, p.first_name, p.avatar_config, p.photo_url, p.avatar_mode
    from profiles p
    where p.id <> auth.uid()
      and p.username is not null
      and (
        p.username ilike p_query
        or p.username ilike p_query || '%'
      )
      and not exists (
        -- hide users who blocked the caller in either direction
        select 1 from friendships f
        where f.status = 'blocked'
          and ((f.requester = auth.uid() and f.addressee = p.id)
            or (f.requester = p.id and f.addressee = auth.uid()))
      )
    order by (p.username = p_query) desc, p.username
    limit 20;
end;
$$;

----------------------------------------------------------------------
-- send_friend_request(addressee): guards + insert. Returns the row.
----------------------------------------------------------------------
create or replace function public.send_friend_request(p_addressee uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_existing friendships%rowtype;
  v_row friendships%rowtype;
begin
  if v_requester is null then
    raise exception 'not_authenticated';
  end if;
  if p_addressee = v_requester then
    raise exception 'cannot_friend_yourself';
  end if;
  if not exists (select 1 from profiles where id = p_addressee) then
    raise exception 'user_not_found';
  end if;

  select * into v_existing from friendships
    where least(requester, addressee) = least(v_requester, p_addressee)
      and greatest(requester, addressee) = greatest(v_requester, p_addressee);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'already_friends';
    end if;
    if v_existing.status = 'blocked' then
      raise exception 'cannot_request';
    end if;
    if v_existing.status = 'pending' then
      -- re-requesting a declined pair is allowed only by the original
      -- requester after a decline; a pending row just returns.
      raise exception 'request_already_pending';
    end if;
    if v_existing.status = 'declined' then
      -- Revive a declined pair as a fresh pending request.
      update friendships
        set status = 'pending',
            requester = v_requester,
            addressee = p_addressee,
            created_at = now(),
            responded_at = null
      where id = v_existing.id
      returning * into v_row;
      return to_jsonb(v_row);
    end if;
  end if;

  insert into friendships (requester, addressee)
  values (v_requester, p_addressee)
  returning * into v_row;
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
security invoker
set search_path = public
as $$
declare
  v_row friendships%rowtype;
begin
  select * into v_row from friendships where id = p_friendship;
  if not found then
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
    -- social_spark badge for both sides
    perform public.evaluate_badges(v_row.requester);
    perform public.evaluate_badges(v_row.addressee);
  end if;

  return to_jsonb(v_row);
end;
$$;

----------------------------------------------------------------------
-- block_user(user_id): upsert a blocked pair row (either direction).
----------------------------------------------------------------------
create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user = auth.uid() then
    raise exception 'cannot_block_yourself';
  end if;
  select id into v_id from friendships
    where least(requester, addressee) = least(auth.uid(), p_user)
      and greatest(requester, addressee) = greatest(auth.uid(), p_user);
  if found then
    update friendships set status = 'blocked', responded_at = now()
      where id = v_id;
  else
    insert into friendships (requester, addressee, status)
    values (auth.uid(), p_user, 'blocked');
  end if;
end;
$$;

----------------------------------------------------------------------
-- redeem_invite(code): connect two users after signup via invite link.
----------------------------------------------------------------------
create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_result jsonb;
begin
  select id into v_inviter from profiles
    where invite_code = upper(trim(p_code));
  if v_inviter is null then
    return jsonb_build_object('redeemed', false, 'reason', 'invalid_code');
  end if;
  if v_inviter = auth.uid() then
    return jsonb_build_object('redeemed', false, 'reason', 'own_code');
  end if;

  -- Already connected?
  if exists (select 1 from friendships
    where least(requester, addressee) = least(auth.uid(), v_inviter)
      and greatest(requester, addressee) = greatest(auth.uid(), v_inviter)) then
    return jsonb_build_object('redeemed', false, 'reason', 'already_connected');
  end if;

  -- Invites connect instantly (the invite itself is the consent).
  insert into friendships (requester, addressee, status, responded_at)
  values (v_inviter, auth.uid(), 'accepted', now());

  perform public.evaluate_badges(v_inviter);
  perform public.evaluate_badges(auth.uid());

  return jsonb_build_object('redeemed', true, 'inviter', v_inviter);
end;
$$;
