-- PrayerLock 0026: adaptive quest difficulty.
--
-- calculate_user_difficulty(user_id) looks at the user's last 14 full days
-- of assigned quests (in their own timezone, today excluded because it is
-- still in progress) and how many of them carry a live completion
-- (undone completions do not count). From the completion rate per
-- difficulty it moves a stored level:
--   * more than 80% of Hard quests completed  -> one level up
--   * fewer than 40% of Medium quests completed -> one level down
-- A rule only fires when at least 3 quests of that difficulty were
-- assigned, so one lucky quest cannot move the level. The level moves at
-- most one step per local day (the result is cached for the day), so
-- calling it repeatedly never ratchets.
--
-- Levels: 1 Beginner, 2 Intermediate, 3 Advanced, 4 Expert.
-- No history (new user) -> Beginner, the column default.
--
-- generate-quests (service role) calls it before asking Groq for quests.
-- A signed-in user may call it for themselves only.

create table if not exists public.user_difficulty (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  level smallint not null default 1 check (level between 1 and 4),
  evaluated_on date,
  easy_assigned int not null default 0,
  easy_completed int not null default 0,
  medium_assigned int not null default 0,
  medium_completed int not null default 0,
  hard_assigned int not null default 0,
  hard_completed int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_difficulty enable row level security;

-- Read your own row; nobody writes it directly (only the definer function).
drop policy if exists user_difficulty_read_own on public.user_difficulty;
create policy user_difficulty_read_own on public.user_difficulty
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.user_difficulty from anon, authenticated;

create or replace function public.difficulty_label(p_level int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_level
    when 1 then 'Beginner'
    when 2 then 'Intermediate'
    when 3 then 'Advanced'
    when 4 then 'Expert'
  end
$$;

create or replace function public.calculate_user_difficulty(p_user_id uuid)
returns table (
  level smallint,
  label text,
  previous_level smallint,
  evaluated_on date,
  easy_rate numeric,
  medium_rate numeric,
  hard_rate numeric,
  easy_assigned int,
  medium_assigned int,
  hard_assigned int,
  has_history boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_window_days constant int := 14;
  c_min_sample constant int := 3;
  c_up_hard_rate constant numeric := 0.80;
  c_down_medium_rate constant numeric := 0.40;

  v_caller uuid := auth.uid();
  v_tz text;
  v_today date;
  v_row public.user_difficulty%rowtype;
  v_prev smallint;
  v_new smallint;
  e_a int; e_c int; m_a int; m_c int; h_a int; h_c int;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22004';
  end if;
  -- Signed-in callers may only ask about themselves. The service role and
  -- database owner have no auth.uid() and may ask about anyone.
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select p.timezone into v_tz from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  -- Same answer as public.user_today(), without safe_tz's scan of
  -- pg_timezone_names (~30 ms per call): a bad or empty zone means UTC.
  begin
    v_today := (now() at time zone coalesce(nullif(v_tz, ''), 'UTC'))::date;
  exception when invalid_parameter_value then
    v_today := (now() at time zone 'UTC')::date;
  end;

  -- One row per user, locked so concurrent calls serialize instead of
  -- both stepping the level.
  insert into public.user_difficulty (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  select * into v_row from public.user_difficulty d
    where d.user_id = p_user_id
    for update;

  v_prev := v_row.level;

  if v_row.evaluated_on is distinct from v_today then
    -- One range scan on quests_user_date_idx (~15 rows a day), each
    -- probing the partial unique index quest_completions_live_uidx, which
    -- holds at most one live completion per quest, so the join cannot
    -- multiply rows.
    select
      count(*) filter (where qq.difficulty = 'easy'),
      count(c.quest_id) filter (where qq.difficulty = 'easy'),
      count(*) filter (where qq.difficulty = 'medium'),
      count(c.quest_id) filter (where qq.difficulty = 'medium'),
      count(*) filter (where qq.difficulty = 'hard'),
      count(c.quest_id) filter (where qq.difficulty = 'hard')
    into e_a, e_c, m_a, m_c, h_a, h_c
    from public.quests qq
    left join public.quest_completions c
      on c.quest_id = qq.id and c.undone_at is null
    where qq.user_id = p_user_id
      and qq.assigned_date >= v_today - c_window_days
      and qq.assigned_date < v_today;

    v_new := v_row.level;
    if h_a >= c_min_sample and h_c::numeric / h_a > c_up_hard_rate then
      v_new := v_new + 1;
    end if;
    if m_a >= c_min_sample and m_c::numeric / m_a < c_down_medium_rate then
      v_new := v_new - 1;
    end if;
    v_new := least(4, greatest(1, v_new));

    update public.user_difficulty d set
      level = v_new,
      evaluated_on = v_today,
      easy_assigned = e_a, easy_completed = e_c,
      medium_assigned = m_a, medium_completed = m_c,
      hard_assigned = h_a, hard_completed = h_c,
      updated_at = now()
    where d.user_id = p_user_id
    returning * into v_row;
  end if;

  return query select
    v_row.level,
    public.difficulty_label(v_row.level),
    v_prev,
    v_row.evaluated_on,
    case when v_row.easy_assigned > 0
      then round(v_row.easy_completed::numeric / v_row.easy_assigned, 4) end,
    case when v_row.medium_assigned > 0
      then round(v_row.medium_completed::numeric / v_row.medium_assigned, 4) end,
    case when v_row.hard_assigned > 0
      then round(v_row.hard_completed::numeric / v_row.hard_assigned, 4) end,
    v_row.easy_assigned,
    v_row.medium_assigned,
    v_row.hard_assigned,
    (v_row.easy_assigned + v_row.medium_assigned + v_row.hard_assigned) > 0;
end;
$$;

revoke execute on function public.calculate_user_difficulty(uuid) from public, anon;
grant execute on function public.calculate_user_difficulty(uuid) to authenticated, service_role;

-- Audit: which level each generation ran at.
alter table public.quest_generation_log
  add column if not exists difficulty_level smallint;
