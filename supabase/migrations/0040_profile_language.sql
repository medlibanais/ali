-- App language preference (i18n). null = follow the device language.
-- Only the app-supported languages are accepted. The existing
-- profiles_update RLS policy (own row only) already covers this column.
alter table public.profiles
  add column if not exists language text;

alter table public.profiles
  drop constraint if exists profiles_language_check;

alter table public.profiles
  add constraint profiles_language_check
  check (language is null or language in ('en', 'fr', 'ar'));

comment on column public.profiles.language is
  'UI language picked in the app (en, fr, ar). null = device language.';
