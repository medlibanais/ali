// AI "Future Self" avatar: photo -> generate-avatar Edge Function -> stored
// image in profiles.ai_avatar_url. The SVG avatar stays as the fallback.

import { PhotoError, pickSquarePhoto } from './profilePhoto';
import { supabase } from './supabase';

export class AiAvatarError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'daily_limit'
      | 'not_configured'
      | 'timeout'
      | 'failed' = 'failed',
  ) {
    super(message);
  }
}

export interface AiAvatarResult {
  url: string;
  latencyMs: number;
  remainingToday: number;
}

/** Pick a photo, then generate. Throws PhotoError for picker problems. */
export async function pickAndGenerateAiAvatar(
  source: 'camera' | 'gallery',
  onPicked?: () => void,
): Promise<AiAvatarResult> {
  const base64 = await pickSquarePhoto(source);
  onPicked?.();
  return generateAiAvatar(base64);
}

export async function generateAiAvatar(
  imageBase64: string,
): Promise<AiAvatarResult> {
  const { data, error } = await supabase.functions.invoke('generate-avatar', {
    body: { image_base64: imageBase64 },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) {
      throw new AiAvatarError(
        'You have used today’s avatar generations. Try again tomorrow.',
        'daily_limit',
      );
    }
    if (status === 503) {
      throw new AiAvatarError(
        'AI avatars are not switched on yet. Design one by hand for now.',
        'not_configured',
      );
    }
    if (status === 504) {
      throw new AiAvatarError(
        'That took too long. Try again, or design one by hand.',
        'timeout',
      );
    }
    throw new AiAvatarError(
      'We could not create your avatar this time. Try another photo.',
    );
  }
  const payload = data as {
    url: string;
    latency_ms: number;
    remaining_today: number;
  };
  if (!payload?.url) {
    throw new AiAvatarError(
      'We could not create your avatar this time. Try another photo.',
    );
  }
  return {
    url: payload.url,
    latencyMs: payload.latency_ms,
    remainingToday: payload.remaining_today,
  };
}

export { PhotoError };
