#!/usr/bin/env bash
# Race test for Party Quests: retry creation and finish from two sessions.
# Each creation must return the same party and XP must be paid once.
#
# Usage: DB_URL=postgres://postgres:postgres@localhost:54322/postgres \
#          bash supabase/tests/party_quests_race.sh [rounds]
# Needs a database with all migrations + seed.sql. Leaves test users
# behind (emails *@race.local); run it on a local database only.
set -euo pipefail
DB_URL=${DB_URL:?set DB_URL}
ROUNDS=${1:-10}
A=00000000-0000-0000-0000-0000000000c1
B=00000000-0000-0000-0000-0000000000c2
C=00000000-0000-0000-0000-0000000000c3
q() { psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }
as_user() {  # as_user <uuid> <sql>
  psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 <<SQL
begin;
\\o /dev/null
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', '$1', true),
       set_config('request.path', '/rpc/test', true),
       set_config('role', 'authenticated', true);
\\o
$2
commit;
SQL
}

q "insert into auth.users (id, email) values ('$A','a@race.local'),('$B','b@race.local'),('$C','c@race.local') on conflict do nothing;
   update profiles set onboarding_completed = true, timezone = 'UTC' where id in ('$A','$B','$C');
   insert into friendships (requester, addressee, status, responded_at)
     values ('$A','$B','accepted',now()),('$A','$C','accepted',now()) on conflict do nothing;
   delete from party_quests where creator_id = '$A';
   delete from quest_completions where user_id in ('$A','$B','$C');
   delete from quests where user_id in ('$A','$B','$C');
   update gamification set xp_today = 0, xp_today_date = null where user_id in ('$A','$B','$C');" >/dev/null

create_result=$(mktemp)
trap 'rm -f "$create_result"' EXIT
fail=0
for i in $(seq 1 "$ROUNDS"); do
  request_id=$(q "select gen_random_uuid();")
  at=$(q "select (now() + interval '700 milliseconds')::text")
  create_sql="do \$\$ begin perform pg_sleep_until('$at'); end \$\$;
    select public.create_party_quest(
    'health', 'Race round $i', 'easy', 3, '$request_id') ->> 'id';"
  as_user "$A" "$create_sql" >"$create_result" &
  first_create_pid=$!
  party=$(as_user "$A" "$create_sql")
  wait "$first_create_pid"
  if [[ -z "$party" || "$party" != "$(cat "$create_result")" ]]; then
    echo "FAIL: concurrent retries returned different party IDs"
    exit 1
  fi
  code=$(q "select invite_code from party_quests where id = '$party'")
  as_user $B "select 1 from public.join_party_quest('$code');" >/dev/null
  as_user $C "select 1 from public.join_party_quest('$code');" >/dev/null
  as_user $A "select 1 from public.complete_party_part('$party');" >/dev/null
  # Both start at the same wall-clock instant.
  at=$(q "select (now() + interval '700 milliseconds')::text")
  as_user $B "select pg_sleep_until('$at'); select 1 from public.complete_party_part('$party');" >/dev/null &
  as_user $C "select pg_sleep_until('$at'); select 1 from public.complete_party_part('$party');" >/dev/null &
  wait
  res=$(q "select (select status from party_quests where id = '$party') || ' paid=' ||
                  (select count(*) from party_members where party_id = '$party' and awarded_at is not null) || ' completions=' ||
                  (select count(*) from quest_completions c join quests k on k.id = c.quest_id
                     where k.title like 'Party: Race round $i%' and c.undone_at is null)")
  echo "round $i: $res"
  [[ "$res" == "completed paid=3 completions=3" ]] || fail=1
  q "delete from party_quests where creator_id = '$A'; delete from quest_completions where user_id in ('$A','$B','$C'); update gamification set xp_today = 0 where user_id in ('$A','$B','$C');" >/dev/null
done
if [[ $fail -eq 0 ]]; then echo "PASS: every member paid exactly once in every round"; else echo "FAIL"; exit 1; fi
