// ProfileAvatar: shows the AI Future Self image when avatar_mode is 'ai',
// the user's real photo when it is 'photo', otherwise the layered SVG
// avatar (also the fallback when an image is missing). Use everywhere
// identity is shown.

import React from 'react';
import AvatarView from '../avatar/AvatarView';
import { VALID_OPTION_IDS } from '../avatar/options';
import { sanitizeAvatarConfig, type Mood } from '../avatar/types';
import Avatar from './Avatar';

export interface ProfileAvatarProps {
  profile: {
    photo_url?: string | null;
    avatar_url?: string | null;
    avatar_mode?: 'avatar' | 'photo' | 'ai';
    ai_avatar_url?: string | null;
    avatar_config?: Record<string, unknown> | null;
    first_name?: string | null;
  } | null;
  size?: number;
  mood?: Mood;
  animated?: boolean;
}

export function ProfileAvatar({
  profile,
  size = 120,
  mood = 'neutral',
  animated = true,
}: ProfileAvatarProps) {
  if (profile?.avatar_mode === 'ai' && profile.ai_avatar_url) {
    return (
      <Avatar
        uri={profile.ai_avatar_url}
        name={profile?.first_name}
        size={size}
        ringColor={undefined}
      />
    );
  }
  const photoUrl = profile?.photo_url ?? profile?.avatar_url ?? null;
  if (profile?.avatar_mode === 'photo' && photoUrl) {
    return (
      <Avatar
        uri={photoUrl}
        name={profile?.first_name}
        size={size}
        ringColor={undefined}
      />
    );
  }
  return (
    <AvatarView
      config={sanitizeAvatarConfig(profile?.avatar_config, VALID_OPTION_IDS)}
      size={size}
      mood={mood}
      animated={animated}
    />
  );
}

export default ProfileAvatar;
