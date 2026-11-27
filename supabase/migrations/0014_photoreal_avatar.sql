-- PrayerLock 0014: photographs of the avatar the person built in the editor.
-- Written by the generate-avatar Edge Function (kind 'render'), stored in
-- profile-photos/{user_id}/photoreal-{portrait|full}.jpg. The 3D avatar
-- stays the default; the person chooses to use the photo.

alter table public.profiles
  add column if not exists photoreal_head_url text,
  add column if not exists photoreal_body_url text;
