-- PrayerLock 0046: durable Coach turns.
--
-- Every message the app sends to the Coach now carries a stable turn id that
-- the app makes (a UUID) and keeps on the phone until the turn ends. The
-- same id is used for:
--   * the user's message row       (messages.turn_id, role 'user')
--   * the Coach's reply row        (messages.turn_id, role 'assistant')
--   * the quota reservation        (one coach_turns row = one counted message)
--   * the provider calls           (coach_turns.provider_calls)
-- So a resend of the same turn (lost signal, app restart, double tap) never
-- saves the message twice, never counts twice and never pays twice.
--
-- Turn states
--   reserved    message saved and counted; no paid call has started yet.
--               Safe to continue automatically.
--   generating  a paid provider call started (provider_started_at).
--               Another request for the same turn waits for it; it never
--               starts a second paid call.
--   saved       the reply is saved (assistant_message_id). A resend replays
--               it without calling the provider.
--   uncertain   a paid call started but we do not know what happened
--               (provider timeout, or the worker died: 'generating' for more
--               than 90 s is read as uncertain). Only an explicit "Try again"
--               from the person may start another paid call, at most
--               3 paid calls per turn. It does not count as a new message.
--   stopped     the person tapped Stop before any word was written.
--
-- Older apps that send no turn id still work: the Edge Function makes a turn
-- id for them. Existing conversations and messages are untouched (turn_id
-- stays null on old rows).
--
-- All writes go through service-role-only RPCs called by the coach Edge
-- Function with the user id from the verified JWT. The app may only read its
-- own turns (RLS), to recover after a restart.

create table if not exists public.coach_turns (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  status text not null default 'reserved'
    check (status in ('reserved', 'generating', 'saved', 'uncertain', 'stopped')),
  user_message_id uuid references public.messages (id) on delete set null,
  assistant_message_id uuid references public.messages (id) on delete set null,
  provider_calls int not null default 0 check (provider_calls >= 0),
  provider_started_at timestamptz,
  model text,
  degraded boolean not null default false,
  error text,
  -- Time from the request reaching the function to the first text sent.
  first_text_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists coach_turns_user_created_idx
  on public.coach_turns (user_id, created_at desc);
create index if not exists coach_turns_conversation_idx
  on public.coach_turns (conversation_id);

alter table public.messages add column if not exists turn_id uuid;
-- One user row and one reply row per turn, at most.
create unique index if not exists messages_turn_role_key
  on public.messages (turn_id, role) where turn_id is not null;

alter table public.coach_turns enable row level security;

drop policy if exists coach_turns_owner_read on public.coach_turns;
create policy coach_turns_owner_read on public.coach_turns
  for select to authenticated
  using (user_id = auth.uid());
-- No insert/update/delete policy: only the Edge Function (service role)
-- writes turns, through the functions below.

revoke all on public.coach_turns from anon, authenticated;
grant select on public.coach_turns to authenticated;

-- A turn stuck in 'generating' this long is reported as 'uncertain'.
create or replace function public.coach_turn_stale_after()
returns interval language sql immutable as $$ select interval '90 seconds' $$;

-- Paid calls allowed per turn (first try + explicit "Try again" taps).
create or replace function public.coach_turn_max_calls()
returns int language sql immutable as $$ select 3 $$;

-- Public view of a turn (what the function and the app see).
create or replace function public.coach_turn_json(p_turn public.coach_turns)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'turn_id', p_turn.id,
    'conversation_id', p_turn.conversation_id,
    'status', case
      when p_turn.status = 'generating'
        and p_turn.provider_started_at < now() - public.coach_turn_stale_after()
      then 'uncertain'
      else p_turn.status
    end,
    'provider_calls', p_turn.provider_calls,
    'can_retry', (
      p_turn.status in ('uncertain', 'reserved')
      or (p_turn.status = 'generating'
          and p_turn.provider_started_at < now() - public.coach_turn_stale_after())
    ) and p_turn.provider_calls < public.coach_turn_max_calls(),
    'degraded', p_turn.degraded,
    'model', p_turn.model,
    'error', p_turn.error,
    'user_message', (
      select jsonb_build_object('id', m.id, 'content', m.content, 'created_at', m.created_at)
      from public.messages m where m.id = p_turn.user_message_id
    ),
    'assistant_message', (
      select jsonb_build_object('id', m.id, 'content', m.content, 'created_at', m.created_at)
      from public.messages m where m.id = p_turn.assistant_message_id
    )
  );
$$;

----------------------------------------------------------------------
-- Begin (or resume) a turn: quota + user message, once per turn id
----------------------------------------------------------------------
-- Returns { ok, existing, turn, sent_today, remaining_today, resets_at }.
--   ok false + no turn   daily limit reached (nothing saved)
--   existing true        this turn id was already begun; nothing new is
--                        saved or counted. turn.status says what to do.
-- Raises turn_conflict (42501) when the turn id belongs to someone else or
-- to another conversation.
create or replace function public.coach_begin_turn(
  p_user uuid,
  p_conversation uuid,
  p_turn uuid,
  p_content text,
  p_limit int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_sent int;
  v_turn public.coach_turns%rowtype;
  v_msg uuid;
begin
  if p_user is null or p_conversation is null or p_turn is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  -- Same lock as coach_reserve_message (0045): one quota per account.
  perform pg_advisory_xact_lock(hashtextextended('coach_quota:' || p_user::text, 0));

  select coalesce(timezone, 'UTC') into v_tz from profiles where id = p_user;
  select b.day_start, b.day_end into v_start, v_end
  from public.day_bounds_in_tz(coalesce(v_tz, 'UTC')) b;

  select count(*) into v_sent
  from messages m
  join conversations c on c.id = m.conversation_id
  where c.user_id = p_user
    and m.role = 'user'
    and m.created_at >= v_start
    and m.created_at < v_end;

  select * into v_turn from coach_turns where id = p_turn for update;
  if found then
    if v_turn.user_id <> p_user or v_turn.conversation_id <> p_conversation then
      raise exception 'turn_conflict' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'ok', true,
      'existing', true,
      'turn', public.coach_turn_json(v_turn),
      'sent_today', v_sent,
      'remaining_today', greatest(0, p_limit - v_sent),
      'resets_at', v_end
    );
  end if;

  if p_content is null or length(btrim(p_content)) = 0 then
    raise exception 'empty_message' using errcode = '22023';
  end if;
  if not exists (
    select 1 from conversations where id = p_conversation and user_id = p_user
  ) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if v_sent >= p_limit then
    return jsonb_build_object(
      'ok', false,
      'existing', false,
      'sent_today', v_sent,
      'remaining_today', 0,
      'resets_at', v_end
    );
  end if;

  insert into messages (conversation_id, role, content, turn_id)
  values (p_conversation, 'user', p_content, p_turn)
  returning id into v_msg;

  insert into coach_turns (id, user_id, conversation_id, status, user_message_id)
  values (p_turn, p_user, p_conversation, 'reserved', v_msg)
  returning * into v_turn;

  return jsonb_build_object(
    'ok', true,
    'existing', false,
    'turn', public.coach_turn_json(v_turn),
    'sent_today', v_sent + 1,
    'remaining_today', greatest(0, p_limit - v_sent - 1),
    'resets_at', v_end
  );
end;
$$;

----------------------------------------------------------------------
-- Claim the right to make one paid provider call for this turn
----------------------------------------------------------------------
-- Returns true when the caller may call the provider now. Allowed from
--   reserved                        (first call, automatic)
--   uncertain / stale generating    only with p_explicit_retry (the person
--                                   tapped "Try again"), under the cap
-- Everything else returns false: the turn is saved, or a call is running.
create or replace function public.coach_claim_provider_call(
  p_user uuid,
  p_turn uuid,
  p_explicit_retry boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turn public.coach_turns%rowtype;
  v_stale boolean;
begin
  select * into v_turn from coach_turns
  where id = p_turn and user_id = p_user
  for update;
  if not found then
    raise exception 'turn_not_found' using errcode = 'P0002';
  end if;
  if v_turn.provider_calls >= public.coach_turn_max_calls() then
    return false;
  end if;
  v_stale := v_turn.status = 'generating'
    and v_turn.provider_started_at < now() - public.coach_turn_stale_after();
  if v_turn.status = 'reserved'
     or (p_explicit_retry and (v_turn.status = 'uncertain' or v_stale)) then
    update coach_turns
       set status = 'generating',
           provider_calls = provider_calls + 1,
           provider_started_at = now(),
           error = null,
           updated_at = now()
     where id = p_turn;
    return true;
  end if;
  return false;
end;
$$;

----------------------------------------------------------------------
-- Save the reply (idempotent) / record an uncertain or stopped outcome
----------------------------------------------------------------------
create or replace function public.coach_complete_turn(
  p_user uuid,
  p_turn uuid,
  p_content text,
  p_model text default null,
  p_degraded boolean default false,
  p_first_text_ms int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turn public.coach_turns%rowtype;
  v_msg uuid;
begin
  select * into v_turn from coach_turns
  where id = p_turn and user_id = p_user
  for update;
  if not found then
    raise exception 'turn_not_found' using errcode = 'P0002';
  end if;
  if v_turn.status = 'saved' and v_turn.assistant_message_id is not null then
    -- Already saved by an earlier request: keep the first reply.
    return public.coach_turn_json(v_turn);
  end if;
  if p_content is null or length(btrim(p_content)) = 0 then
    raise exception 'empty_message' using errcode = '22023';
  end if;

  insert into messages (conversation_id, role, content, turn_id)
  values (v_turn.conversation_id, 'assistant', p_content, p_turn)
  on conflict (turn_id, role) where turn_id is not null do nothing
  returning id into v_msg;
  if v_msg is null then
    select id into v_msg from messages where turn_id = p_turn and role = 'assistant';
  end if;

  update coach_turns
     set status = 'saved',
         assistant_message_id = v_msg,
         model = coalesce(p_model, model),
         degraded = coalesce(p_degraded, false),
         first_text_ms = coalesce(first_text_ms, p_first_text_ms),
         error = null,
         completed_at = now(),
         updated_at = now()
   where id = p_turn
  returning * into v_turn;
  return public.coach_turn_json(v_turn);
end;
$$;

create or replace function public.coach_settle_turn(
  p_user uuid,
  p_turn uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turn public.coach_turns%rowtype;
begin
  if p_status not in ('uncertain', 'stopped', 'reserved') then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  update coach_turns
     set status = p_status,
         error = left(p_error, 200),
         updated_at = now(),
         completed_at = case when p_status = 'stopped' then now() else completed_at end
   where id = p_turn and user_id = p_user and status <> 'saved'
  returning * into v_turn;
  if not found then
    select * into v_turn from coach_turns where id = p_turn and user_id = p_user;
    if not found then
      raise exception 'turn_not_found' using errcode = 'P0002';
    end if;
  end if;
  return public.coach_turn_json(v_turn);
end;
$$;

-- Read one of the caller's turns (the function uses it for status checks).
create or replace function public.coach_get_turn(p_user uuid, p_turn uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.coach_turn_json(t) from public.coach_turns t
  where t.id = p_turn and t.user_id = p_user;
$$;

revoke execute on function public.coach_begin_turn(uuid, uuid, uuid, text, int) from public, anon, authenticated;
revoke execute on function public.coach_claim_provider_call(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.coach_complete_turn(uuid, uuid, text, text, boolean, int) from public, anon, authenticated;
revoke execute on function public.coach_settle_turn(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.coach_get_turn(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.coach_turn_json(public.coach_turns) from public, anon, authenticated;
grant execute on function public.coach_begin_turn(uuid, uuid, uuid, text, int) to service_role;
grant execute on function public.coach_claim_provider_call(uuid, uuid, boolean) to service_role;
grant execute on function public.coach_complete_turn(uuid, uuid, text, text, boolean, int) to service_role;
grant execute on function public.coach_settle_turn(uuid, uuid, text, text) to service_role;
grant execute on function public.coach_get_turn(uuid, uuid) to service_role;
grant execute on function public.coach_turn_json(public.coach_turns) to service_role;

notify pgrst, 'reload schema';
