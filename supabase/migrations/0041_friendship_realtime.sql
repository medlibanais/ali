-- PrayerLock 0041: live friendship changes for both sides.
--
-- The Friends screen listened to postgres_changes on friendships
-- (migration 0006). That misses three things:
--   * deletes (unfriend, cancel a request): Realtime cannot filter or
--     authorize DELETE events, so filtered listeners never get them;
--   * blocks: once a row is blocked, the blocked side no longer passes
--     friendships_select (0012), so Realtime drops the UPDATE for them and
--     their app keeps showing the old friend;
--   * the leaderboard, which never refreshed when a friend was added.
--
-- Now a trigger sends an empty "friendship_changed" broadcast to the
-- private topic "friends:<user_id>" of both people on every insert,
-- update or delete. The message holds no ids or status, so it reveals
-- nothing (a block looks like an unfriend); the app refetches and RLS
-- decides what it sees. Only the owner may join a "friends:" topic and,
-- as for "xp:" topics, there is no insert policy, so clients cannot send.

create or replace function public.friendship_topic_owner(p_topic text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic ~ '^friends:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, 9)::uuid
  end
$$;

create or replace function public.broadcast_friendship_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row friendships%rowtype;
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  -- A Realtime hiccup must never block a friendship change.
  begin
    foreach v_user in array array[v_row.requester, v_row.addressee] loop
      perform realtime.send(
        jsonb_build_object('at', now()),
        'friendship_changed',
        'friends:' || v_user::text,
        true
      );
    end loop;
  exception when others then
    raise warning 'broadcast_friendship_change: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_friendship_change() from public, anon, authenticated;

drop trigger if exists friendships_broadcast_change on public.friendships;
create trigger friendships_broadcast_change
  after insert or update or delete on public.friendships
  for each row execute function public.broadcast_friendship_change();

-- Who may listen on "friends:<user_id>": that user only.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists friendship_inbox_listen on realtime.messages';
    execute $p$
      create policy friendship_inbox_listen on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and public.friendship_topic_owner(realtime.topic()) = auth.uid()
        )
    $p$;
  end if;
end;
$$;
