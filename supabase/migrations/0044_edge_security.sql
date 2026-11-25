-- Reserve one search before starting any embedding work. The service role
-- passes the verified caller ID. Serialize per account so parallel calls
-- respect the same quota.
create function public.reserve_quest_search(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('quest_search:' || p_user::text, 0));
  perform public.hit_rate_limit(p_user, 'quest_search', 30, interval '1 minute');
end;
$$;

revoke execute on function public.reserve_quest_search(uuid) from public, anon, authenticated;
grant execute on function public.reserve_quest_search(uuid) to service_role;

-- Scheduled jobs and webhook dispatch require explicitly configured Vault
-- secrets. A missing secret simply skips the background dispatch.
create or replace function public.invoke_cron_function(p_path text, p_body jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  exception when others then
    v_url := null;
    v_secret := null;
  end;

  if nullif(btrim(v_url), '') is null
     or nullif(btrim(v_secret), '') is null
     or v_secret = 'prayerlock-dev-cron-secret' then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := p_body,
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;

revoke execute on function public.invoke_cron_function(text, jsonb) from public, anon, authenticated;

create or replace function public.invoke_smart_notify()
returns bigint
language sql
security definer
set search_path = public
as $$
  select public.invoke_cron_function('/functions/v1/smart-notify', '{}'::jsonb);
$$;

revoke execute on function public.invoke_smart_notify() from public, anon, authenticated;

create or replace function public.dispatch_avatar_generation_job()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text;
  secret text;
begin
  begin
    select decrypted_secret into base_url
      from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'avatar_webhook_secret' limit 1;
  exception when others then
    base_url := null;
    secret := null;
  end;

  if nullif(btrim(base_url), '') is null
     or nullif(btrim(secret), '') is null
     or secret = 'prayerlock-dev-cron-secret' then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/')
      || '/functions/v1/generate-avatar-config',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', 'public',
      'table', 'avatar_generation_jobs',
      'record', jsonb_build_object('id', new.id, 'user_id', new.user_id),
      'old_record', null
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'avatar job webhook not sent: %', sqlerrm;
  return new;
end;
$$;

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
      perform public.invoke_cron_function(
        '/functions/v1/notify-friend',
        jsonb_build_object(
          'type', 'friend_streak_milestone',
          'user_id', new.user_id,
          'friend_id', friend.friend_id,
          'streak', milestone
        )
      );
    end loop;
  end if;
  return new;
exception when others then
  raise warning 'friend streak notification could not be queued';
  return new;
end;
$$;

revoke execute on function public.dispatch_avatar_generation_job() from public, anon, authenticated;
revoke execute on function public.notify_streak_milestone() from public, anon, authenticated;
notify pgrst, 'reload schema';
