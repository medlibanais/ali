// A photograph of the avatar the person built in the editor. The 3D
// renderer draws the character large, the generate-avatar Edge Function
// (FAL_KEY lives only there) turns that picture into a photo, and the
// result is saved on the profile. The 3D avatar stays the default.

import { renderOnce } from '../avatar/Avatar3D';
import { suggestOutfitWords } from '../avatar/shape';
import type { AvatarConfig, Mood } from '../avatar/types';
import { avatarFailure, AiAvatarError } from './aiAvatar';
import { describeFunctionError } from './functionErrors';
import { supabase } from './supabase';

export type PhotoView = 'portrait' | 'full';

export interface PhotorealResult {
  url: string;
  view: PhotoView;
  remainingToday: number;
}

/** Draw the character large, then ask for a photograph of it. */
export async function makePhotoreal(config: AvatarConfig, view: PhotoView, mood: Mood = 'happy'): Promise<PhotorealResult> {
  let picture: string;
  try {
    picture = await renderOnce(config, mood, view === 'full' ? 'body-hd' : 'head-hd', {});
  } catch (e) {
    throw new AiAvatarError(e instanceof Error ? e.message : 'The picture could not be drawn.');
  }
  const { data, error } = await supabase.functions.invoke('generate-avatar', {
    body: {
      kind: 'render',
      view,
      mime: 'png',
      image_base64: picture.replace(/^data:image\/\w+;base64,/, ''),
      details: suggestOutfitWords(config),
    },
  });
  if (error) throw avatarFailure(await describeFunctionError(error));
  const payload = data as { url?: string; remaining_today?: number } | null;
  if (!payload?.url) throw new AiAvatarError('We could not make the photo this time. Try again.');
  return { url: payload.url, view, remainingToday: payload.remaining_today ?? 0 };
}

/** Use the portrait photo as the profile picture. */
export async function setPhotoAsProfilePicture(url: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AiAvatarError('Sign in again to do that.', 'session');
  const { error } = await supabase.from('profiles').update({ ai_avatar_url: url, avatar_mode: 'ai' }).eq('id', user.id);
  if (error) throw new AiAvatarError('We could not save that. Try again.');
}
