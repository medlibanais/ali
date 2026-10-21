-- Friends feature: consent, blocking, privacy and leaderboard rules.
-- Run with: npm run db:test   (supabase test db, pgTAP)
begin;
select plan(40);

-- Users: alice, bob, carol, dave, erin.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@test.local'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@test.local');
update public.profiles set username = 'alice', first_name = 'Alice', invite_code = 'ALICE001'
  where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set username = 'bob', first_name = 'Bob', invite_code = 'BOB00001'
  where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set username = 'carol', first_name = 'Carol'
  where id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set username = 'dave', first_name = 'Dave'
  where id = '00000000-0000-0000-0000-00000000000d';
update public.profiles set username = 'erin', first_name = 'Erin'
  where id = '00000000-0000-0000-0000-00000000000e';
update public.gamification set level = 7, total_xp = 13500, current_streak = 4, best_streak = 9
  where user_id = '00000000-0000-0000-0000-00000000000b';
insert into public.daily_scores (user_id, score_date, xp_earned)
  values ('00000000-0000-0000-0000-00000000000b', public.user_today('00000000-0000-0000-0000-00000000000b'), 120);

-- Act as a signed-in user.
create function pg_temp.act_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create function pg_temp.status_of(a uuid, b uuid) returns text language sql security definer as $$
  select status from public.friendships
  where least(requester, addressee) = least(a, b) and greatest(requester, addressee) = greatest(a, b)
$$;

---------------------------------------------------------------- consent
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');

select throws_ok(
  $$insert into public.friendships (requester, addressee, status)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted')$$,
  '42501', null, 'cannot insert an accepted friendship directly');

select lives_ok(
  $$select public.send_friend_request('00000000-0000-0000-0000-00000000000b')$$,
  'alice can send bob a request');
select is(pg_temp.status_of('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  'pending', 'request is pending');

update public.friendships set status = 'accepted';
select is(pg_temp.status_of('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  'pending', 'requester cannot accept their own request by updating the row');

select throws_ok(
  $$select public.respond_friend_request(
      (select id from public.friendships limit 1), true)$$,
  'not_your_request', 'requester cannot accept through the RPC either');

select throws_ok(
  $$select public.send_friend_request('00000000-0000-0000-0000-00000000000b')$$,
  'request_already_pending', 'duplicate request is refused');

select throws_ok(
  $$select public.send_friend_request('00000000-0000-0000-0000-00000000000a')$$,
  'cannot_friend_yourself', 'cannot friend yourself');

---------------------------------------------------------------- profile privacy
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  1, 'bob can see the profile of someone who sent him a request');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  0, 'bob cannot read a stranger''s profile');
select is((select count(*)::int from public.profiles where invite_code is not null and id <> auth.uid()
           and id not in (select requester from public.friendships union select addressee from public.friendships)),
  0, 'invite codes of strangers are not readable');

---------------------------------------------------------------- search
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.search_users('%')), 0, 'a % search does not list everyone');
select is((select count(*)::int from public.search_users('_o%')), 0, 'wildcards are treated as text');
select is((select count(*)::int from public.search_users('a')), 0, 'one character is too short');
select is((select relation from public.search_users('al') where username = 'alice'),
  'none', 'carol finds alice by prefix');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((select relation from public.search_users('bob')), 'outgoing', 'alice sees her request to bob as outgoing');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select relation from public.search_users('alice')), 'incoming', 'bob sees alice''s request as incoming');

---------------------------------------------------------------- accept
select lives_ok(
  $$select public.respond_friend_request(
      (select id from public.friendships where addressee = auth.uid() and status = 'pending'), true)$$,
  'bob accepts alice');
select is(pg_temp.status_of('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  'accepted', 'alice and bob are friends');
select throws_ok(
  $$select public.respond_friend_request(
      (select id from public.friendships where addressee = auth.uid() limit 1), false)$$,
  'already_responded', 'an answered request cannot be answered again');

---------------------------------------------------------------- leaderboard
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.friend_leaderboard()), 2, 'leaderboard has alice and bob');
select is((select is_me from public.friend_leaderboard() where username = 'alice'), true, 'alice is marked as me');
select is((select level from public.friend_leaderboard() where username = 'bob'), 7, 'bob''s level is shared');
select is((select weekly_xp from public.friend_leaderboard() where username = 'bob'), 120, 'bob''s weekly XP counts this week');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
update public.profiles set stats_visibility = 'private' where id = auth.uid();
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((select weekly_xp from public.friend_leaderboard() where username = 'bob'), null::int,
  'private stats are hidden on the leaderboard');
select is((select count(*)::int from public.gamification where user_id = '00000000-0000-0000-0000-00000000000b'),
  0, 'private stats are hidden from direct reads');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.friend_leaderboard()), 1, 'a stranger''s leaderboard is just themselves');

---------------------------------------------------------------- mutual add
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select public.send_friend_request('00000000-0000-0000-0000-00000000000a');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((public.send_friend_request('00000000-0000-0000-0000-00000000000c'))->>'status', 'accepted',
  'adding someone who already asked you accepts their request');

---------------------------------------------------------------- blocking
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select public.send_friend_request('00000000-0000-0000-0000-00000000000a');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.block_user('00000000-0000-0000-0000-00000000000d');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.friendships), 0, 'the blocked user cannot see the block');
delete from public.friendships;
select is(pg_temp.status_of('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d'),
  'blocked', 'the blocked user cannot delete the block');
select public.block_user('00000000-0000-0000-0000-00000000000a');
select public.unblock_user('00000000-0000-0000-0000-00000000000a');
select is(pg_temp.status_of('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d'),
  'blocked', 'the blocked user cannot take over and lift the block');
select throws_ok(
  $$select public.send_friend_request('00000000-0000-0000-0000-00000000000a')$$,
  'cannot_request', 'the blocked user cannot send a request');
select is((select count(*)::int from public.search_users('alice')), 0, 'the blocked user cannot find the blocker');
select is((public.redeem_invite('ALICE001'))->>'redeemed', 'false', 'an invite code does not get around a block');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.blocked_users()), 1, 'alice sees dave in her blocked list');
select public.unblock_user('00000000-0000-0000-0000-00000000000d');
select is(pg_temp.status_of('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d'),
  null, 'the blocker can lift the block');

---------------------------------------------------------------- decline cooldown
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select public.send_friend_request('00000000-0000-0000-0000-00000000000a');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.respond_friend_request(
  (select id from public.friendships where addressee = auth.uid() and status = 'pending'), false);
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select throws_ok(
  $$select public.send_friend_request('00000000-0000-0000-0000-00000000000a')$$,
  'request_declined_recently', 'a declined request cannot be resent right away');

---------------------------------------------------------------- invite codes
select pg_temp.act_as('00000000-0000-0000-0000-00000000000e');
select is((public.redeem_invite('bob00001'))->>'redeemed', 'true', 'erin redeems bob''s invite code');
select is(pg_temp.status_of('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000e'),
  'accepted', 'an invite connects instantly');

---------------------------------------------------------------- score integrity
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$update public.gamification set total_xp = 999999, level = 100 where user_id = auth.uid()$$,
  'direct_write_forbidden', 'XP and level cannot be edited directly from the app');

---------------------------------------------------------------- anon
reset role;
set local role anon;
select throws_ok(
  $$select public.send_friend_request('00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'signed-out callers cannot use the friends RPCs');

select * from finish();
rollback;
