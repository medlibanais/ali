-- Offline sync rules from 0015: idempotent replays, day attribution,
-- streak repair, and the bounds on the client's claimed time.
-- Run with: npm run db:test   (supabase test db, pgTAP)
begin;
select plan(31);

-- Pick a fixed-offset zone where it is now between 02:00 and 20:59, so
-- "yesterday 21:00" and "today 01:00" are both in the past and inside
-- the 24 h window, whenever this test runs.
create function pg_temp.tz() returns text language sql stable as $$
  select z from (
    select 'Etc/GMT' || case when o > 0 then '+' || o::text when o < 0 then o::text else '' end as z
    from generate_series(-14, 12) o
  ) zones
  where extract(hour from now() at time zone z) between 2 and 20
  order by z limit 1
$$;
create function pg_temp.at(d date, h int) returns timestamptz language sql stable as $$
  select (d + make_interval(hours => h))::timestamp at time zone pg_temp.tz()
$$;
create function pg_temp.today() returns date language sql stable as $$
  select (now() at time zone pg_temp.tz())::date
$$;
create function pg_temp.act_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.path', '/rpc/sync_quest_completion', true),
         set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.q(u uuid, n text) returns uuid language sql security definer as $$
  select id from public.quests where user_id = u and title = n
$$;
create function pg_temp.gam(p uuid) returns public.gamification language sql security definer as $$
  select * from public.gamification where user_id = p
$$;
create function pg_temp.comp(p uuid) returns public.quest_completions language sql security definer as $$
  select * from public.quest_completions where client_id = p
$$;

-- ana: plain syncs. bo: streak repair after the midnight reset.
-- cy: streak repair when today already restarted. dee: daily limit.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'bo@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'cy@test.local'),
  ('00000000-0000-0000-0000-0000000000b4', 'dee@test.local');
update public.profiles set onboarding_completed = true, timezone = pg_temp.tz()
  where id::text like '00000000-0000-0000-0000-0000000000b%';

-- Quests: today's and yesterday's, created yesterday morning.
insert into public.quests (user_id, pillar, title, difficulty, xp_reward, assigned_date, created_at)
select u, 'health', t || n, 'easy', 10, d, pg_temp.at(pg_temp.today() - 1, 6)
from (values ('00000000-0000-0000-0000-0000000000b1'::uuid),
             ('00000000-0000-0000-0000-0000000000b2'::uuid),
             ('00000000-0000-0000-0000-0000000000b3'::uuid),
             ('00000000-0000-0000-0000-0000000000b4'::uuid)) users(u),
     (values ('Today ', pg_temp.today()), ('Yday ', pg_temp.today() - 1)) days(t, d),
     generate_series(1, 18) n;
insert into public.quests (user_id, pillar, title, difficulty, xp_reward, assigned_date, created_at)
values ('00000000-0000-0000-0000-0000000000b1', 'work', 'Old', 'hard', 50,
        pg_temp.today() - 3, now() - interval '4 days'),
       ('00000000-0000-0000-0000-0000000000b1', 'work', 'Fresh', 'hard', 50,
        pg_temp.today(), now() - interval '10 minutes');

---------------------------------------------------------------- idempotency
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 1'),
     '11111111-1111-4111-8111-000000000001', now() - interval '5 minutes')->>'duplicate')::boolean,
  false, 'a queued completion is accepted');
select is((pg_temp.gam(auth.uid())).total_xp > 0, true, 'it awards XP');
select is((pg_temp.comp('11111111-1111-4111-8111-000000000001')).synced_at is not null, true,
  'a late completion is marked as synced late');
select ok(abs(extract(epoch from (pg_temp.comp('11111111-1111-4111-8111-000000000001')).completed_at
  - (now() - interval '5 minutes'))) < 1, 'it keeps the time it happened');

create temp table xp_before as select (pg_temp.gam('00000000-0000-0000-0000-0000000000b1')).total_xp as xp;
select is(
  (public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 1'),
     '11111111-1111-4111-8111-000000000001', now() - interval '5 minutes')->>'duplicate')::boolean,
  true, 'replaying the same client id is reported as a duplicate');
select is(
  (public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 1'),
     '11111111-1111-4111-8111-000000000099', now())->>'duplicate')::boolean,
  true, 'a second id for an already completed quest is a duplicate too');
select is((pg_temp.gam(auth.uid())).total_xp, (select xp from xp_before),
  'replays never add XP');

-- Undone and replayed: still never a second award.
select pg_temp.as_admin();
update public.quest_completions set undone_at = now()
  where client_id = '11111111-1111-4111-8111-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 1'),
     '11111111-1111-4111-8111-000000000001', now())->>'duplicate')::boolean,
  true, 'a replay after an undo does not complete the quest again');

---------------------------------------------------------------- time bounds
select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 2'),
  '11111111-1111-4111-8111-000000000002', now() + interval '3 hours');
select ok((pg_temp.comp('11111111-1111-4111-8111-000000000002')).completed_at <= now(),
  'a clock running ahead is clamped to now');

select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Fresh'),
  '11111111-1111-4111-8111-000000000003', now() - interval '3 hours');
select ok((pg_temp.comp('11111111-1111-4111-8111-000000000003')).completed_at >= now() - interval '11 minutes',
  'a completion cannot predate its quest');

select throws_ok(
  $$select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 3'),
      '11111111-1111-4111-8111-000000000004', now() - interval '25 hours')$$,
  'offline_completion_too_old', 'more than 24 hours back is refused');
select throws_ok(
  $$select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Old'),
      '11111111-1111-4111-8111-000000000005', now() - interval '1 hour')$$,
  'quest_not_today', 'a quest from another day cannot be synced onto today');
select throws_ok(
  $$select public.sync_quest_completion(pg_temp.q('00000000-0000-0000-0000-0000000000b2', 'Today 1'),
      '11111111-1111-4111-8111-000000000006', now())$$,
  'not_your_quest', 'someone else''s quest is refused');
select throws_ok(
  $$select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 4'), null, now())$$,
  'invalid_sync_payload', 'an idempotency key is required');

select is(
  (public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 5'),
     '11111111-1111-4111-8111-000000000007', pg_temp.at(pg_temp.today(), 1))->>'time_bonus')::int,
  5, 'the before-6-PM bonus follows the time the quest was done');
select is(
  (public.sync_quest_completion(pg_temp.q(auth.uid(), 'Yday 1'),
     '11111111-1111-4111-8111-000000000008', pg_temp.at(pg_temp.today() - 1, 21))->>'time_bonus')::int,
  0, 'no bonus for a completion after 6 PM, even when synced in the morning');
select is(
  (public.sync_quest_completion(pg_temp.q(auth.uid(), 'Yday 2'),
     '11111111-1111-4111-8111-000000000009', pg_temp.at(pg_temp.today() - 1, 22))->>'counted_on')::date,
  pg_temp.today() - 1, 'a completion from before midnight counts on yesterday');

select throws_ok(
  $$update public.quest_completions set completed_at = now() - interval '2 days'
    where client_id = '11111111-1111-4111-8111-000000000009'$$,
  '42501', null, 'synced completions still cannot be edited directly');

---------------------------------------------------------------- streaks
-- Midnight job recorded what it reset.
select pg_temp.as_admin();
set local session_replication_role = replica;
update public.gamification set current_streak = 5, best_streak = 5,
  last_active_date = pg_temp.today() - 2
  where user_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b3');
set local session_replication_role = origin;
select public.expire_stale_streaks();
select is((pg_temp.gam('00000000-0000-0000-0000-0000000000b2')).current_streak, 0,
  'the midnight job still resets a stale streak');
select is((pg_temp.gam('00000000-0000-0000-0000-0000000000b2')).lapsed_streak, 5,
  'and remembers it for one day');

-- bo: the completion was in the queue at midnight.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Yday 1'),
  '22222222-2222-4222-8222-000000000001', pg_temp.at(pg_temp.today() - 1, 21));
select is((pg_temp.gam(auth.uid())).current_streak, 6,
  'a synced completion from yesterday repairs the streak');
select is((pg_temp.gam(auth.uid())).last_active_date, pg_temp.today() - 1,
  'and makes yesterday the last active day');
select is((pg_temp.gam(auth.uid())).lapsed_streak, null::int, 'the remembered streak is used up');
select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 1'),
  '22222222-2222-4222-8222-000000000002', now());
select is((pg_temp.gam(auth.uid())).current_streak, 7, 'today then continues the chain');

-- cy: completed something online today before the queue synced.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select public.complete_quest(pg_temp.q(auth.uid(), 'Today 1'));
select is((pg_temp.gam(auth.uid())).current_streak, 1, 'online today restarts a broken streak');
select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Yday 1'),
  '33333333-3333-4333-8333-000000000001', pg_temp.at(pg_temp.today() - 1, 21));
select is((pg_temp.gam(auth.uid())).current_streak, 7,
  'yesterday arriving late rebuilds 5 + yesterday + today');
select is((pg_temp.gam(auth.uid())).last_active_date, pg_temp.today(), 'today stays the last active day');
select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Yday 2'),
  '33333333-3333-4333-8333-000000000002', pg_temp.at(pg_temp.today() - 1, 22));
select is((pg_temp.gam(auth.uid())).current_streak, 7, 'a second one for yesterday adds nothing');

-- ana never had a streak to repair: yesterday cannot invent one.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select ok((pg_temp.gam(auth.uid())).current_streak <= 2,
  'backdating cannot build a streak longer than the days actually covered');

---------------------------------------------------------------- daily limit
select pg_temp.as_admin();
insert into public.quest_completions (user_id, quest_id, xp_awarded, completed_at)
select '00000000-0000-0000-0000-0000000000b4', id, 10, pg_temp.at(pg_temp.today() - 1, 8)
from public.quests
where user_id = '00000000-0000-0000-0000-0000000000b4' and title like 'Yday %'
order by title limit 15;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b4');
select throws_ok(
  $$select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Yday 9'),
      '44444444-4444-4444-8444-000000000001', pg_temp.at(pg_temp.today() - 1, 20))$$,
  'daily_completion_limit', 'the 15-per-day limit applies to the day it happened');
select lives_ok(
  $$select public.sync_quest_completion(pg_temp.q(auth.uid(), 'Today 1'),
      '44444444-4444-4444-8444-000000000002', now())$$,
  'and does not spill into today');

select * from finish();
rollback;
