-- Party Quests (0025): RLS, invites, completion, fair XP, idempotency.
-- Run with: npm run db:test   (supabase test db, pgTAP)
begin;
select plan(30);

-- ana creates, ben and cy are ana's friends, dan is a stranger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'ana@party.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@party.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'cy@party.local'),
  ('00000000-0000-0000-0000-0000000000b4', 'dan@party.local');
update public.profiles set onboarding_completed = true, timezone = 'UTC',
  username = 'p_' || right(id::text, 2)
  where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2',
               '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b4');
insert into public.friendships (requester, addressee, status, responded_at) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3', 'accepted', now());

create function pg_temp.act_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.path', '/rpc/test', true),
         set_config('role', 'authenticated', true);
$$;
create function pg_temp.xp(p uuid) returns int language sql security definer as $$
  select total_xp from public.gamification where user_id = p
$$;
create table pg_temp.ctx (k text primary key, v text);
grant all on pg_temp.ctx to authenticated;

---------------------------------------------------------------- create
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
insert into pg_temp.ctx
  select 'party', (public.create_party_quest('health', 'Walk 5k together', 'medium', 3)) ->> 'id';
insert into pg_temp.ctx
  select 'code', invite_code from public.party_quests where id = (select v::uuid from pg_temp.ctx where k = 'party');

select is((select count(*)::int from public.party_members), 1, 'creator is the first member');
select is((select xp_reward from public.party_quests), 20, 'medium party quest is worth 20 XP');
select throws_ok(
  $$select public.create_party_quest('health', 'x', 'medium', 3)$$,
  'invalid_description', 'too-short description is refused');
select throws_ok(
  $$select public.create_party_quest('health', 'Walk', 'legendary', 3)$$,
  'invalid_difficulty', 'unknown difficulty is refused');

---------------------------------------------------------------- stranger sees nothing
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b4');
select is((select count(*)::int from public.party_quests), 0, 'non-member reads no parties');
select is((select count(*)::int from public.party_members), 0, 'non-member reads no members');
select throws_ok(
  $$select public.party_state((select v::uuid from pg_temp.ctx where k = 'party'))$$,
  'party_not_found', 'non-member cannot read party state');
select is(
  public.party_invite_preview((select v from pg_temp.ctx where k = 'code')) ->> 'found', 'false',
  'invite preview hides the party from a non-friend');
select throws_ok(
  $$select public.join_party_quest((select v from pg_temp.ctx where k = 'code'))$$,
  'invalid_code', 'non-friend cannot join with the link');
select ok(
  not public.is_party_topic_member('party:' || (select v from pg_temp.ctx where k = 'party'), auth.uid()),
  'non-member may not use the realtime topic');
select throws_ok(
  $$insert into public.party_members (party_id, user_id)
    values ((select v::uuid from pg_temp.ctx where k = 'party'), auth.uid())$$,
  '42501', null, 'party_members cannot be inserted directly');
select throws_ok(
  $$select public.complete_party_part((select v::uuid from pg_temp.ctx where k = 'party'))$$,
  'party_not_found', 'non-member cannot complete the party');

---------------------------------------------------------------- friend joins
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select is(
  public.party_invite_preview((select v from pg_temp.ctx where k = 'code')) ->> 'can_join', 'true',
  'friend of the creator can join');
select is(
  jsonb_array_length(public.join_party_quest(lower((select v from pg_temp.ctx where k = 'code'))) -> 'members'),
  2, 'join adds the friend (code is case-insensitive)');
select is(
  jsonb_array_length(public.join_party_quest((select v from pg_temp.ctx where k = 'code')) -> 'members'),
  2, 'joining twice is a no-op');
select is((select count(*)::int from public.party_members), 2, 'member reads all members');
select ok(
  public.is_party_topic_member('party:' || (select v from pg_temp.ctx where k = 'party'), auth.uid()),
  'member may use the realtime topic');
select throws_ok(
  $$update public.party_quests set xp_reward = 50$$,
  '42501', null, 'party_quests cannot be updated directly');

---------------------------------------------------------------- completion
reset role;
insert into pg_temp.ctx values
  ('ana_xp', pg_temp.xp('00000000-0000-0000-0000-0000000000b1')::text),
  ('ben_xp', pg_temp.xp('00000000-0000-0000-0000-0000000000b2')::text);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is(
  public.complete_party_part((select v::uuid from pg_temp.ctx where k = 'party')) ->> 'status', 'open',
  'party stays open until everyone is done');
reset role;
select is(pg_temp.xp('00000000-0000-0000-0000-0000000000b1'),
  (select v::int from pg_temp.ctx where k = 'ana_xp'), 'no XP before the party is complete');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select is(
  public.complete_party_part((select v::uuid from pg_temp.ctx where k = 'party')) ->> 'status', 'completed',
  'last member completes the party');
reset role;
select ok(pg_temp.xp('00000000-0000-0000-0000-0000000000b1')
          >= (select v::int from pg_temp.ctx where k = 'ana_xp') + 20, 'creator got the XP');
select ok(pg_temp.xp('00000000-0000-0000-0000-0000000000b2')
          >= (select v::int from pg_temp.ctx where k = 'ben_xp') + 20, 'friend got the XP');
select is(
  (select count(*)::int from public.party_members where awarded_at is not null and xp_awarded >= 20),
  2, 'both members are recorded as paid');
select is(
  (select count(*)::int from public.quests q join public.quest_completions c on c.quest_id = q.id
   where q.title = 'Party: Walk 5k together' and c.undone_at is null),
  2, 'each member has a completed party quest row');

insert into pg_temp.ctx values ('ben_after', pg_temp.xp('00000000-0000-0000-0000-0000000000b2')::text);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select is(
  public.complete_party_part((select v::uuid from pg_temp.ctx where k = 'party')) ->> 'status', 'completed',
  'completing again returns the finished state');
reset role;
select is(public._try_finish_party((select v::uuid from pg_temp.ctx where k = 'party')), false,
  'a completed party cannot be finished (paid) twice');
select is(pg_temp.xp('00000000-0000-0000-0000-0000000000b2'),
  (select v::int from pg_temp.ctx where k = 'ben_after'), 'no double XP');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select throws_ok(
  $$select public.join_party_quest((select v from pg_temp.ctx where k = 'code'))$$,
  'party_closed', 'a completed party cannot be joined');

---------------------------------------------------------------- full party
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
insert into pg_temp.ctx
  select 'code2', (public.create_party_quest('fun', 'Board game night', 'easy', 2)) ->> 'invite_code';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select public.join_party_quest((select v from pg_temp.ctx where k = 'code2'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select throws_ok(
  $$select public.join_party_quest((select v from pg_temp.ctx where k = 'code2'))$$,
  'party_full', 'a full party refuses more members');

select * from finish();
rollback;
