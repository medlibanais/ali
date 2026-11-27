// The avatar, anywhere in the app: the realistic 3D human (Avatar3D.tsx)
// rendered from the person's config. It breathes and blinks, paced by
// the day's life score.

import React, { memo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import Avatar3D from './Avatar3D';
import type { AvatarConfig, Mood } from './types';

export interface AvatarViewProps {
  config: AvatarConfig;
  size?: number;
  mood?: Mood;
  animated?: boolean;
  mode?: 'head' | 'full-body';
  /** No backdrop and no round crop. */
  bare?: boolean;
  /**
   * The day's life score (0-100) that sets the breathing pace: low is
   * fast and shallow, high slow and calm. Pass a SharedValue
   * (useLifeScoreValue) where the score changes while the avatar is on
   * screen, so the pace follows it without re-rendering the avatar.
   */
  score?: number | SharedValue<number>;
  /** The person's own avatar: a slot unique to account and place (see Avatar3D). */
  portrait?: string;
}

export const AvatarView = memo(function AvatarView(props: AvatarViewProps) {
  return <Avatar3D {...props} />;
});

export default AvatarView;
