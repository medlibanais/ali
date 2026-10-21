-- PrayerLock 0009: streak freeze (1 per ISO week).

create or replace function public.use_streak_freeze()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_gam gamification%rowtype;
  v_today date := public.user_today(auth.uid());
  v_week date := date_trunc('week', public.user_today(auth.uid()))::date;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_gam from gamification where user_id = v_user for update;
  if not found then
    raise exception 'no_gamification';
  end if;
  if coalesce(v_gam.current_streak, 0) = 0 then
    raise exception 'no_streak_to_freeze';
  end if;
  if v_gam.streak_freeze_week = v_week then
    raise exception 'freeze_already_used_this_week';
  end if;
  if v_gam.last_active_date = v_today then
    raise exception 'already_active_today';
  end if;

  -- The freeze counts today as protected: tomorrow's completion continues
  -- the streak as if today had one.
  update gamification set
    last_active_date = v_today,
    streak_freeze_week = v_week
  where user_id = v_user;

  return jsonb_build_object(
    'used', true,
    'week', v_week,
    'current_streak', v_gam.current_streak
  );
end;
$$;
