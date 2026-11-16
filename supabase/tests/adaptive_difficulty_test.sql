-- Adaptive difficulty from 0015: calculate_user_difficulty rules, edge
-- cases and who may call it.
-- Run with: npm run db:test   (supabase test db, pgTAP)
begin;
select plan(29);

-- new: no history. up: crushes hard quests. undo: 4 live + 1 undone hard.
-- down: misses medium quests. few: only 2 hard quests. tz: lives in UTC+14.
-- top: already Expert. other: someone else's data.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'new@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'up@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', 'undo@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'down@test.local'),
  ('00000000-0000-0000-0000-0000000000d5', 'few@test.local'),
  ('00000000-0000-0000-0000-0000000000d6', 'tz@test.local'),
  ('00000000-0000-0000-0000-0000000000d7', 'top@test.local');
update public.profiles set timezone = 'UTC'
  where id::text like '00000000-0000-0000-0000-0000000000d%';
update public.profiles set timezone = 'Pacific/Kiritimati'
  where id = '00000000-0000-0000-0000-0000000000d6';

-- n quests of one difficulty, `days_ago` days before the user's today;
-- the first `done` get a live completion, the next `undone` an undone one.
create function pg_temp.mk(p uuid, diff text, days_ago int, n int, done int, undone int default 0)
returns void language plpgsql as $$
declare i int; qid uuid;
begin
  for i in 1..n loop
    insert into public.quests (user_id, pillar, title, difficulty, xp_reward, assigned_date)
    values (p, 'health', diff || ' ' || days_ago || ' ' || i, diff,
            case diff when 'easy' then 10 when 'medium' then 20 else 50 end,
            public.user_today(p) - days_ago)
    returning id into qid;
    if i <= done then
      insert into public.quest_completions (user_id, quest_id, xp_awarded) values (p, qid, 10);
    elsif i <= done + undone then
      insert into public.quest_completions (user_id, quest_id, xp_awarded, undone_at)
      values (p, qid, 10, now());
    end if;
  end loop;
end;
$$;

create function pg_temp.lvl(p uuid) returns int language sql as $$
  select level::int from public.calculate_user_difficulty(p)
$$;

---------------------------------------------------------------- no history
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d1'), 1, 'no history: Beginner');
select is((select label from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d1')),
  'Beginner', 'label for level 1');
select is((select has_history from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d1')),
  false, 'no history is reported');
select ok((select hard_rate is null and medium_rate is null and easy_rate is null
           from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d1')),
  'no history: rates are null, not divide-by-zero');

---------------------------------------------------------------- level up
-- 5/5 hard (100%) and 4/5 medium over the window; old and today's quests
-- are outside it and would otherwise drag the rate down.
select pg_temp.mk('00000000-0000-0000-0000-0000000000d2', 'hard', 2, 5, 5);
select pg_temp.mk('00000000-0000-0000-0000-0000000000d2', 'medium', 3, 5, 4);
select pg_temp.mk('00000000-0000-0000-0000-0000000000d2', 'hard', 15, 10, 0);
select pg_temp.mk('00000000-0000-0000-0000-0000000000d2', 'hard', 0, 10, 0);
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d2'), 2, '>80% hard: Beginner -> Intermediate');
select is((select hard_rate from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d2')),
  1.0000::numeric, 'hard rate uses only the 14-day window (today and day 15 left out)');
select is((select hard_assigned from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d2')),
  5, 'hard denominator is assigned quests in the window');
select is((select medium_rate from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d2')),
  0.8000::numeric, 'medium rate 4/5');
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d2'), 2, 'same day again: no second step');
select is((select previous_level from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d2')),
  2::smallint, 'cached call reports no change');
-- Next day (pretend the last evaluation was yesterday): steps again.
update public.user_difficulty set evaluated_on = evaluated_on - 1
  where user_id = '00000000-0000-0000-0000-0000000000d2';
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d2'), 3, 'next day: Intermediate -> Advanced');
select is((select label from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d2')),
  'Advanced', 'label for level 3');

---------------------------------------------------------------- undone does not count
select pg_temp.mk('00000000-0000-0000-0000-0000000000d3', 'hard', 1, 5, 4, 1);
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d3'), 1, 'undone completion does not count: 4/5 = 80% is not > 80%');
select is((select hard_rate from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d3')),
  0.8000::numeric, 'hard rate 0.8');

---------------------------------------------------------------- level down
insert into public.user_difficulty (user_id, level) values ('00000000-0000-0000-0000-0000000000d4', 3);
select pg_temp.mk('00000000-0000-0000-0000-0000000000d4', 'medium', 4, 10, 3);
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d4'), 2, '<40% medium: Advanced -> Intermediate');
-- At Beginner the down rule cannot go lower.
update public.user_difficulty set level = 1, evaluated_on = null
  where user_id = '00000000-0000-0000-0000-0000000000d4';
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d4'), 1, 'never below Beginner');

---------------------------------------------------------------- small samples
select pg_temp.mk('00000000-0000-0000-0000-0000000000d5', 'hard', 1, 2, 2);
select pg_temp.mk('00000000-0000-0000-0000-0000000000d5', 'medium', 1, 2, 0);
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d5'), 1, 'fewer than 3 quests of a difficulty: no move');
select is((select has_history from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d5')),
  true, 'some history is reported');

---------------------------------------------------------------- timezone
-- In Kiritimati (UTC+14) "today" is ahead of UTC; quests on their today
-- are left out, yesterday's count.
select pg_temp.mk('00000000-0000-0000-0000-0000000000d6', 'hard', 0, 5, 0);
select pg_temp.mk('00000000-0000-0000-0000-0000000000d6', 'hard', 1, 4, 4);
select is((select hard_assigned from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d6')),
  4, 'window follows the user''s own timezone');
select is((select evaluated_on from public.user_difficulty where user_id = '00000000-0000-0000-0000-0000000000d6'),
  public.user_today('00000000-0000-0000-0000-0000000000d6'), 'evaluated_on is the user''s local date');
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d6'), 2, '4/4 hard: up');

---------------------------------------------------------------- cap
insert into public.user_difficulty (user_id, level) values ('00000000-0000-0000-0000-0000000000d7', 4);
select pg_temp.mk('00000000-0000-0000-0000-0000000000d7', 'hard', 1, 5, 5);
select is(pg_temp.lvl('00000000-0000-0000-0000-0000000000d7'), 4, 'never above Expert');

---------------------------------------------------------------- errors
select throws_ok($$ select * from public.calculate_user_difficulty('00000000-0000-0000-0000-00000000dead') $$,
  'P0002', 'user_not_found', 'unknown user');
select throws_ok($$ select * from public.calculate_user_difficulty(null) $$,
  '22004', 'user_id_required', 'null user id');

---------------------------------------------------------------- who may call
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true),
       set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
select is((select level::int from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d1')),
  1, 'a user can read their own difficulty');
select throws_ok($$ select * from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d2') $$,
  '42501', 'forbidden', 'a user cannot compute someone else''s difficulty');
select is((select count(*)::int from public.user_difficulty), 1, 'RLS: a user sees only their own row');
select throws_ok($$ update public.user_difficulty set level = 4 $$,
  '42501', null, 'a user cannot set their own level');

reset role;
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.calculate_user_difficulty('00000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'anon cannot call it');
reset role;

select * from finish();
rollback;
