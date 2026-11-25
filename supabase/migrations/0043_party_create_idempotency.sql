-- A retry of a keyed party creation gets the same party before the daily cap is checked.
alter table public.party_quests add column create_request_id uuid;

create unique index party_quests_create_request_idx
  on public.party_quests (creator_id, create_request_id)
  where create_request_id is not null;

-- Replace the old signature so PostgREST sees one RPC. Existing clients can
-- keep omitting the new argument, and existing parties keep a null key.
drop function public.create_party_quest(text, text, text, int);

create function public.create_party_quest(
  p_pillar text,
  p_description text,
  p_difficulty text default 'medium',
  p_max_participants int default 4,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_xp int;
  v_existing party_quests%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_pillar is null
     or p_pillar not in ('health','family','work','fun','spirituality') then
    raise exception 'invalid_pillar';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 3 and 140 then
    raise exception 'invalid_description';
  end if;
  v_xp := case p_difficulty when 'easy' then 10 when 'medium' then 20
                            when 'hard' then 50 end;
  if v_xp is null then
    raise exception 'invalid_difficulty';
  end if;
  if p_max_participants is null or p_max_participants not between 2 and 8 then
    raise exception 'invalid_max_participants';
  end if;

  -- Serialize the replay check, daily limit, and insert for each creator.
  perform pg_advisory_xact_lock(hashtextextended('party_create:' || v_me::text, 0));
  if p_request_id is not null then
    select * into v_existing from party_quests
      where creator_id = v_me and create_request_id = p_request_id;
    if found then
      if (v_existing.pillar, v_existing.description, v_existing.difficulty, v_existing.max_participants)
         is distinct from (p_pillar, btrim(p_description), p_difficulty, p_max_participants) then
        raise exception 'party_request_mismatch';
      end if;
      return public.party_state(v_existing.id);
    end if;
  end if;

  if (select count(*) from party_quests
      where creator_id = v_me and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'party_limit_reached'
      using hint = 'At most 5 party quests per day.';
  end if;

  insert into party_quests (creator_id, pillar, description, difficulty, xp_reward,
                            max_participants, create_request_id)
  values (v_me, p_pillar, btrim(p_description), p_difficulty, v_xp, p_max_participants,
          p_request_id)
  returning id into v_id;

  insert into party_members (party_id, user_id) values (v_id, v_me);

  return public.party_state(v_id);
end;
$$;

revoke execute on function public.create_party_quest(text, text, text, int, uuid) from public, anon;
grant execute on function public.create_party_quest(text, text, text, int, uuid) to authenticated;
notify pgrst, 'reload schema';
