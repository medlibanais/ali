-- PrayerLock 0045: atomic quotas for paid AI calls.
--
-- Before this migration each Edge Function counted rows and then called the
-- provider. Two requests sent at the same moment both saw the old count, so
-- the daily limits (Coach 20 messages per local day, AI image 5 per rolling
-- 24 h, selfie read 10 per rolling 24 h) could be passed with parallel taps
-- or a script.
--
-- Now every quota is reserved inside Postgres, under a per-account advisory
-- lock, before any paid provider call. The account id always comes from the
-- verified JWT in the Edge Function; these RPCs are callable by the service
-- role only. Limits and reset times are unchanged.
--
-- When does a failed attempt count?
--   Coach      The user's message is saved by the reservation itself, so it
--              counts as soon as it is accepted (as before). A provider
--              failure still answers with the fallback reply and counts.
--              A request rejected before the reservation (empty, too long,
--              not configured, bad conversation) never counts.
--   AI image   Counts once reserved, EXCEPT when the provider never did any
--              work for us: our key is wrong (401/403), the provider is
--              rate limited (429) or down (5xx), or the network failed
--              before a response. Those attempts are released (counted =
--              false). Content rejections, timeouts (the provider may have
--              billed) and failures after an image came back still count.
--   Selfie     Every queued job counts (unchanged); the trigger is now
--              serialized so parallel inserts cannot pass the limit.
--   AI quests  On-demand generation is claimed per account and date, so
--              parallel requests make one provider call. At most 6
--              on-demand claims per hour per account.
--   Insights   On-demand pattern insights: 6 model calls per hour; the
--              weekly report on demand: 3 per hour. Over the budget the
--              functions answer from rules/cache instead of the model.

----------------------------------------------------------------------
-- Coach: count + save the user's message in one locked step
----------------------------------------------------------------------
create or replace function public.coach_reserve_message(
  p_user uuid,
  p_conversation uuid,
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
  v_row public.messages%rowtype;
begin
  if p_user is null or p_conversation is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_content is null or length(btrim(p_content)) = 0 then
    raise exception 'empty_message' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('coach_quota:' || p_user::text, 0));

  if not exists (
    select 1 from conversations where id = p_conversation and user_id = p_user
  ) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

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

  if v_sent >= p_limit then
    return jsonb_build_object(
      'ok', false,
      'sent_today', v_sent,
      'remaining_today', 0,
      'resets_at', v_end
    );
  end if;

  insert into messages (conversation_id, role, content)
  values (p_conversation, 'user', p_content)
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'sent_today', v_sent + 1,
    'remaining_today', greatest(0, p_limit - v_sent - 1),
    'resets_at', v_end,
    'message', jsonb_build_object(
      'id', v_row.id,
      'content', v_row.content,
      'created_at', v_row.created_at
    )
  );
end;
$$;

revoke execute on function public.coach_reserve_message(uuid, uuid, text, int)
  from public, anon, authenticated;
grant execute on function public.coach_reserve_message(uuid, uuid, text, int)
  to service_role;

----------------------------------------------------------------------
-- AI image: reserve a slot, release it when the provider did no work
----------------------------------------------------------------------
alter table public.avatar_generations
  add column if not exists counted boolean not null default true;

create or replace function public.reserve_avatar_generation(
  p_user uuid,
  p_limit int default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
  v_id bigint;
  v_oldest timestamptz;
begin
  if p_user is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('avatar_quota:' || p_user::text, 0));

  select count(*), min(created_at) into v_used, v_oldest
  from avatar_generations
  where user_id = p_user
    and counted
    and created_at >= now() - interval '24 hours';

  if v_used >= p_limit then
    return jsonb_build_object(
      'ok', false,
      'used', v_used,
      'remaining_today', 0,
      -- Rolling window: a slot frees up when the oldest counted one expires.
      'resets_at', v_oldest + interval '24 hours'
    );
  end if;

  insert into avatar_generations (user_id, ok, error, counted)
  values (p_user, false, 'pending', true)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'used', v_used + 1,
    'remaining_today', greatest(0, p_limit - v_used - 1)
  );
end;
$$;

revoke execute on function public.reserve_avatar_generation(uuid, int)
  from public, anon, authenticated;
grant execute on function public.reserve_avatar_generation(uuid, int)
  to service_role;

----------------------------------------------------------------------
-- Selfie jobs: same limits, now serialized per account
----------------------------------------------------------------------
create or replace function public.avatar_generation_jobs_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
  active int;
begin
  perform pg_advisory_xact_lock(hashtextextended('selfie_quota:' || new.user_id::text, 0));

  select count(*) into recent
  from public.avatar_generation_jobs
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';
  if recent >= 10 then
    raise exception 'daily_limit' using errcode = 'P0001',
      hint = 'You can make 10 avatars from a photo per day.';
  end if;

  select count(*) into active
  from public.avatar_generation_jobs
  where user_id = new.user_id
    and status in ('pending', 'processing')
    and created_at > now() - interval '2 minutes';
  if active > 0 then
    raise exception 'job_in_progress' using errcode = 'P0001',
      hint = 'An avatar is already being made from your photo.';
  end if;
  return new;
end;
$$;

----------------------------------------------------------------------
-- AI quests: one generation at a time per account and date
----------------------------------------------------------------------
alter table public.quest_generation_log
  drop constraint if exists quest_generation_log_status_check;
alter table public.quest_generation_log
  add constraint quest_generation_log_status_check
  check (status in ('ok', 'fallback', 'failed', 'running'));

-- Returns 'claimed' (go ahead), 'done' (already generated) or 'busy'
-- (another call is generating right now). Raises rate_limited when an
-- on-demand caller asks too often.
create or replace function public.claim_quest_generation(
  p_user uuid,
  p_date date,
  p_on_demand boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row quest_generation_log%rowtype;
begin
  if p_user is null or p_date is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('quest_gen:' || p_user::text || ':' || p_date::text, 0));

  select * into v_row
  from quest_generation_log
  where user_id = p_user and target_date = p_date;

  if found and v_row.status = 'ok' and v_row.generated_count > 0 then
    return 'done';
  end if;
  if found and v_row.status = 'running'
     and v_row.created_at > now() - interval '2 minutes' then
    return 'busy';
  end if;

  if p_on_demand then
    perform public.hit_rate_limit(p_user, 'generate_quests', 6, interval '1 hour');
  end if;

  insert into quest_generation_log (user_id, target_date, status, generated_count, created_at)
  values (p_user, p_date, 'running', 0, now())
  on conflict (user_id, target_date) do update
    set status = 'running', generated_count = 0, error = null, created_at = now();
  return 'claimed';
end;
$$;

revoke execute on function public.claim_quest_generation(uuid, date, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_quest_generation(uuid, date, boolean)
  to service_role;

----------------------------------------------------------------------
-- Other on-demand model calls (Insights): a locked per-account budget
----------------------------------------------------------------------
-- Raises rate_limited when p_max calls were already reserved in p_window.
-- Same rate_limits table and semantics as hit_rate_limit, serialized.
create or replace function public.reserve_ai_call(
  p_user uuid,
  p_action text,
  p_max int,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_action is null or p_action !~ '^ai_[a-z_]{1,40}$' then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_user::text, 0));
  perform public.hit_rate_limit(p_user, p_action, p_max, p_window);
end;
$$;

revoke execute on function public.reserve_ai_call(uuid, text, int, interval)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, int, interval)
  to service_role;

notify pgrst, 'reload schema';
