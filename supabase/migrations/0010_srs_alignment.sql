-- PrayerLock 0010: align the quest engine and gamification with the SRS.
--
--  * FR-2.2  Daily Life Score = average of the pillar percentages; skipped
--            quests leave the denominator (no penalty, FR-3.3).
--  * FR-2.2  +5 XP time bonus uses the user's local 6 PM, not the server's.
--  * FR-2.2  streak bonus (+10/day of streak, max +100) is paid once per
--            day on the first completion, not on every quest.
--  * FR-3.2  undo window is 10 s in the app; the server allows 15 s for
--            network latency (was 60 s). Undo also rolls back a streak
--            increase when it removes the day's only completion.
--  * FR-3.3  a skipped quest comes back the next day.
--  * FR-2.3  days that already hold nightly AI quests still get their
--            predefined quests (previously the day stopped at ~5 quests).
--  * FR-4.2  every badge in the catalog can now actually be unlocked.
--  * FR-4.3  pillar titles + level titles with unlock dates and progress.
--  * FR-7.2  in-app notification center (also the push send log used to
--            enforce the 3-per-day cap in FR-5.2 / FR-7.1).

----------------------------------------------------------------------
-- quest_completions: remember the streak state before the day's first
-- completion so an undo can restore it.
----------------------------------------------------------------------
alter table public.quest_completions
  add column if not exists prev_current_streak int,
  add column if not exists prev_best_streak int,
  add column if not exists prev_last_active_date date;

----------------------------------------------------------------------
-- assign_daily_quests: 2-3 per pillar, yesterday's skipped quests first,
-- never yesterday's other titles, and fill around AI quests that the
-- nightly job may already have placed on the day.
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
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  -- Already assigned: predefined quests exist for the day.
  if exists (select 1 from quests q
             where q.user_id = v_user and q.assigned_date = v_date
               and not q.is_ai_generated) then
    return query select * from quests
      where user_id = v_user and assigned_date = v_date
      order by pillar, priority, title;
    return;
  end if;

  -- FR-3.3: skipped quests reappear the next day.
  insert into quests (
    user_id, predefined_id, pillar, title, description, difficulty,
    xp_reward, is_ai_generated, why_this_matters, assigned_date, priority,
    time_estimate_minutes
  )
  select
    v_user, y.predefined_id, y.pillar, y.title, y.description, y.difficulty,
    y.xp_reward, y.is_ai_generated, y.why_this_matters, v_date, 0,
    y.time_estimate_minutes
  from quests y
  where y.user_id = v_user
    and y.assigned_date = v_date - 1
    and y.skipped
  on conflict (user_id, title, assigned_date) do nothing;

  -- Predefined quests fill each pillar up to 3, around whatever is
  -- already on the day (carried-over skips, nightly AI quests).
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
    and not exists (
      select 1 from quests t
      where t.user_id = v_user
        and t.assigned_date = v_date
        and t.title = p.title
    )
  ) ranked
  where ranked.rn <= greatest(0, 3 - (
    select count(*) from quests e
    where e.user_id = v_user and e.assigned_date = v_date
      and e.pillar = ranked.pillar
  ))
  on conflict (user_id, title, assigned_date) do nothing;

  return query select * from quests
    where user_id = v_user and assigned_date = v_date
    order by pillar, priority, title;
end;
$$;

----------------------------------------------------------------------
-- complete_quest
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
  v_tz text;
  v_today date;
  v_hour int;
  v_base int;
  v_time_bonus int := 0;
  v_streak_bonus int := 0;
  v_first_today boolean;
  v_xp int;
  v_cap int := 500;
  v_xp_today int;
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

  select coalesce(timezone, 'UTC') into v_tz from profiles where id = v_user;
  v_today := public.user_today(v_user);
  v_hour := public.hour_in_tz(v_tz);
  v_base := v_quest.xp_reward;
  if v_hour < 18 then
    v_time_bonus := 5;
  end if;

  select * into v_gam from gamification where user_id = v_user for update;

  v_first_today := not exists (
    select 1 from quest_completions c
    join quests q on q.id = c.quest_id
    where c.user_id = v_user and c.undone_at is null
      and q.assigned_date = v_today
  );

  -- streak: consecutive-day logic on the user's timezone
  v_cur_streak := coalesce(v_gam.current_streak, 0);
  v_last_active := v_gam.last_active_date;
  if v_last_active = v_today then
    v_cur_streak := greatest(v_cur_streak, 1);
  elsif v_last_active = v_today - 1 then
    v_cur_streak := v_cur_streak + 1;
  else
    v_cur_streak := 1;
  end if;
  v_best_streak := greatest(coalesce(v_gam.best_streak, 0), v_cur_streak);

  -- streak bonus once per day, sized by the streak including today
  if v_first_today then
    v_streak_bonus := least(10 * v_cur_streak, 100);
  end if;
  v_xp := v_base + v_time_bonus + v_streak_bonus;

  -- daily XP cap with per-day reset
  v_xp_today := case when v_gam.xp_today_date = v_today then v_gam.xp_today else 0 end;
  v_awarded := greatest(0, least(v_xp, v_cap - v_xp_today));

  insert into quest_completions (
    user_id, quest_id, xp_awarded,
    prev_current_streak, prev_best_streak, prev_last_active_date
  ) values (
    v_user, p_quest_id, v_awarded,
    case when v_first_today then coalesce(v_gam.current_streak, 0) end,
    case when v_first_today then coalesce(v_gam.best_streak, 0) end,
    case when v_first_today then v_gam.last_active_date end
  );

  v_old_level := coalesce(v_gam.level, 1);
  v_new_total := coalesce(v_gam.total_xp, 0) + v_awarded;
  v_new_level := public.level_for_xp(v_new_total);

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
    'time_bonus', v_time_bonus,
    'streak_bonus', v_streak_bonus,
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
-- undo_quest_completion: 10 s in the UI, 15 s server tolerance.
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
  v_next uuid;
  v_new_total int;
  v_streak int;
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
  if v_comp.completed_at < now() - interval '15 seconds' then
    raise exception 'undo_window_expired';
  end if;

  perform 1 from gamification where user_id = v_user for update;
  update quest_completions set undone_at = now() where id = v_comp.id;

  v_today := public.user_today(v_user);
  update gamification g set
    total_xp = greatest(0, g.total_xp - v_comp.xp_awarded),
    xp_today = greatest(0,
      case when g.xp_today_date = v_today then g.xp_today else 0 end
      - v_comp.xp_awarded),
    level = public.level_for_xp(greatest(0, g.total_xp - v_comp.xp_awarded))
  where g.user_id = v_user
  returning total_xp, current_streak into v_new_total, v_streak;

  -- Streak rollback: this completion carried the pre-day snapshot.
  if v_comp.prev_current_streak is not null then
    select c.id into v_next
    from quest_completions c
    join quests q on q.id = c.quest_id
    where c.user_id = v_user and c.undone_at is null
      and q.assigned_date = v_today
    order by c.completed_at
    limit 1;

    if v_next is null then
      update gamification set
        current_streak = v_comp.prev_current_streak,
        best_streak = v_comp.prev_best_streak,
        last_active_date = v_comp.prev_last_active_date
      where user_id = v_user
      returning current_streak into v_streak;
    else
      -- another completion still holds the day: hand it the snapshot
      update quest_completions set
        prev_current_streak = v_comp.prev_current_streak,
        prev_best_streak = v_comp.prev_best_streak,
        prev_last_active_date = v_comp.prev_last_active_date
      where id = v_next;
    end if;
  end if;

  perform public.recompute_daily_score(v_user,
    (select assigned_date from quests where id = p_quest_id));

  return jsonb_build_object(
    'quest_id', p_quest_id,
    'xp_refunded', v_comp.xp_awarded,
    'total_xp', v_new_total,
    'current_streak', v_streak
  );
end;
$$;

----------------------------------------------------------------------
-- recompute_daily_score (FR-2.2)
--   pillar % = completed / non-skipped quests in the pillar
--   overall  = average of the pillars that have a non-skipped quest
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
  v_sum numeric := 0;
  v_pillars int := 0;
  v_assigned int;
  v_completed int;
  v_skipped int;
  v_xp int;
  v_scores jsonb := '{}';
begin
  for p in
    select q.pillar,
           count(*) filter (where not q.skipped) as total,
           count(c.id) as done
    from quests q
    left join quest_completions c
      on c.quest_id = q.id and c.undone_at is null
    where q.user_id = p_user and q.assigned_date = p_date
    group by q.pillar
  loop
    if p.total > 0 then
      v_scores := v_scores || jsonb_build_object(
        p.pillar, round(100.0 * p.done / p.total));
      v_sum := v_sum + 100.0 * p.done / p.total;
      v_pillars := v_pillars + 1;
    end if;
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

  v_overall := case when v_pillars = 0 then 0
                    else round(v_sum / v_pillars) end;

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
-- IN-APP NOTIFICATIONS (FR-7.2) + push send log (FR-7.1 cap)
----------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  pushed boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_type_idx
  on public.notifications (user_id, type, created_at desc);

alter table public.notifications enable row level security;
-- owner reads, marks read, clears; rows are written server-side only
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

alter publication supabase_realtime add table public.notifications;

-- per-type opt-outs for the coach nudges in FR-5.2
alter table public.notification_preferences
  add column if not exists low_pillar boolean not null default true,
  add column if not exists behavior_patterns boolean not null default true;

-- SRS caps push at 3/day; users may lower it, not raise it
update public.notification_preferences set max_per_day = 3 where max_per_day > 3;
alter table public.notification_preferences
  add constraint notification_preferences_max_per_day_range
  check (max_per_day between 0 and 3);

-- level-up message in the notification center (FR-4.1, FR-5.2)
create or replace function public.notify_level_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.level > coalesce(old.level, 1)
     and coalesce((select coach_messages from notification_preferences
                   where user_id = new.user_id), true) then
    insert into notifications (user_id, type, title, body, data)
    values (
      new.user_id, 'level_up',
      'Level ' || new.level,
      'Congratulations! We reached Level ' || new.level || '. I''m proud of us.',
      jsonb_build_object('level', new.level)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists gamification_level_up on public.gamification;
create trigger gamification_level_up
  after update of level on public.gamification
  for each row execute function public.notify_level_up();

----------------------------------------------------------------------
-- TITLES (FR-4.3)
----------------------------------------------------------------------
create table if not exists public.title_catalog (
  title_id text primary key,
  name text not null,
  kind text not null check (kind in ('level','pillar')),
  pillar text check (pillar in ('health','family','work','fun','spirituality') or pillar is null),
  description text not null,
  metric text not null,
  target int not null,
  sort int not null default 0
);

create table if not exists public.user_titles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id text not null references public.title_catalog (title_id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table public.title_catalog enable row level security;
alter table public.user_titles enable row level security;
create policy title_catalog_read on public.title_catalog
  for select to authenticated using (true);
create policy user_titles_read on public.user_titles
  for select to authenticated
  using (public.can_view_stats(auth.uid(), user_id));

insert into public.title_catalog (title_id, name, kind, pillar, description, metric, target, sort) values
  ('novice',             'Novice',             'level',  null,           'Levels 1-10.',                              'level',              1,     1),
  ('disciplined_human',  'Disciplined Human',  'level',  null,           'Reach level 11.',                           'level',              11,    2),
  ('iron_mind',          'Iron Mind',          'level',  null,           'Reach level 26.',                           'level',              26,    3),
  ('guardian_of_family', 'Guardian of Family', 'level',  null,           'Reach level 51.',                           'level',              51,    4),
  ('legendary',          'Legendary',          'level',  null,           'Reach level 76.',                           'level',              76,    5),
  ('fitness_warrior',    'Fitness Warrior',    'pillar', 'health',       'Complete 50 workouts in one month.',        'workouts_month',     50,    10),
  ('family_first',       'Family First',       'pillar', 'family',       'Call your parents every week for 8 weeks.', 'parent_call_weeks',  8,     11),
  ('deep_worker',        'Deep Worker',        'pillar', 'work',         'Bank 500 hours of deep work.',              'deep_work_minutes',  30000, 12),
  ('adventurer',         'Adventurer',         'pillar', 'fun',          'Complete 20 different fun activities.',     'fun_distinct',       20,    13),
  ('prayer_master',      'Prayer Master',      'pillar', 'spirituality', 'Complete 100 prayers.',                     'prayers_total',      100,   14)
on conflict (title_id) do update set
  name = excluded.name, kind = excluded.kind, pillar = excluded.pillar,
  description = excluded.description, metric = excluded.metric,
  target = excluded.target, sort = excluded.sort;

----------------------------------------------------------------------
-- progress_metrics: one place that measures everything badges and
-- titles depend on. Predefined quests carry tags; AI quests have none,
-- so their kind is inferred from the title.
----------------------------------------------------------------------
create or replace function public.quest_kind_tags(p_title text, p_tags text[])
returns text[]
language sql immutable
as $$
  select array(select distinct t from unnest(
    coalesce(p_tags, '{}')
    || case when p_title ~* '\m(pray|prayer|salah|salat|fajr|dhuhr|asr|maghrib|isha|jumuah|jummah)'
            then array['prayer'] else '{}' end
    || case when p_title ~* '\m(workout|run|running|jog|gym|strength|cardio|push-?ups?|squats?|swim|bike|cycling|yoga|hiit|sport|football|basketball|training)'
            then array['workout'] else '{}' end
    || case when p_title ~* '\m(mom|mother|dad|father|parents?)\M'
            then array['parents'] else '{}' end
    || case when p_title ~* '(deep work|focus block|focused hour)'
            then array['deep_work'] else '{}' end
  ) t)
$$;

create or replace function public.completed_quest_facts(p_user uuid)
returns table (
  completed_at timestamptz, assigned_date date, pillar text,
  title text, minutes int, tags text[]
)
language sql stable
security definer
set search_path = public
as $$
  select c.completed_at, q.assigned_date, q.pillar, q.title,
         coalesce(q.time_estimate_minutes, 0),
         public.quest_kind_tags(q.title, p.tags)
  from quest_completions c
  join quests q on q.id = c.quest_id
  left join predefined_quests p on p.id = q.predefined_id
  where c.user_id = p_user and c.undone_at is null
$$;

create or replace function public.progress_metrics(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_today date;
  v_month date;
  v_level int;
  v_streak int;
  v_completions int;
  v_prayers_month int;
  v_prayers_total int;
  v_workouts_month int;
  v_parent_weeks int;
  v_deep_minutes int;
  v_fun_distinct int;
  v_early_days int;
  v_perfect boolean;
  v_comeback boolean;
  v_friends int;
begin
  select coalesce(timezone, 'UTC') into v_tz from profiles where id = p_user;
  v_today := public.today_in_tz(v_tz);
  v_month := date_trunc('month', v_today)::date;

  select g.level, greatest(g.current_streak, g.best_streak)
    into v_level, v_streak
  from gamification g where g.user_id = p_user;


  select count(*) into v_completions from public.completed_quest_facts(p_user);
  select count(*) into v_prayers_total from public.completed_quest_facts(p_user) where 'prayer' = any(tags);
  select count(*) into v_prayers_month from public.completed_quest_facts(p_user)
    where 'prayer' = any(tags) and assigned_date >= v_month;
  select count(*) into v_workouts_month from public.completed_quest_facts(p_user)
    where 'workout' = any(tags) and assigned_date >= v_month;
  select coalesce(sum(minutes), 0) into v_deep_minutes from public.completed_quest_facts(p_user)
    where 'deep_work' = any(tags);
  select count(distinct lower(title)) into v_fun_distinct from public.completed_quest_facts(p_user)
    where pillar = 'fun';

  -- longest run of consecutive ISO weeks with a parents call
  select coalesce(max(n), 0) into v_parent_weeks from (
    select count(*) as n from (
      select w, w - (row_number() over (order by w) * 7)::int as grp
      from (select distinct date_trunc('week', assigned_date)::date as w
            from public.completed_quest_facts(p_user) where 'parents' = any(tags)) weeks
    ) runs group by grp
  ) s;

  -- longest run of consecutive local days with a completion before 8 AM
  select coalesce(max(n), 0) into v_early_days from (
    select count(*) as n from (
      select d, d - (row_number() over (order by d))::int as grp
      from (select distinct (completed_at at time zone v_tz)::date as d
            from public.completed_quest_facts(p_user)
            where extract(hour from completed_at at time zone v_tz) < 8) days
    ) runs group by grp
  ) s;

  select exists (
    select 1 from daily_scores
    where user_id = p_user and overall = 100 and assigned_count >= 3
  ) into v_perfect;

  -- 5+ quests the day after a day with quests but zero completions
  select exists (
    select 1 from daily_scores t
    join daily_scores y
      on y.user_id = t.user_id and y.score_date = t.score_date - 1
    where t.user_id = p_user and t.completed_count >= 5
      and y.assigned_count > 0 and y.completed_count = 0
  ) into v_comeback;

  select count(*) into v_friends from friendships
    where status = 'accepted' and (requester = p_user or addressee = p_user);

  return jsonb_build_object(
    'level', coalesce(v_level, 1),
    'best_streak', coalesce(v_streak, 0),
    'completions', v_completions,
    'prayers_month', v_prayers_month,
    'prayers_total', v_prayers_total,
    'workouts_month', v_workouts_month,
    'parent_call_weeks', v_parent_weeks,
    'deep_work_minutes', v_deep_minutes,
    'fun_distinct', v_fun_distinct,
    'early_days', v_early_days,
    'perfect_day', v_perfect,
    'comeback', v_comeback,
    'friends', v_friends
  );
end;
$$;

----------------------------------------------------------------------
-- evaluate_badges: all 15 catalog badges + titles. Returns new badge ids.
----------------------------------------------------------------------
create or replace function public.evaluate_badges(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb;
  v_new text[] := '{}';
  badge record;
  t record;
begin
  m := public.progress_metrics(p_user);

  for badge in
    select b.badge_id, b.name, b.xp_reward from badge_catalog b
    where not exists (
      select 1 from achievements a
      where a.user_id = p_user and a.badge_id = b.badge_id
    )
    and (
      (b.badge_id = 'first_step' and (m->>'completions')::int >= 1)
      or (b.badge_id = 'social_spark' and (m->>'friends')::int >= 1)
      or (b.badge_id = 'week_warrior' and (m->>'best_streak')::int >= 7)
      or (b.badge_id = 'ten_day_streak' and (m->>'best_streak')::int >= 10)
      or (b.badge_id = 'month_master' and (m->>'best_streak')::int >= 30)
      or (b.badge_id = 'perfect_day' and (m->>'perfect_day')::boolean)
      or (b.badge_id = 'early_riser' and (m->>'early_days')::int >= 7)
      or (b.badge_id = 'comeback' and (m->>'comeback')::boolean)
      or (b.badge_id = 'prayer_master' and (m->>'prayers_month')::int >= 30)
      or (b.badge_id = 'fitness_fanatic' and (m->>'workouts_month')::int >= 50)
      or (b.badge_id = 'family_first' and (m->>'parent_call_weeks')::int >= 8)
      or (b.badge_id = 'adventurer' and (m->>'fun_distinct')::int >= 20)
      or (b.badge_id = 'knowledge_seeker' and (m->>'deep_work_minutes')::int >= 6000)
      or (b.badge_id = 'iron_mind' and (m->>'level')::int >= 50)
      or (b.badge_id = 'legend' and (m->>'level')::int >= 100)
    )
  loop
    insert into achievements (user_id, badge_id) values (p_user, badge.badge_id)
      on conflict do nothing;
    v_new := v_new || badge.badge_id;
    insert into notifications (user_id, type, title, body, data)
    values (p_user, 'badge', 'Badge unlocked: ' || badge.name,
      case when badge.xp_reward > 0
           then '+' || badge.xp_reward || ' XP. We earned this one.'
           else 'We earned this one.' end,
      jsonb_build_object('badge_id', badge.badge_id));
    -- badge XP reward counts toward level, bypassing the daily cap
    if badge.xp_reward > 0 then
      update gamification g set
        total_xp = g.total_xp + badge.xp_reward,
        level = public.level_for_xp(g.total_xp + badge.xp_reward)
      where g.user_id = p_user;
    end if;
  end loop;

  -- titles use the level after any badge XP
  select jsonb_set(m, '{level}', to_jsonb(g.level)) into m
  from gamification g where g.user_id = p_user;

  for t in
    select c.title_id, c.name, c.kind from title_catalog c
    where (m->>c.metric)::int >= c.target
      and not exists (select 1 from user_titles u
                      where u.user_id = p_user and u.title_id = c.title_id)
  loop
    insert into user_titles (user_id, title_id) values (p_user, t.title_id)
      on conflict do nothing;
    if t.title_id <> 'novice' then
      insert into notifications (user_id, type, title, body, data)
      values (p_user, 'title', 'New title: ' || t.name,
        'We are now "' || t.name || '".',
        jsonb_build_object('title_id', t.title_id));
    end if;
  end loop;

  return v_new;
end;
$$;

----------------------------------------------------------------------
-- title_progress(): every title with progress toward it (FR-4.3
-- "show next title progress"), for the signed-in user only.
----------------------------------------------------------------------
create or replace function public.title_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  m := public.progress_metrics(v_user);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'title_id', c.title_id,
      'name', c.name,
      'kind', c.kind,
      'pillar', c.pillar,
      'description', c.description,
      'progress', least((m->>c.metric)::int, c.target),
      'target', c.target,
      'unlocked_at', u.unlocked_at
    ) order by c.sort)
    from title_catalog c
    left join user_titles u on u.title_id = c.title_id and u.user_id = v_user
  ), '[]'::jsonb);
end;
$$;

-- Internal helpers take any user id; keep them off the public API.
-- (evaluate_badges / recompute_daily_score stay callable: the security
-- invoker quest RPCs call them as the signed-in user.)
revoke execute on function public.completed_quest_facts(uuid) from public, anon, authenticated;
revoke execute on function public.progress_metrics(uuid) from public, anon, authenticated;
grant execute on function public.completed_quest_facts(uuid) to service_role;
grant execute on function public.progress_metrics(uuid) to service_role;

-- Backfill: anyone who already met a newly-reachable badge or title.
do $$
declare r record;
begin
  for r in select user_id from public.gamification loop
    perform public.evaluate_badges(r.user_id);
  end loop;
end;
$$;

----------------------------------------------------------------------
-- Hourly coach nudges (FR-5.2). The function decides per user, in their
-- timezone, whether a nudge is due; caps and quiet hours apply there.
----------------------------------------------------------------------
select cron.schedule(
  'coach-nudges-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'http://host.docker.internal:54321/functions/v1/coach-nudges',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "prayerlock-dev-cron-secret"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
