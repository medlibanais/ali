-- smart-notify (0016): who gets a streak-risk push right now.
-- Run with: npm run db:test   (supabase test db, pgTAP)
--
-- Timezones are picked from Etc/GMT zones so each user's local hour is
-- known whatever time the test runs: "in window" = local 17:xx,
-- "outside" = local 10:xx.
begin;
select plan(14);

create function pg_temp.tz_at(p_hour int) returns text language sql as $$
  select name from pg_timezone_names
  where name like 'Etc/GMT%' and name not in ('Etc/GMT', 'Etc/GMT0', 'Etc/GMT-0', 'Etc/GMT+0')
    and extract(hour from now() at time zone name)::int = p_hour
  order by name limit 1
$$;

-- a1 match | a2 outside window | a3 no streak | a4 completed today
-- a5 opted out | a6 no device | a7 already sent | a8 streak_rescue today
-- a9 push disabled | b1 last_active today (offline sync) | b2 not onboarded
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000000' || s)::uuid, s || '@test.local'
from unnest(array['a1','a2','a3','a4','a5','a6','a7','a8','a9','b1','b2']) s;

update public.profiles set onboarding_completed = true, first_name = 'Sara',
  timezone = pg_temp.tz_at(17);
update public.profiles set timezone = pg_temp.tz_at(10)
  where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set onboarding_completed = false
  where id = '00000000-0000-0000-0000-0000000000b2';

update public.gamification g set current_streak = 5,
  last_active_date = public.user_today(g.user_id) - 1;
update public.gamification set current_streak = 0
  where user_id = '00000000-0000-0000-0000-0000000000a3';
update public.gamification g set last_active_date = public.user_today(g.user_id)
  where user_id = '00000000-0000-0000-0000-0000000000b1';

insert into public.device_tokens (user_id, token, platform)
select id, 'ExponentPushToken[' || id || ']', 'android' from public.profiles
where id <> '00000000-0000-0000-0000-0000000000a6';

update public.notification_preferences set streak_risk = false
  where user_id = '00000000-0000-0000-0000-0000000000a5';
update public.notification_preferences set push_enabled = false
  where user_id = '00000000-0000-0000-0000-0000000000a9';

-- a4 completed a quest an hour ago (local today).
insert into public.quests (id, user_id, pillar, title, difficulty, xp_reward, assigned_date)
values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a4',
        'health', 'Walk', 'easy', 10, public.user_today('00000000-0000-0000-0000-0000000000a4'));
insert into public.quest_completions (user_id, quest_id, completed_at, xp_awarded)
values ('00000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000004',
        now() - interval '1 hour', 10);

insert into public.notification_sends (user_id, kind, local_date)
values ('00000000-0000-0000-0000-0000000000a7', 'streak_risk',
        public.user_today('00000000-0000-0000-0000-0000000000a7'));
insert into public.notifications (user_id, type, title)
values ('00000000-0000-0000-0000-0000000000a8', 'streak_rescue', 'Rescue');

-- a1's weakest pillar over the last week is family.
insert into public.daily_scores (user_id, score_date, health, family, work, fun, spirituality)
select '00000000-0000-0000-0000-0000000000a1',
       public.user_today('00000000-0000-0000-0000-0000000000a1') - d, 60, 12, 50, 40, 70
from generate_series(1, 3) d;
-- Today's (unfinished) score must not count.
insert into public.daily_scores (user_id, score_date, health, family, work, fun, spirituality)
values ('00000000-0000-0000-0000-0000000000a1',
        public.user_today('00000000-0000-0000-0000-0000000000a1'), 0, 100, 100, 100, 100);

create temp table c as select * from public.smart_notify_candidates();

select is((select count(*)::int from c), 1, 'exactly one user matches');
select is((select user_id from c), '00000000-0000-0000-0000-0000000000a1'::uuid, 'the matching user is a1');
select is((select weakest_pillar from c), 'family', 'weakest pillar = lowest 7-day average, today excluded');
select is((select current_streak from c), 5, 'streak is returned');
select is((select local_date from c), public.user_today('00000000-0000-0000-0000-0000000000a1'), 'local date is the user''s today');
select is((select first_name from c), 'Sara', 'first name is returned');

select is(
  (select count(*)::int from public.smart_notify_candidates(9, 12)
   where user_id = '00000000-0000-0000-0000-0000000000a2'),
  1, 'a2 matches when the window covers their local hour');

select is(public.weakest_pillar('00000000-0000-0000-0000-0000000000a5',
  public.user_today('00000000-0000-0000-0000-0000000000a5')), 'health',
  'no scores and no quests: falls back to health');

-- Double-send guard: the claim key rejects a second row for the same day.
insert into public.notification_sends (user_id, kind, local_date)
values ('00000000-0000-0000-0000-0000000000a1', 'streak_risk',
        public.user_today('00000000-0000-0000-0000-0000000000a1'));
select throws_ok(
  $$insert into public.notification_sends (user_id, kind, local_date)
    values ('00000000-0000-0000-0000-0000000000a1', 'streak_risk',
            public.user_today('00000000-0000-0000-0000-0000000000a1'))$$,
  '23505', null, 'second claim the same day is rejected');
select is((select count(*)::int from public.smart_notify_candidates()), 0,
  'a claimed user is no longer a candidate');

-- An undone completion does not count as "done today".
delete from public.notification_sends where user_id = '00000000-0000-0000-0000-0000000000a1';
update public.quest_completions set undone_at = now()
  where user_id = '00000000-0000-0000-0000-0000000000a4';
select is((select count(*)::int from public.smart_notify_candidates()
  where user_id = '00000000-0000-0000-0000-0000000000a4'), 1,
  'undone completion: user is at risk again');

-- App users cannot call the selector, read the log or fire the job.
set local role authenticated;
select throws_ok('select * from public.smart_notify_candidates()', '42501', null,
  'authenticated cannot list candidates');
select is((select count(*)::int from public.notification_sends), 0,
  'authenticated sees no send log rows');
select throws_ok('select public.invoke_smart_notify()', '42501', null,
  'authenticated cannot fire the job');
reset role;

select * from finish();
rollback;
