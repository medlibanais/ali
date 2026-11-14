-- Anti-cheat rules from 0013: completion limit, locked XP, timezone streaks.
-- Run with: npm run db:test   (supabase test db, pgTAP)
begin;
select plan(31);

-- Users: ana (plays), sam (stale streak), tia (alive streak), kim (timezone hop).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'sam@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'tia@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'kim@test.local');
update public.profiles set onboarding_completed = true, timezone = 'UTC'
  where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');

-- 20 easy quests for ana today (more than the limit), one from last week.
insert into public.quests (user_id, pillar, title, difficulty, xp_reward, assigned_date)
select '00000000-0000-0000-0000-0000000000a1', 'health', 'Quest ' || i, 'easy', 10,
       public.user_today('00000000-0000-0000-0000-0000000000a1')
from generate_series(1, 20) i;
insert into public.quests (user_id, pillar, title, difficulty, xp_reward, assigned_date)
values ('00000000-0000-0000-0000-0000000000a1', 'work', 'Old quest', 'hard', 50,
        public.user_today('00000000-0000-0000-0000-0000000000a1') - 7);
insert into public.quests (user_id, pillar, title, difficulty, xp_reward, assigned_date)
values ('00000000-0000-0000-0000-0000000000a3', 'fun', 'Tia quest', 'medium', 20,
        public.user_today('00000000-0000-0000-0000-0000000000a3'));

create function pg_temp.act_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create function pg_temp.q(n text) returns uuid language sql security definer as $$
  select id from public.quests
  where user_id = '00000000-0000-0000-0000-0000000000a1' and title = n
$$;
create function pg_temp.gam(p uuid) returns public.gamification language sql security definer as $$
  select * from public.gamification where user_id = p
$$;

---------------------------------------------------------------- (2) no direct writes
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$update public.gamification set total_xp = 999999 where user_id = auth.uid()$$,
  '42501', null, 'total_xp cannot be updated directly');
select throws_ok(
  $$update public.gamification set current_streak = 365 where user_id = auth.uid()$$,
  '42501', null, 'current_streak cannot be updated directly');
select throws_ok(
  $$insert into public.gamification (user_id, total_xp) values (auth.uid(), 999999)$$,
  '42501', null, 'a gamification row cannot be inserted directly');
select throws_ok(
  $$delete from public.gamification where user_id = auth.uid()$$,
  '42501', null, 'a gamification row cannot be deleted directly');
select throws_ok(
  $$insert into public.quest_completions (user_id, quest_id, xp_awarded)
    values (auth.uid(), pg_temp.q('Quest 1'), 500)$$,
  '42501', null, 'completions cannot be inserted directly');
select throws_ok(
  $$update public.quests set xp_reward = 50 where user_id = auth.uid()$$,
  '42501', null, 'quest rewards cannot be edited directly');
select throws_ok(
  $$insert into public.quests (user_id, pillar, title, difficulty, xp_reward, assigned_date)
    values (auth.uid(), 'work', 'Fake', 'hard', 50, current_date)$$,
  '42501', null, 'quests cannot be invented directly');
select throws_ok(
  $$insert into public.daily_scores (user_id, score_date, overall) values (auth.uid(), current_date, 100)$$,
  '42501', null, 'daily scores cannot be written directly');
select is((select count(*)::int from public.gamification where user_id = auth.uid()), 1,
  'ana can still read her own gamification row');

---------------------------------------------------------------- game rules still apply
select is(
  (public.complete_quest(pg_temp.q('Quest 1')))->>'xp_awarded',
  (10 + case when extract(hour from now() at time zone 'UTC') < 18 then 5 else 0 end + 10)::text,
  'first completion: easy 10 + time bonus + streak bonus for day 1');
select is((pg_temp.gam(auth.uid())).current_streak, 1, 'streak starts at 1');
select is(
  (public.complete_quest(pg_temp.q('Quest 1')))->>'quest_id',
  pg_temp.q('Quest 1')::text, 'completing the same quest again is idempotent');
select lives_ok($$select public.undo_quest_completion(pg_temp.q('Quest 1'))$$, 'undo still works');
select is((pg_temp.gam(auth.uid())).xp_today, 0, 'undo refunds the quest XP');
select lives_ok($$select public.complete_quest(pg_temp.q('Quest 1'))$$, 'the quest can be completed again');

---------------------------------------------------------------- (1) 15 per day
-- So far: complete, undo, complete = 2 completions counted for today.
select lives_ok($$select public.complete_quest(pg_temp.q('Quest ' || i)) from generate_series(2, 14) i$$,
  'completions 3 to 15 succeed');
select is(
  (select count(*)::int from public.quest_completions where user_id = auth.uid()), 15,
  '15 completions recorded today (the undone one included)');
select throws_ok(
  $$select public.complete_quest(pg_temp.q('Quest 15'))$$,
  'daily_completion_limit', 'the 16th completion of the day is refused');
select lives_ok(
  $$select public.complete_quest(pg_temp.q('Quest 3'))$$,
  're-sending an already completed quest is still fine at the limit');
select ok((pg_temp.gam(auth.uid())).xp_today <= 500, 'the 500 XP daily cap still holds');
select throws_ok(
  $$select public.complete_quest(pg_temp.q('Old quest'))$$,
  'quest_not_today', 'a quest from last week cannot be completed');
select throws_ok(
  $$select public.assign_daily_quests(public.user_today(auth.uid()) + 30)$$,
  'quest_date_out_of_range', 'a changed device clock cannot create quests for next month');

---------------------------------------------------------------- (3) streaks by timezone
reset role;
-- tia was active yesterday: the streak is alive and today's completion extends it.
update public.gamification
  set current_streak = 3, best_streak = 3,
      last_active_date = public.user_today('00000000-0000-0000-0000-0000000000a3') - 1
  where user_id = '00000000-0000-0000-0000-0000000000a3';
-- Saving a streak whose last active day is 3 days ago keeps it at 0.
update public.gamification
  set current_streak = 9, best_streak = 9,
      last_active_date = public.user_today('00000000-0000-0000-0000-0000000000a2') - 3
  where user_id = '00000000-0000-0000-0000-0000000000a2';
select is((pg_temp.gam('00000000-0000-0000-0000-0000000000a2')).current_streak, 0,
  'a streak with a missed day cannot be saved');
select is((pg_temp.gam('00000000-0000-0000-0000-0000000000a2')).best_streak, 9,
  'best streak is kept');

-- kim lives in Pago Pago (UTC-11) and was active yesterday there.
update public.profiles set timezone = 'Pacific/Pago_Pago'
  where id = '00000000-0000-0000-0000-0000000000a4';
update public.gamification
  set current_streak = 6, best_streak = 6,
      last_active_date = public.user_today('00000000-0000-0000-0000-0000000000a4') - 1
  where user_id = '00000000-0000-0000-0000-0000000000a4';
select is(public.expire_stale_streaks(), 0, 'nobody is stale yet: the midnight job changes nothing');
select is((pg_temp.gam('00000000-0000-0000-0000-0000000000a4')).current_streak, 6, 'kim keeps a 6-day streak');
-- In Kiritimati (UTC+14) it is always 1-2 days later, so "yesterday" in
-- Pago Pago is at least 2 days ago there: kim's midnight has passed
-- without a completion. Stands in for the clock moving past midnight.
update public.profiles set timezone = 'Pacific/Kiritimati'
  where id = '00000000-0000-0000-0000-0000000000a4';
select is(public.expire_stale_streaks(), 1, 'the midnight job resets exactly one streak');
select is((pg_temp.gam('00000000-0000-0000-0000-0000000000a4')).current_streak, 0, 'kim''s streak is back to 0');
select is((pg_temp.gam('00000000-0000-0000-0000-0000000000a3')).current_streak, 3, 'tia''s live streak is untouched');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((public.complete_quest((select id from public.quests where title = 'Tia quest')))->>'current_streak',
  '4', 'completing today extends tia''s streak from 3 to 4');

---------------------------------------------------------------- timezone hopping
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.profiles set timezone = 'Europe/Paris' where id = auth.uid();
select throws_ok(
  $$update public.profiles set timezone = 'Pacific/Kiritimati' where id = auth.uid()$$,
  'timezone_change_too_soon', 'a second timezone change within 7 days is refused');

select * from finish();
rollback;
