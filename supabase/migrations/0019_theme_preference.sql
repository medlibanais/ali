-- Theme picked in Profile > Theme, synced across the user's devices.
-- Null means "never picked", so the app keeps the device's theme and
-- uploads it. (The old profiles.theme_id column defaults to 'parchment'
-- for everyone and cannot tell a real pick from the default, so it is left
-- unused.)
-- Idempotent on purpose: several migrations are landing out of order.

alter table public.profiles
  add column if not exists theme_preference text;

alter table public.profiles
  drop constraint if exists profiles_theme_preference_check;

alter table public.profiles
  add constraint profiles_theme_preference_check
  check (
    theme_preference is null
    or theme_preference in (
      'neon', 'midnight', 'forest', 'ocean', 'parchment',
      'sunset', 'rose', 'lavender', 'ember'
    )
  );

-- Writes go through the existing profiles_update policy
-- (id = auth.uid()), so users can only change their own preference.
