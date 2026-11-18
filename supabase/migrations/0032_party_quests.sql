-- PrayerLock 0032: Party Quests.
--
-- A party quest is one quest that 2 to 8 friends do together. The
-- creator shares an invite link; accepted friends of the creator can
-- join with it. Each member taps "I did my part". When every member
-- still in the party has done their part (and there are at least two
-- of them), the party is completed and every member gets the quest's
-- XP at the same moment.
--
-- Security model
--   * party_quests / party_members are read-only for members (RLS) and
--     unreadable for everyone else. All writes go through the RPCs below.
--   * Realtime: both tables are in the supabase_realtime publication, so
--     postgres_changes events are filtered through the same RLS. Cheers
--     use a *private* broadcast channel "party:<id>"; the policies on
--     realtime.messages only let members join, listen and send there.
--
-- Race conditions
--   * Every write RPC first locks the party row (SELECT ... FOR UPDATE),
--     so joins, leaves and completions of one party run one after the
--     other. Two members finishing in the same millisecond: the second
--     waits for the first to commit, then sees status = 'completed' and
--     returns the finished state. XP is paid only inside the
--     open -> completed transition, which can happen once.
--   * party_members has (party_id, user_id) as primary key and
--     awarded_at is set once, so no member can be paid twice.
--
-- Fair XP
--   * Every member gets a normal quest row ("Party: <description>") on
--     their own today and it is completed through complete_quest, so
--     the usual rules apply to each person equally: Easy 10 / Medium 20
--     / Hard 50, +5 before 6 PM, the once-a-day streak bonus, the 500
--     XP/day cap and the 15 completions/day limit. A member who is
--     already at a limit is recorded with 0 XP and a reason, and the
--     others are still paid.
--
-- The column list in the request (id, pillar, description, xp_reward,
-- max_participants / party_id, user_id, status) is extended with
-- creator_id, difficulty, status, invite_code, expires_at, completed_at
-- on parties and joined_at, done_at, quest_id, xp_awarded, awarded_at,
-- award_note on members.

----------------------------------------------------------------------
-- Tables
----------------------------------------------------------------------
create table if not exists public.party_quests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  pillar text not null
    check (pillar in ('health','family','work','fun','spirituality')),
  description text not null
    check (char_length(btrim(description)) between 3 and 140),
  difficulty text not null default 'medium'
    check (difficulty in ('easy','medium','hard')),
  xp_reward int not null check (xp_reward in (10, 20, 50)),
  max_participants int not null default 4 check (max_participants between 2 and 8),
  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),
  -- 10 hex chars from gen_random_uuid (random v4), so not guessable.
  invite_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  completed_at timestamptz,
  constraint party_xp_matches_difficulty check (
    (difficulty = 'easy' and xp_reward = 10)
    or (difficulty = 'medium' and xp_reward = 20)
    or (difficulty = 'hard' and xp_reward = 50))
);
create index if not exists party_quests_creator_idx
  on public.party_quests (creator_id, created_at);

create table if not exists public.party_members (
  party_id uuid not null references public.party_quests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'joined'
    check (status in ('joined', 'done', 'left')),
  joined_at timestamptz not null default now(),
  done_at timestamptz,
  quest_id uuid references public.quests (id) on delete set null,
  xp_awarded int,
  awarded_at timestamptz,
  award_note text,
  primary key (party_id, user_id)
);
create index if not exists party_members_user_idx
  on public.party_members (user_id, party_id);

alter table public.party_quests enable row level security;
alter table public.party_members enable row level security;

-- Realtime UPDATE events carry the full row.
alter table public.party_quests replica identity full;
alter table public.party_members replica identity full;

----------------------------------------------------------------------
-- Membership helper (security definer so policies don't recurse).
-- Members who left lose access.
----------------------------------------------------------------------
create or replace function public.is_party_member(p_party uuid, p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_party is not null and p_user is not null and exists (
    select 1 from party_members m
    where m.party_id = p_party and m.user_id = p_user and m.status <> 'left'
  )
$$;

-- Realtime topic "party:<uuid>" -> is the user a member of that party?
create or replace function public.is_party_topic_member(p_topic text, p_user uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_topic is null
     or p_topic !~ '^party:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_party_member(substr(p_topic, 7)::uuid, p_user);
end;
$$;

revoke execute on function public.is_party_member(uuid, uuid) from public, anon;
revoke execute on function public.is_party_topic_member(text, uuid) from public, anon;
grant execute on function public.is_party_member(uuid, uuid) to authenticated;
grant execute on function public.is_party_topic_member(text, uuid) to authenticated;

----------------------------------------------------------------------
-- RLS: members read, nobody writes directly.
----------------------------------------------------------------------
drop policy if exists party_quests_member_read on public.party_quests;
create policy party_quests_member_read on public.party_quests
  for select to authenticated
  using (public.is_party_member(id, auth.uid()));

drop policy if exists party_members_member_read on public.party_members;
create policy party_members_member_read on public.party_members
  for select to authenticated
  using (public.is_party_member(party_id, auth.uid()));

revoke insert, update, delete, truncate on public.party_quests, public.party_members
  from anon, authenticated;
revoke all on public.party_quests, public.party_members from anon;
grant select on public.party_quests, public.party_members to authenticated;

----------------------------------------------------------------------
-- Realtime: progress via postgres_changes (RLS-filtered), cheers via a
-- private broadcast channel guarded by realtime.messages policies.
-- Guarded so the migration also runs on a bare Postgres (tests).
----------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = 'party_quests') then
      alter publication supabase_realtime add table public.party_quests;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = 'party_members') then
      alter publication supabase_realtime add table public.party_members;
    end if;
  end if;

  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists party_members_listen on realtime.messages';
    execute 'drop policy if exists party_members_send on realtime.messages';
    execute $p$
      create policy party_members_listen on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension in ('broadcast', 'presence')
          and public.is_party_topic_member(realtime.topic(), auth.uid())
        )
    $p$;
    execute $p$
      create policy party_members_send on realtime.messages
        for insert to authenticated
        with check (
          realtime.messages.extension in ('broadcast', 'presence')
          and public.is_party_topic_member(realtime.topic(), auth.uid())
        )
    $p$;
  end if;
end;
$$;

----------------------------------------------------------------------
-- party_state(party): the party plus its members (names only), for
-- members. Members are not always friends with each other, and
-- profiles RLS hides non-friends, so names come through here.
----------------------------------------------------------------------
create or replace function public.party_state(p_party uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_party party_quests%rowtype;
  v_members jsonb;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_party_member(p_party, v_me) then
    raise exception 'party_not_found';
  end if;
  select * into v_party from party_quests where id = p_party;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', m.user_id,
           'username', p.username,
           'first_name', p.first_name,
           'status', m.status,
           'is_creator', m.user_id = v_party.creator_id,
           'done_at', m.done_at,
           'xp_awarded', m.xp_awarded,
           'award_note', m.award_note
         ) order by m.joined_at), '[]'::jsonb)
    into v_members
  from party_members m
  join profiles p on p.id = m.user_id
  where m.party_id = p_party and m.status <> 'left';

  return jsonb_build_object(
    'id', v_party.id,
    'creator_id', v_party.creator_id,
    'pillar', v_party.pillar,
    'description', v_party.description,
    'difficulty', v_party.difficulty,
    'xp_reward', v_party.xp_reward,
    'max_participants', v_party.max_participants,
    'status', case when v_party.status = 'open' and v_party.expires_at <= now()
                   then 'expired' else v_party.status end,
    'invite_code', v_party.invite_code,
    'created_at', v_party.created_at,
    'expires_at', v_party.expires_at,
    'completed_at', v_party.completed_at,
    'members', v_members
  );
end;
$$;

----------------------------------------------------------------------
-- create_party_quest: at most 5 new parties per user per 24 h.
----------------------------------------------------------------------
create or replace function public.create_party_quest(
  p_pillar text,
  p_description text,
  p_difficulty text default 'medium',
  p_max_participants int default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_xp int;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_pillar is null
     or p_pillar not in ('health','family','work','fun','spirituality') then
    raise exception 'invalid_pillar';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 3 and 140 then
    raise exception 'invalid_description';
  end if;
  v_xp := case p_difficulty when 'easy' then 10 when 'medium' then 20
                            when 'hard' then 50 end;
  if v_xp is null then
    raise exception 'invalid_difficulty';
  end if;
  if p_max_participants is null or p_max_participants not between 2 and 8 then
    raise exception 'invalid_max_participants';
  end if;

  -- One creator at a time (simultaneous taps cannot beat the limit).
  perform pg_advisory_xact_lock(hashtextextended('party_create:' || v_me::text, 0));
  if (select count(*) from party_quests
      where creator_id = v_me and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'party_limit_reached'
      using hint = 'At most 5 party quests per day.';
  end if;

  insert into party_quests (creator_id, pillar, description, difficulty, xp_reward,
                            max_participants)
  values (v_me, p_pillar, btrim(p_description), p_difficulty, v_xp, p_max_participants)
  returning id into v_id;

  insert into party_members (party_id, user_id) values (v_id, v_me);

  return public.party_state(v_id);
end;
$$;

----------------------------------------------------------------------
-- party_invite_preview(code): what the invite link shows before
-- joining. Only accepted friends of the creator (and members) see the
-- party; anyone else gets 'invalid_code', so codes reveal nothing.
----------------------------------------------------------------------
create or replace function public.party_invite_preview(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_party party_quests%rowtype;
  v_count int;
  v_member boolean;
  v_reason text;
  v_creator text;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_party from party_quests
    where invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('found', false, 'reason', 'invalid_code');
  end if;
  v_member := public.is_party_member(v_party.id, v_me);
  if not v_member and not public.is_friend(v_party.creator_id, v_me) then
    return jsonb_build_object('found', false, 'reason', 'invalid_code');
  end if;

  select count(*) into v_count from party_members
    where party_id = v_party.id and status <> 'left';
  select coalesce(nullif(first_name, ''), username::text) into v_creator
    from profiles where id = v_party.creator_id;

  v_reason := case
    when v_member then 'already_member'
    when v_party.status = 'completed' then 'party_completed'
    when v_party.status = 'cancelled' then 'party_cancelled'
    when v_party.expires_at <= now() then 'party_expired'
    when v_count >= v_party.max_participants then 'party_full'
    else null end;

  return jsonb_build_object(
    'found', true,
    'party_id', v_party.id,
    'creator_name', v_creator,
    'pillar', v_party.pillar,
    'description', v_party.description,
    'difficulty', v_party.difficulty,
    'xp_reward', v_party.xp_reward,
    'member_count', v_count,
    'max_participants', v_party.max_participants,
    'expires_at', v_party.expires_at,
    'can_join', v_reason is null,
    'reason', v_reason
  );
end;
$$;

----------------------------------------------------------------------
-- join_party_quest(code): friends of the creator only.
----------------------------------------------------------------------
create or replace function public.join_party_quest(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_party party_quests%rowtype;
  v_count int;
  v_existing party_members%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_party from party_quests
    where invite_code = upper(btrim(coalesce(p_code, '')))
    for update;
  if not found then
    raise exception 'invalid_code';
  end if;

  select * into v_existing from party_members
    where party_id = v_party.id and user_id = v_me;
  if found and v_existing.status <> 'left' then
    return public.party_state(v_party.id);  -- idempotent
  end if;

  if not public.is_friend(v_party.creator_id, v_me) then
    raise exception 'invalid_code';  -- same answer as a wrong code
  end if;
  if v_party.status <> 'open' then
    raise exception 'party_closed';
  end if;
  if v_party.expires_at <= now() then
    raise exception 'party_expired';
  end if;

  -- Counted under the party lock, so two joins cannot overfill it.
  select count(*) into v_count from party_members
    where party_id = v_party.id and status <> 'left';
  if v_count >= v_party.max_participants then
    raise exception 'party_full';
  end if;

  insert into party_members (party_id, user_id, status, joined_at)
  values (v_party.id, v_me, 'joined', now())
  on conflict (party_id, user_id) do update
    set status = 'joined', joined_at = now(), done_at = null;

  return public.party_state(v_party.id);
end;
$$;

----------------------------------------------------------------------
-- Internal: pay one member through complete_quest, as that member.
-- complete_quest reads auth.uid(), so the JWT claims are pointed at
-- the member for the call and restored afterwards (transaction-local).
----------------------------------------------------------------------
create or replace function public._award_party_member(p_party uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party party_quests%rowtype;
  v_old_claims text := current_setting('request.jwt.claims', true);
  v_old_sub text := current_setting('request.jwt.claim.sub', true);
  v_today date := public.user_today(p_user);
  v_title text;
  v_quest uuid;
  v_result jsonb;
begin
  select * into v_party from party_quests where id = p_party;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_user::text, true);

    -- Make sure the member's normal daily quests exist first, so the
    -- party quest does not stand in for them.
    perform public.assign_daily_quests(v_today);

    v_title := 'Party: ' || v_party.description;
    insert into quests (user_id, pillar, title, description, difficulty, xp_reward,
                        assigned_date, priority)
    values (p_user, v_party.pillar, v_title, 'Done together with your party.',
            v_party.difficulty, v_party.xp_reward, v_today, 0)
    on conflict (user_id, title, assigned_date) do nothing
    returning id into v_quest;
    if v_quest is null then
      insert into quests (user_id, pillar, title, description, difficulty, xp_reward,
                          assigned_date, priority)
      values (p_user, v_party.pillar,
              v_title || ' #' || upper(substr(p_party::text, 1, 4)),
              'Done together with your party.',
              v_party.difficulty, v_party.xp_reward, v_today, 0)
      returning id into v_quest;
    end if;

    v_result := public.complete_quest(v_quest);

    update party_members set
      quest_id = v_quest,
      xp_awarded = coalesce((v_result ->> 'xp_awarded')::int, 0),
      awarded_at = now(),
      award_note = case when coalesce((v_result ->> 'xp_awarded')::int, 0) = 0
                        then 'daily_xp_cap' end
    where party_id = p_party and user_id = p_user and awarded_at is null;
  exception when others then
    -- Everything in this block is rolled back (claims included); this
    -- member gets 0 XP with the reason, the rest are still paid.
    update party_members set
      xp_awarded = 0,
      awarded_at = now(),
      award_note = left(sqlerrm, 80)
    where party_id = p_party and user_id = p_user and awarded_at is null;
  end;

  perform set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
end;
$$;

revoke execute on function public._award_party_member(uuid, uuid) from public, anon, authenticated;

-- Internal: finish the party if everyone still in it is done.
-- Caller must hold the party row lock.
create or replace function public._try_finish_party(p_party uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active int;
  v_done int;
  v_member record;
begin
  select count(*) filter (where status <> 'left'),
         count(*) filter (where status = 'done')
    into v_active, v_done
  from party_members where party_id = p_party;

  if v_active < 2 or v_done < v_active then
    return false;
  end if;

  -- The one and only open -> completed transition.
  update party_quests set status = 'completed', completed_at = now()
    where id = p_party and status = 'open';
  if not found then
    return false;
  end if;

  -- Fixed user order, so gamification rows are always locked in the
  -- same order (no deadlock with another party finishing).
  for v_member in
    select user_id from party_members
    where party_id = p_party and status = 'done' and awarded_at is null
    order by user_id
  loop
    perform public._award_party_member(p_party, v_member.user_id);
  end loop;
  return true;
end;
$$;

revoke execute on function public._try_finish_party(uuid) from public, anon, authenticated;

----------------------------------------------------------------------
-- complete_party_part(party): "I did my part". The last one in pays
-- everyone. Idempotent, and safe under simultaneous calls.
----------------------------------------------------------------------
create or replace function public.complete_party_part(p_party uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_party party_quests%rowtype;
  v_member party_members%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  -- Serializes every member of this party (see header).
  select * into v_party from party_quests where id = p_party for update;
  if not found or not public.is_party_member(p_party, v_me) then
    raise exception 'party_not_found';
  end if;

  select * into v_member from party_members
    where party_id = p_party and user_id = v_me;

  if v_party.status <> 'open' or v_member.status = 'done' then
    return public.party_state(p_party);
  end if;
  if v_party.expires_at <= now() then
    raise exception 'party_expired';
  end if;

  update party_members set status = 'done', done_at = now()
    where party_id = p_party and user_id = v_me;

  perform public._try_finish_party(p_party);
  return public.party_state(p_party);
end;
$$;

-- Take back "I did my part" while the party is still open.
create or replace function public.undo_party_part(p_party uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_party party_quests%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_party from party_quests where id = p_party for update;
  if not found or not public.is_party_member(p_party, v_me) then
    raise exception 'party_not_found';
  end if;
  if v_party.status <> 'open' then
    raise exception 'party_closed';
  end if;
  update party_members set status = 'joined', done_at = null
    where party_id = p_party and user_id = v_me and status = 'done';
  return public.party_state(p_party);
end;
$$;

----------------------------------------------------------------------
-- leave_party_quest(party): a member leaves; the creator leaving an
-- open party cancels it. If everyone left behind is done, the party
-- finishes.
----------------------------------------------------------------------
create or replace function public.leave_party_quest(p_party uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_party party_quests%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_party from party_quests where id = p_party for update;
  if not found or not public.is_party_member(p_party, v_me) then
    raise exception 'party_not_found';
  end if;
  if v_party.status <> 'open' then
    raise exception 'party_closed';
  end if;

  update party_members set status = 'left', done_at = null
    where party_id = p_party and user_id = v_me;

  if v_party.creator_id = v_me then
    update party_quests set status = 'cancelled' where id = p_party;
    return jsonb_build_object('left', true, 'cancelled', true);
  end if;

  perform public._try_finish_party(p_party);
  return jsonb_build_object('left', true, 'cancelled', false);
end;
$$;

----------------------------------------------------------------------
-- my_party_quests(): open parties and ones finished in the last 7 days.
----------------------------------------------------------------------
create or replace function public.my_party_quests()
returns table (
  id uuid,
  pillar text,
  description text,
  xp_reward int,
  status text,
  max_participants int,
  member_count int,
  done_count int,
  my_status text,
  expires_at timestamptz,
  completed_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select q.id, q.pillar, q.description, q.xp_reward,
         case when q.status = 'open' and q.expires_at <= now() then 'expired'
              else q.status end,
         q.max_participants,
         (select count(*) from party_members a
            where a.party_id = q.id and a.status <> 'left')::int,
         (select count(*) from party_members d
            where d.party_id = q.id and d.status = 'done')::int,
         m.status, q.expires_at, q.completed_at
  from party_members m
  join party_quests q on q.id = m.party_id
  where m.user_id = auth.uid()
    and m.status <> 'left'
    and (q.status = 'open' and q.expires_at > now() - interval '1 day'
         or q.completed_at > now() - interval '7 days')
  order by (q.status = 'open' and q.expires_at > now()) desc, q.created_at desc
  limit 30
$$;

----------------------------------------------------------------------
-- Who may call what.
----------------------------------------------------------------------
revoke execute on function public.party_state(uuid) from public, anon;
revoke execute on function public.create_party_quest(text, text, text, int) from public, anon;
revoke execute on function public.party_invite_preview(text) from public, anon;
revoke execute on function public.join_party_quest(text) from public, anon;
revoke execute on function public.complete_party_part(uuid) from public, anon;
revoke execute on function public.undo_party_part(uuid) from public, anon;
revoke execute on function public.leave_party_quest(uuid) from public, anon;
revoke execute on function public.my_party_quests() from public, anon;
grant execute on function public.party_state(uuid) to authenticated;
grant execute on function public.create_party_quest(text, text, text, int) to authenticated;
grant execute on function public.party_invite_preview(text) to authenticated;
grant execute on function public.join_party_quest(text) to authenticated;
grant execute on function public.complete_party_part(uuid) to authenticated;
grant execute on function public.undo_party_part(uuid) to authenticated;
grant execute on function public.leave_party_quest(uuid) to authenticated;
grant execute on function public.my_party_quests() to authenticated;
