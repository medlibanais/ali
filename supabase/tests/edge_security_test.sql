-- The Edge Function records the verified caller before doing embedding work.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'search-limit-a@example.test'),
  ('00000000-0000-4000-8000-0000000000e2', 'search-limit-b@example.test');

select is(has_function_privilege('anon', 'public.reserve_quest_search(uuid)', 'EXECUTE'),
  false, 'anonymous callers cannot reserve a search');
select is(has_function_privilege('authenticated', 'public.reserve_quest_search(uuid)', 'EXECUTE'),
  false, 'client callers cannot affect the search quota');
select is(has_function_privilege('service_role', 'public.reserve_quest_search(uuid)', 'EXECUTE'),
  true, 'the Edge Function service role can reserve a search');

set local role service_role;
select lives_ok(
  $$select public.reserve_quest_search('00000000-0000-4000-8000-0000000000e1')
    from generate_series(1, 30)$$,
  '30 requests are accepted within the window');
select throws_ok(
  $$select public.reserve_quest_search('00000000-0000-4000-8000-0000000000e1')$$,
  'rate_limited', 'the next request is refused');
select lives_ok(
  $$select public.reserve_quest_search('00000000-0000-4000-8000-0000000000e2')$$,
  'the other account has its own quota');

reset role;
update public.rate_limits set called_at = now() - interval '61 seconds'
  where user_id = '00000000-0000-4000-8000-0000000000e1';
set local role service_role;
select lives_ok(
  $$select public.reserve_quest_search('00000000-0000-4000-8000-0000000000e1')$$,
  'requests resume after the window');
reset role;
select * from finish();
rollback;
