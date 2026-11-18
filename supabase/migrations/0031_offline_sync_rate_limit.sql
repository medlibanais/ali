-- Offline sync RPCs share complete_quest's rate limit (migration 0030).
--
-- 0022 added sync_quest_completion and sync_quest_undo. 0030 then put a
-- rate limit on complete_quest (10 calls per 5 s, 'complete_quest'
-- bucket). Without this migration the sync RPCs would be a way around it.
--
-- The 0022 bodies are kept as private *_core functions and the public
-- names become thin wrappers: lock the user's gamification row (same
-- order as complete_quest, so the count is exact), count the call in the
-- shared bucket, then run the core. If the core raises, the whole call
-- rolls back and is not counted, as with complete_quest.
-- The app paces its flush at 600 ms and retries 'rate_limited' later.

alter function public.sync_quest_completion(uuid, uuid, timestamptz)
  rename to sync_quest_completion_core;
alter function public.sync_quest_undo(uuid, timestamptz)
  rename to sync_quest_undo_core;

revoke execute on function public.sync_quest_completion_core(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.sync_quest_undo_core(uuid, timestamptz)
  from public, anon, authenticated;

create or replace function public.sync_rate_limit_hit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  perform 1 from gamification where user_id = v_user for update;
  perform public.hit_rate_limit(
    v_user, 'complete_quest',
    public.complete_quest_rate_max(), public.complete_quest_rate_window());
end;
$$;

revoke execute on function public.sync_rate_limit_hit() from public, anon, authenticated;

create or replace function public.sync_quest_completion(
  p_quest_id uuid,
  p_client_id uuid,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_rate_limit_hit();
  return public.sync_quest_completion_core(p_quest_id, p_client_id, p_completed_at);
end;
$$;

create or replace function public.sync_quest_undo(
  p_quest_id uuid,
  p_undone_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_rate_limit_hit();
  return public.sync_quest_undo_core(p_quest_id, p_undone_at);
end;
$$;

revoke execute on function public.sync_quest_completion(uuid, uuid, timestamptz)
  from public, anon;
grant execute on function public.sync_quest_completion(uuid, uuid, timestamptz)
  to authenticated;
revoke execute on function public.sync_quest_undo(uuid, timestamptz) from public, anon;
grant execute on function public.sync_quest_undo(uuid, timestamptz) to authenticated;
