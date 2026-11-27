-- Migration 0046: durable Coach turns.
-- One turn id = one saved message, one quota use, at most one running paid
-- call, one saved reply. Old messages without a turn id are untouched.
begin;
select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000046a1', 'turn-a@example.test'),
  ('00000000-0000-4000-8000-0000000046b2', 'turn-b@example.test');
insert into conversations (id, user_id) values
  ('00000000-0000-4000-8000-0000000146a1', '00000000-0000-4000-8000-0000000046a1'),
  ('00000000-0000-4000-8000-0000000146b2', '00000000-0000-4000-8000-0000000046b2');
-- A conversation from before 0046 (no turn ids).
insert into messages (conversation_id, role, content, created_at) values
  ('00000000-0000-4000-8000-0000000146a1', 'user', 'old question', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000146a1', 'assistant', 'old answer', now() - interval '3 days');

select is(has_function_privilege('authenticated', 'public.coach_begin_turn(uuid, uuid, uuid, text, int)', 'EXECUTE'),
  false, 'app users cannot begin a turn directly');
select is(has_function_privilege('authenticated', 'public.coach_claim_provider_call(uuid, uuid, boolean)', 'EXECUTE'),
  false, 'app users cannot claim a paid call');
select is(has_function_privilege('authenticated', 'public.coach_complete_turn(uuid, uuid, text, text, boolean, int)', 'EXECUTE'),
  false, 'app users cannot write a reply');
select is(has_function_privilege('service_role', 'public.coach_begin_turn(uuid, uuid, uuid, text, int)', 'EXECUTE'),
  true, 'the service role begins turns');

set local role service_role;

-- ---- begin: once per turn id --------------------------------------------
select is((public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
  '00000000-0000-4000-8000-0000000146a1', '11111111-1111-4111-8111-111111111111', 'Plan my week', 3)
  ->> 'existing')::boolean, false, 'a new turn is begun');
select is((public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
  '00000000-0000-4000-8000-0000000146a1', '11111111-1111-4111-8111-111111111111', 'Plan my week', 3)
  ->> 'existing')::boolean, true, 'the same turn id again is the existing turn');
select is((select count(*)::int from messages where turn_id = '11111111-1111-4111-8111-111111111111'),
  1, 'the user message is saved once');
select is((public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
  '00000000-0000-4000-8000-0000000146a1', '11111111-1111-4111-8111-111111111111', 'Plan my week', 3)
  ->> 'sent_today')::int, 1, 'a resent turn is counted once');

-- ---- ownership ------------------------------------------------------------
select throws_ok(
  $$select public.coach_begin_turn('00000000-0000-4000-8000-0000000046b2',
    '00000000-0000-4000-8000-0000000146b2', '11111111-1111-4111-8111-111111111111', 'steal', 3)$$,
  'turn_conflict', 'another account cannot reuse a turn id');
select is(public.coach_get_turn('00000000-0000-4000-8000-0000000046b2', '11111111-1111-4111-8111-111111111111'),
  null, 'another account cannot read the turn');
select throws_ok(
  $$select public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046b2',
    '11111111-1111-4111-8111-111111111111', true)$$,
  'turn_not_found', 'another account cannot claim a paid call for it');
select throws_ok(
  $$select public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
    '00000000-0000-4000-8000-0000000146b2', '22222222-2222-4222-8222-222222222222', 'not my chat', 3)$$,
  'conversation_not_found', 'a turn cannot be begun in another account''s chat');

-- ---- one paid call at a time ------------------------------------------------
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '11111111-1111-4111-8111-111111111111', false), true, 'the first paid call is claimed');
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '11111111-1111-4111-8111-111111111111', false), false, 'a second request while generating gets no paid call');
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '11111111-1111-4111-8111-111111111111', true), false, 'not even with retry while the call is fresh');

-- ---- save once ------------------------------------------------------------
select is(public.coach_complete_turn('00000000-0000-4000-8000-0000000046a1',
  '11111111-1111-4111-8111-111111111111', 'We start with Monday.', 'm', false, 420) ->> 'status',
  'saved', 'the reply is saved');
select is(public.coach_complete_turn('00000000-0000-4000-8000-0000000046a1',
  '11111111-1111-4111-8111-111111111111', 'A second, different reply', 'm', false, 9) #>> '{assistant_message,content}',
  'We start with Monday.', 'a second save keeps the first reply');
select is((select count(*)::int from messages where turn_id = '11111111-1111-4111-8111-111111111111' and role = 'assistant'),
  1, 'one reply row per turn');
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '11111111-1111-4111-8111-111111111111', true), false, 'a saved turn never calls the provider again');
select is((select first_text_ms from coach_turns where id = '11111111-1111-4111-8111-111111111111'),
  420, 'time to first text is recorded');

-- ---- uncertain: only an explicit retry, at most 3 calls ---------------------
select public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
  '00000000-0000-4000-8000-0000000146a1', '33333333-3333-4333-8333-333333333333', 'Timeout please', 3);
select public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', false);
select is(public.coach_settle_turn('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', 'uncertain', 'provider_timeout') ->> 'can_retry',
  'true', 'a timed-out turn is uncertain and can be retried');
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', false), false, 'no automatic call for an uncertain turn');
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', true), true, 'an explicit retry may call again');
select public.coach_settle_turn('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', 'uncertain', 'provider_timeout');
select public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', true);
select public.coach_settle_turn('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', 'uncertain', 'provider_timeout');
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333', true), false, 'the fourth paid call is refused');
select is((public.coach_get_turn('00000000-0000-4000-8000-0000000046a1',
  '33333333-3333-4333-8333-333333333333') ->> 'can_retry')::boolean, false, 'and the app is told so');

-- ---- a worker that died mid-call is reported as uncertain ---------------------
select public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
  '00000000-0000-4000-8000-0000000146a1', '44444444-4444-4444-8444-444444444444', 'Lost worker', 3);
select public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '44444444-4444-4444-8444-444444444444', false);
update coach_turns set provider_started_at = now() - interval '5 minutes'
  where id = '44444444-4444-4444-8444-444444444444';
select is(public.coach_get_turn('00000000-0000-4000-8000-0000000046a1',
  '44444444-4444-4444-8444-444444444444') ->> 'status', 'uncertain', 'a stale running call reads as uncertain');
select is(public.coach_claim_provider_call('00000000-0000-4000-8000-0000000046a1',
  '44444444-4444-4444-8444-444444444444', false), false, 'still no automatic call');

-- ---- quota: 3 turns used, the 4th new turn is refused, nothing saved -----------
select is(public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
  '00000000-0000-4000-8000-0000000146a1', '55555555-5555-4555-8555-555555555555', 'over', 3) ->> 'ok',
  'false', 'a new turn over the daily limit is refused');
select is((select count(*)::int from coach_turns where id = '55555555-5555-4555-8555-555555555555'),
  0, 'the refused turn is not saved');
select is((public.coach_begin_turn('00000000-0000-4000-8000-0000000046a1',
  '00000000-0000-4000-8000-0000000146a1', '11111111-1111-4111-8111-111111111111', 'Plan my week', 3)
  ->> 'ok')::boolean, true, 'an existing turn is still answered at the limit');

-- ---- stop -----------------------------------------------------------------------
select is(public.coach_settle_turn('00000000-0000-4000-8000-0000000046a1',
  '11111111-1111-4111-8111-111111111111', 'stopped', null) ->> 'status', 'saved',
  'Stop after the save keeps the saved reply');

reset role;

-- ---- RLS: the app reads only its own turns ---------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000046b2","role":"authenticated"}';
select is((select count(*)::int from coach_turns), 0, 'B sees none of A''s turns');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000046a1","role":"authenticated"}';
select is((select count(*)::int from coach_turns), 3, 'A sees its own turns');
select throws_ok(
  $$update coach_turns set status = 'saved'$$,
  '42501', null, 'the app cannot change a turn');

reset role;
select is((select count(*)::int from messages
  where conversation_id = '00000000-0000-4000-8000-0000000146a1' and turn_id is null),
  2, 'messages from before turns are kept as they were');

select * from finish();
rollback;
