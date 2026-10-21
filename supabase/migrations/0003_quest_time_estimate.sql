-- PrayerLock 0003: carry time_estimate_minutes onto assigned quests.
alter table public.quests
  add column if not exists time_estimate_minutes int;

-- keep the assignment function in sync (copy the estimate from the pool)
create or replace function public.assign_daily_quests(p_date date default null)
returns setof public.quests
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_date date := coalesce(p_date, public.user_today(auth.uid()));
  v_count int;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select count(*) into v_count
  from quests q where q.user_id = v_user and q.assigned_date = v_date;

  if v_count > 0 then
    return query select * from quests
      where user_id = v_user and assigned_date = v_date
      order by pillar, priority, title;
    return;
  end if;

  insert into quests (
    user_id, predefined_id, pillar, title, description, difficulty,
    xp_reward, is_ai_generated, why_this_matters, assigned_date, priority,
    time_estimate_minutes
  )
  select
    v_user, ranked.id, ranked.pillar, ranked.title, ranked.description,
    ranked.difficulty, ranked.xp_reward, false, ranked.why_this_matters,
    v_date, ranked.rn, ranked.time_estimate_minutes
  from (
    select p.*,
      row_number() over (partition by p.pillar order by
        (case when p.tags && g.match_tags then 0 else 1 end),
        (case when p.tags && g.avoid_tags then 1 else 0 end),
        random()) as rn
    from predefined_quests p
    cross join lateral (
      select
        case
          when lower(coalesce(ug.religion, '')) like '%muslim%'
            then array['muslim','prayer','quran','dhikr','call','parents','deep_work','skill','hydration','workout']
          else array['call','parents','deep_work','skill','hydration','workout','gratitude','meditation']
        end as match_tags,
        case
          when lower(coalesce(ug.religion, '')) like '%muslim%' then array[]::text[]
          else array['muslim']
        end as avoid_tags
      from user_goals ug where ug.user_id = v_user
    ) g
    where not exists (
      select 1 from quests y
      where y.user_id = v_user
        and y.assigned_date = v_date - 1
        and y.title = p.title
    )
  ) ranked
  where ranked.rn <= 3
  on conflict (user_id, title, assigned_date) do nothing;

  return query select * from quests
    where user_id = v_user and assigned_date = v_date
    order by pillar, priority, title;
end;
$$;
