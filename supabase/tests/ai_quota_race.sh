#!/usr/bin/env bash
# Race test for the AI quotas in migration 0045. Fires parallel requests,
# each in its own database session (like parallel Edge Function calls), all
# released at the same instant, and checks that no quota is passed.
#
# Usage: DB_URL=postgres://postgres:postgres@localhost:54322/postgres \
#          bash supabase/tests/ai_quota_race.sh [parallel]
# Needs a database with all migrations. Leaves test users behind
# (emails *@quota-race.local); run it on a local database only.
set -euo pipefail
DB_URL=${DB_URL:?set DB_URL}
N=${1:-30}
A=00000000-0000-4000-8000-0000000000d1
B=00000000-0000-4000-8000-0000000000d2
q() { psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }
as_service() {  # as the Edge Function's service role
  psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=0 2>/dev/null <<SQL
begin;
set local role service_role;
$1
commit;
SQL
}
as_user() {  # as a signed-in app user
  psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
\\o /dev/null
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', '$1', true),
       set_config('role', 'authenticated', true);
\\o
$2
commit;
SQL
}

q "insert into auth.users (id, email) values ('$A','a@quota-race.local'),('$B','b@quota-race.local') on conflict do nothing;
   update profiles set timezone = 'Africa/Tunis' where id in ('$A','$B');
   delete from conversations where user_id in ('$A','$B');
   delete from avatar_generations where user_id in ('$A','$B');
   delete from avatar_generation_jobs where user_id in ('$A','$B');
   delete from quest_generation_log where user_id in ('$A','$B');
   delete from rate_limits where user_id in ('$A','$B');" >/dev/null
CONV=$(q "insert into conversations (user_id) values ('$A') returning id")
CONV_B=$(q "insert into conversations (user_id) values ('$B') returning id")
# Account A already sent 15 of its 20 Coach messages today.
q "insert into messages (conversation_id, role, content) select '$CONV', 'user', 'earlier ' || g from generate_series(1, 15) g" >/dev/null

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
fail=0
start_at() { q "select (now() + interval '1500 milliseconds')::text"; }

# ---- Coach: 5 slots left, N parallel sends ----
at=$(start_at)
for i in $(seq 1 "$N"); do
  as_service "select pg_sleep_until('$at');
    select public.coach_reserve_message('$A', '$CONV', 'race $i', 20) ->> 'ok';" >"$out/coach.$i" &
done
as_service "select pg_sleep_until('$at');
  select public.coach_reserve_message('$B', '$CONV_B', 'other account', 20) ->> 'ok';" >"$out/coach.b" &
wait
accepted=$(cat "$out"/coach.[0-9]* | grep -c '^true$' || true)
saved=$(q "select count(*) from messages m join conversations c on c.id = m.conversation_id where c.user_id = '$A' and m.role = 'user'")
echo "coach: accepted=$accepted saved_total=$saved other_account=$(grep -c '^true$' "$out/coach.b")"
[[ "$accepted" == 5 && "$saved" == 20 && "$(grep -c '^true$' "$out/coach.b")" == 1 ]] || { echo "FAIL coach"; fail=1; }

# ---- AI image: 5 per rolling 24 h, N parallel requests ----
at=$(start_at)
for i in $(seq 1 "$N"); do
  as_service "select pg_sleep_until('$at');
    select public.reserve_avatar_generation('$A', 5) ->> 'ok';" >"$out/img.$i" &
done
wait
accepted=$(cat "$out"/img.* | grep -c '^true$' || true)
rows=$(q "select count(*) from avatar_generations where user_id = '$A'")
echo "ai image: accepted=$accepted rows=$rows"
[[ "$accepted" == 5 && "$rows" == 5 ]] || { echo "FAIL ai image"; fail=1; }
# A released attempt (provider did no work) frees its slot.
q "update avatar_generations set counted = false, error = 'fal_503' where id = (select min(id) from avatar_generations where user_id = '$A')" >/dev/null
again=$(as_service "select public.reserve_avatar_generation('$A', 5) ->> 'ok';" | tr -d '\n')
after=$(as_service "select public.reserve_avatar_generation('$A', 5) ->> 'ok';" | tr -d '\n')
echo "ai image after refund: next=$again then=$after"
[[ "$again" == true && "$after" == false ]] || { echo "FAIL ai image refund"; fail=1; }

# ---- Selfie jobs: one at a time, N parallel inserts by the app ----
at=$(start_at)
for i in $(seq 1 "$N"); do
  as_user "$A" "select pg_sleep_until('$at');
    insert into avatar_generation_jobs (user_id) values ('$A');" >"$out/job.$i" &
done
wait
jobs=$(q "select count(*) from avatar_generation_jobs where user_id = '$A'")
echo "selfie jobs: inserted=$jobs (want 1)"
[[ "$jobs" == 1 ]] || { echo "FAIL selfie jobs"; fail=1; }

# ---- AI quests: N parallel on-demand claims for the same day ----
at=$(start_at)
for i in $(seq 1 "$N"); do
  as_service "select pg_sleep_until('$at');
    select public.claim_quest_generation('$A', current_date, true);" >"$out/gen.$i" &
done
wait
claimed=$(cat "$out"/gen.* | grep -c '^claimed$' || true)
busy=$(cat "$out"/gen.* | grep -c '^busy$' || true)
echo "ai quests: claimed=$claimed busy=$busy"
[[ "$claimed" == 1 && "$busy" == $((N - 1)) ]] || { echo "FAIL ai quests"; fail=1; }

if [[ $fail -eq 0 ]]; then echo "PASS: no quota passed under $N parallel requests"; else echo "FAIL"; exit 1; fi
