-- PrayerLock 0002: quest engine RPCs (server-side XP, streaks, skips, scores)
-- The client never computes XP. All functions run as the calling user
-- (security invoker) and rely on RLS; ownership is double-checked inside.

----------------------------------------------------------------------
-- helper: user's local "today" from their profile timezone
----------------------------------------------------------------------
create or replace function public.user_today(p_user uuid)
returns date language sql stable security definer
set search_path = public as $$
  select (now() at time zone coalesce(
    (select timezone from profiles where id = p_user), 'UTC'))::date
$$;

----------------------------------------------------------------------
-- assign_daily_quests(p_date): pick 2-3 per pillar from the pool,
-- personalized by goal tags, never repeating yesterday's titles.
-- Returns the day's quests (existing ones if already assigned).
----------------------------------------------------------------------
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
    xp_reward, is_ai_generated, why_this_matters, assigned_date, priority
  )
  select
    v_user, ranked.id, ranked.pillar, ranked.title, ranked.description,
    ranked.difficulty, ranked.xp_reward, false, ranked.why_this_matters,
    v_date, ranked.rn
  from (
    select p.*,
      row_number() over (partition by p.pillar order by
        -- goal-tag matches first, then variety
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
      -- no same title two days in a row
      select 1 from quests y
      where y.user_id = v_user
        and y.assigned_date = v_date - 1
        and y.title = p.title
    )
  ) ranked
  -- 3 from the weakest pillars feel pushy; 2-3 per pillar, ~13 total
  where ranked.rn <= 3
  on conflict (user_id, title, assigned_date) do nothing;

  return query select * from quests
    where user_id = v_user and assigned_date = v_date
    order by pillar, priority, title;
end;
$$;

----------------------------------------------------------------------
-- complete_quest: validate, compute XP server-side, update everything.
-- Returns jsonb: xp_awarded, total_xp, level, level_up, daily_score, streak
----------------------------------------------------------------------
create or replace function public.complete_quest(p_quest_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quest quests%rowtype;
  v_today date;
  v_hour int;
  v_base int;
  v_time_bonus int := 0;
  v_streak_bonus int := 0;
  v_xp int;
  v_cap int := 500;
  v_xp_today int;
  v_xp_today_date date;
  v_awarded int;
  v_gam gamification%rowtype;
  v_old_level int;
  v_new_total int;
  v_new_level int;
  v_level_up boolean;
  v_last_active date;
  v_cur_streak int;
  v_best_streak int;
  v_score int;
  v_new_badges text[] := '{}';
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_quest from quests where id = p_quest_id;
  if not found then
    raise exception 'quest_not_found';
  end if;
  if v_quest.user_id <> v_user then
    raise exception 'not_your_quest';
  end if;
  if v_quest.skipped then
    raise exception 'quest_skipped';
  end if;

  -- idempotent: already live-completed -> return current state
  if exists (select 1 from quest_completions
             where quest_id = p_quest_id and undone_at is null) then
    return public.quest_state(p_quest_id);
  end if;

  v_today := public.user_today(v_user);
  v_hour := extract(hour from now());
  v_base := v_quest.xp_reward;
  if v_hour < 18 then
    v_time_bonus := 5;
  end if;

  select * into v_gam from gamification where user_id = v_user for update;
  v_cur_streak := coalesce(v_gam.current_streak, 0);
  v_streak_bonus := least(10 * v_cur_streak, 100);
  v_xp := v_base + v_time_bonus + v_streak_bonus;

  -- daily XP cap with per-day reset
  v_xp_today := case when v_gam.xp_today_date = v_today then v_gam.xp_today else 0 end;
  v_awarded := greatest(0, least(v_xp, v_cap - v_xp_today));

  insert into quest_completions (user_id, quest_id, xp_awarded)
  values (v_user, p_quest_id, v_awarded);

  -- streak: consecutive-day logic on the user's timezone
  v_last_active := v_gam.last_active_date;
  if v_last_active = v_today then
    v_cur_streak := greatest(v_cur_streak, 1);
  elsif v_last_active = v_today - 1 then
    v_cur_streak := v_cur_streak + 1;
  else
    v_cur_streak := 1;
  end if;
  v_best_streak := greatest(coalesce(v_gam.best_streak, 0), v_cur_streak);

  v_old_level := coalesce(v_gam.level, 1);
  v_new_total := coalesce(v_gam.total_xp, 0) + v_awarded;
  v_new_level := public.level_for_xp(v_new_total);
  v_level_up := v_new_level > v_old_level;

  update gamification set
    total_xp = v_new_total,
    xp_today = v_xp_today + v_awarded,
    xp_today_date = v_today,
    level = v_new_level,
    current_streak = v_cur_streak,
    best_streak = v_best_streak,
    last_active_date = v_today
  where user_id = v_user;

  perform public.recompute_daily_score(v_user, v_quest.assigned_date);

  -- badge evaluation may add badge XP + level-ups; read the FINAL state
  v_new_badges := public.evaluate_badges(v_user);

  select g.total_xp, g.level into v_new_total, v_new_level
  from gamification g where g.user_id = v_user;
  v_level_up := v_new_level > v_old_level;

  select overall into v_score from daily_scores
    where user_id = v_user and score_date = v_quest.assigned_date;

  return jsonb_build_object(
    'quest_id', p_quest_id,
    'xp_awarded', v_awarded,
    'total_xp', v_new_total,
    'level', v_new_level,
    'level_up', v_level_up,
    'daily_score', coalesce(v_score, 0),
    'current_streak', v_cur_streak,
    'best_streak', v_best_streak,
    'new_badges', to_jsonb(v_new_badges)
  );
end;
$$;

----------------------------------------------------------------------
-- current state of one quest (used by idempotent re-completion)
----------------------------------------------------------------------
create or replace function public.quest_state(p_quest_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quest quests%rowtype;
  v_xp int;
  v_gam gamification%rowtype;
  v_score int;
begin
  select * into v_quest from quests where id = p_quest_id;
  select xp_awarded into v_xp from quest_completions
    where quest_id = p_quest_id and undone_at is null;
  select * into v_gam from gamification where user_id = v_user;
  select overall into v_score from daily_scores
    where user_id = v_user and score_date = v_quest.assigned_date;
  return jsonb_build_object(
    'quest_id', p_quest_id,
    'xp_awarded', coalesce(v_xp, 0),
    'total_xp', coalesce(v_gam.total_xp, 0),
    'level', coalesce(v_gam.level, 1),
    'level_up', false,
    'daily_score', coalesce(v_score, 0),
    'current_streak', coalesce(v_gam.current_streak, 0),
    'best_streak', coalesce(v_gam.best_streak, 0),
    'new_badges', '[]'::jsonb
  );
end;
$$;

----------------------------------------------------------------------
-- undo_quest_completion: UI offers 10 s; server tolerates 60 s for latency.
----------------------------------------------------------------------
create or replace function public.undo_quest_completion(p_quest_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_comp quest_completions%rowtype;
  v_today date;
  v_xp_today int;
  v_new_total int;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_comp from quest_completions
    where quest_id = p_quest_id and undone_at is null;
  if not found then
    raise exception 'not_completed';
  end if;
  if v_comp.user_id <> v_user then
    raise exception 'not_your_quest';
  end if;
  if v_comp.completed_at < now() - interval '60 seconds' then
    raise exception 'undo_window_expired';
  end if;

  update quest_completions set undone_at = now() where id = v_comp.id;

  v_today := public.user_today(v_user);
  update gamification g set
    total_xp = greatest(0, g.total_xp - v_comp.xp_awarded),
    xp_today = greatest(0,
      case when g.xp_today_date = v_today then g.xp_today else 0 end
      - v_comp.xp_awarded),
    level = public.level_for_xp(greatest(0, g.total_xp - v_comp.xp_awarded))
  where g.user_id = v_user
  returning total_xp into v_new_total;

  perform public.recompute_daily_score(v_user,
    (select assigned_date from quests where id = p_quest_id));

  return jsonb_build_object(
    'quest_id', p_quest_id,
    'xp_refunded', v_comp.xp_awarded,
    'total_xp', v_new_total
  );
end;
$$;

----------------------------------------------------------------------
-- skip_quest: max 3 per day
----------------------------------------------------------------------
create or replace function public.skip_quest(p_quest_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quest quests%rowtype;
  v_skips int;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_quest from quests where id = p_quest_id;
  if not found then
    raise exception 'quest_not_found';
  end if;
  if v_quest.user_id <> v_user then
    raise exception 'not_your_quest';
  end if;
  if v_quest.skipped then
    return jsonb_build_object('quest_id', p_quest_id, 'skipped', true,
      'skips_used', (select count(*) from quests
        where user_id = v_user and assigned_date = v_quest.assigned_date and skipped));
  end if;
  if exists (select 1 from quest_completions
             where quest_id = p_quest_id and undone_at is null) then
    raise exception 'already_completed';
  end if;

  select count(*) into v_skips from quests
    where user_id = v_user and assigned_date = v_quest.assigned_date and skipped;
  if v_skips >= 3 then
    raise exception 'skip_limit_reached';
  end if;

  update quests set skipped = true, skipped_at = now() where id = p_quest_id;
  perform public.recompute_daily_score(v_user, v_quest.assigned_date);

  return jsonb_build_object(
    'quest_id', p_quest_id, 'skipped', true, 'skips_used', v_skips + 1
  );
end;
$$;

----------------------------------------------------------------------
-- recompute_daily_score: pillar percentages + overall for one date.
-- Completed quests count; skipped quests leave the denominator.
----------------------------------------------------------------------
create or replace function public.recompute_daily_score(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_overall int;
  v_assigned int;
  v_completed int;
  v_skipped int;
  v_xp int;
  v_scores jsonb := '{}';
begin
  for p in
    select q.pillar,
           count(*) as total,
           count(c.id) as done
    from quests q
    left join quest_completions c
      on c.quest_id = q.id and c.undone_at is null
    where q.user_id = p_user and q.assigned_date = p_date
    group by q.pillar
  loop
    v_scores := v_scores || jsonb_build_object(
      p.pillar, case when p.total = 0 then 0
                     else round(100.0 * p.done / p.total) end);
  end loop;

  select count(*),
         count(c.id),
         count(*) filter (where q.skipped),
         coalesce(sum(c.xp_awarded), 0)
    into v_assigned, v_completed, v_skipped, v_xp
  from quests q
  left join quest_completions c
    on c.quest_id = q.id and c.undone_at is null
  where q.user_id = p_user and q.assigned_date = p_date;

  v_overall := case when v_assigned = 0 then 0
                    else round(100.0 * v_completed / v_assigned) end;

  insert into daily_scores (
    user_id, score_date, overall, health, family, work, fun, spirituality,
    assigned_count, completed_count, skipped_count, xp_earned
  ) values (
    p_user, p_date, v_overall,
    coalesce((v_scores->>'health')::int, 0),
    coalesce((v_scores->>'family')::int, 0),
    coalesce((v_scores->>'work')::int, 0),
    coalesce((v_scores->>'fun')::int, 0),
    coalesce((v_scores->>'spirituality')::int, 0),
    v_assigned, v_completed, v_skipped, v_xp
  )
  on conflict (user_id, score_date) do update set
    overall = excluded.overall,
    health = excluded.health,
    family = excluded.family,
    work = excluded.work,
    fun = excluded.fun,
    spirituality = excluded.spirituality,
    assigned_count = excluded.assigned_count,
    completed_count = excluded.completed_count,
    skipped_count = excluded.skipped_count,
    xp_earned = excluded.xp_earned;
end;
$$;

----------------------------------------------------------------------
-- evaluate_badges: checks unlock conditions, inserts new achievements.
-- Returns array of newly unlocked badge_ids. Extended in later phases.
----------------------------------------------------------------------
create or replace function public.evaluate_badges(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text[] := '{}';
  v_total_completions int;
  v_streak int;
  v_best int;
  v_level int;
  v_perfect boolean;
  v_social int;
  v_xp int;
  badge record;
begin
  select count(*) into v_total_completions
    from quest_completions where user_id = p_user and undone_at is null;

  select g.current_streak, g.best_streak, g.level, g.total_xp
    into v_streak, v_best, v_level, v_xp
  from gamification g where g.user_id = p_user;

  select exists (
    select 1 from daily_scores
    where user_id = p_user and overall = 100 and assigned_count >= 3
  ) into v_perfect;

  select count(*) into v_social from friendships
    where status = 'accepted'
      and (requester = p_user or addressee = p_user);

  for badge in
    select b.badge_id, b.xp_reward from badge_catalog b
    where not exists (
      select 1 from achievements a
      where a.user_id = p_user and a.badge_id = b.badge_id
    )
    and (
      (b.badge_id = 'first_step' and v_total_completions >= 1)
      or (b.badge_id = 'social_spark' and v_social >= 1)
      or (b.badge_id = 'week_warrior' and greatest(v_streak, v_best) >= 7)
      or (b.badge_id = 'ten_day_streak' and greatest(v_streak, v_best) >= 10)
      or (b.badge_id = 'month_master' and greatest(v_streak, v_best) >= 30)
      or (b.badge_id = 'perfect_day' and v_perfect)
      or (b.badge_id = 'iron_mind' and v_level >= 50)
      or (b.badge_id = 'legend' and v_level >= 100)
    )
  loop
    insert into achievements (user_id, badge_id) values (p_user, badge.badge_id);
    v_new := v_new || badge.badge_id;
    -- badge XP reward counts toward level, bypassing the daily cap
    if badge.xp_reward > 0 then
      update gamification g set
        total_xp = g.total_xp + badge.xp_reward,
        level = public.level_for_xp(g.total_xp + badge.xp_reward)
      where g.user_id = p_user;
    end if;
  end loop;

  return v_new;
end;
$$;
