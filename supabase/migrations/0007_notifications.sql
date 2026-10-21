-- PrayerLock 0007: tz hour helper + streak-milestone friend notifications.

create or replace function public.hour_in_tz(p_tz text)
returns int
language sql stable
as $$
  select extract(hour from now() at time zone coalesce(p_tz, 'UTC'))::int
$$;

-- When a user's streak crosses a milestone (7/14/30/50/100), notify each
-- accepted friend via the notify-friend Edge Function.
create or replace function public.notify_streak_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  milestone int;
  friend record;
begin
  if new.current_streak in (7, 14, 30, 50, 100)
     and new.current_streak > coalesce(old.current_streak, 0) then
    milestone := new.current_streak;
    for friend in
      select case when f.requester = new.user_id then f.addressee else f.requester end as friend_id
      from friendships f
      where f.status = 'accepted'
        and (f.requester = new.user_id or f.addressee = new.user_id)
    loop
      perform net.http_post(
        url := 'http://host.docker.internal:54321/functions/v1/notify-friend',
        headers := '{"Content-Type": "application/json", "x-cron-secret": "prayerlock-dev-cron-secret"}'::jsonb,
        body := jsonb_build_object(
          'type', 'friend_streak_milestone',
          'user_id', new.user_id,
          'friend_id', friend.friend_id,
          'streak', milestone
        )
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger gamification_streak_milestone
  after update of current_streak on public.gamification
  for each row execute function public.notify_streak_milestone();
