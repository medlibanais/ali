-- Migration 0045: AI quotas are reserved in Postgres before any paid call.
-- Parallel requests are covered by ai_quota_race.sh.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'quota-a@example.test'),
  ('00000000-0000-4000-8000-0000000000f2', 'quota-b@example.test');
insert into conversations (id, user_id) values
  ('00000000-0000-4000-8000-0000000001f1', '00000000-0000-4000-8000-0000000000f1'),
  ('00000000-0000-4000-8000-0000000001f2', '00000000-0000-4000-8000-0000000000f2');

-- Only the Edge Functions (service role) may reserve quota.
select is(has_function_privilege('authenticated', 'public.coach_reserve_message(uuid, uuid, text, int)', 'EXECUTE'),
  false, 'app users cannot call the coach reservation');
select is(has_function_privilege('anon', 'public.reserve_avatar_generation(uuid, int)', 'EXECUTE'),
  false, 'anonymous callers cannot reserve an AI image');
select is(has_function_privilege('authenticated', 'public.claim_quest_generation(uuid, date, boolean)', 'EXECUTE'),
  false, 'app users cannot claim quest generation');
select is(has_function_privilege('service_role', 'public.coach_reserve_message(uuid, uuid, text, int)', 'EXECUTE'),
  true, 'the service role can reserve coach quota');

set local role service_role;

-- Coach: 3 allowed, the 4th is refused with the reset time; nothing saved.
select is((public.coach_reserve_message('00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000001f1', 'hi ' || g, 3) ->> 'ok')::boolean, true,
  'coach message ' || g || ' accepted') from generate_series(1, 3) g;
select is(public.coach_reserve_message('00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000001f1', 'one more', 3) ->> 'ok', 'false',
  'the message over the limit is refused');
select isnt(public.coach_reserve_message('00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000001f1', 'one more', 3) ->> 'resets_at', null,
  'a refusal says when the quota resets');
select throws_ok(
  $$select public.coach_reserve_message('00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000001f2', 'not my chat', 20)$$,
  'conversation_not_found', 'a conversation of another account is refused');

-- AI image: refunds free the slot, counted failures do not.
select is((public.reserve_avatar_generation('00000000-0000-4000-8000-0000000000f2', 2) ->> 'ok')::boolean,
  true, 'first image reserved');
select is((public.reserve_avatar_generation('00000000-0000-4000-8000-0000000000f2', 2) ->> 'ok')::boolean,
  true, 'second image reserved');
select is((public.reserve_avatar_generation('00000000-0000-4000-8000-0000000000f2', 2) ->> 'ok')::boolean,
  false, 'third image refused');
update avatar_generations set counted = false
  where id = (select min(id) from avatar_generations where user_id = '00000000-0000-4000-8000-0000000000f2');
select is((public.reserve_avatar_generation('00000000-0000-4000-8000-0000000000f2', 2) ->> 'ok')::boolean,
  true, 'a released attempt frees its slot');

-- AI quests: claim, busy, done.
select is(public.claim_quest_generation('00000000-0000-4000-8000-0000000000f1', current_date, true),
  'claimed', 'first caller claims the day');
select is(public.claim_quest_generation('00000000-0000-4000-8000-0000000000f1', current_date, true),
  'busy', 'a second caller waits');
update quest_generation_log set status = 'ok', generated_count = 3
  where user_id = '00000000-0000-4000-8000-0000000000f1';
select is(public.claim_quest_generation('00000000-0000-4000-8000-0000000000f1', current_date, true),
  'done', 'a finished day is not generated again');

reset role;
select * from finish();
rollback;
