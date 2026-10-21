// AI "Future Self" avatar: photo -> generate-avatar Edge Function -> stored
// image in profiles.ai_avatar_url. The SVG avatar stays as the fallback.

import { describeFunctionError, type FunctionFailure } from './functionErrors';
import { PhotoError, pickSquarePhoto } from './profilePhoto';
import { supabase } from './supabase';

export type AiAvatarErrorCode =
  | 'daily_limit'
  | 'not_configured'
  | 'not_deployed'
  | 'provider_auth'
  | 'rejected'
  | 'timeout'
  | 'session'
  | 'network'
  | 'failed';

export class AiAvatarError extends Error {
  constructor(
    message: string,
    public readonly code: AiAvatarErrorCode = 'failed',
  ) {
    super(message);
  }
}

/** What to tell the user when generate-avatar fails. */
export function avatarFailure(failure: FunctionFailure): AiAvatarError {
  if (failure.kind === 'network') {
    return new AiAvatarError(
      'No connection. Check your internet and try again.',
      'network',
    );
  }
  switch (failure.status) {
    case 401:
      return new AiAvatarError(
        'Your session has expired. Sign out and back in, then try again.',
        'session',
      );
    case 404:
      return new AiAvatarError(
        'AI avatars are not set up on the server yet (the "generate-avatar" function is not deployed).',
        'not_deployed',
      );
    case 413:
      return new AiAvatarError('That photo is too large. Try another one.');
    case 429:
      return new AiAvatarError(
        'You have used today’s avatar generations. Try again tomorrow.',
        'daily_limit',
      );
    case 503:
      return new AiAvatarError(
        'AI avatars are not switched on yet: the server is missing its FAL_KEY. Design one by hand for now.',
        'not_configured',
      );
    case 504:
      return new AiAvatarError(
        'That took too long. Try again, or design one by hand.',
        'timeout',
      );
    default:
      break;
  }
  if (failure.code === 'provider_auth') {
    return new AiAvatarError(
      'The AI image service refused our key (FAL_KEY is wrong or out of credit).',
      'provider_auth',
    );
  }
  if (failure.code === 'rejected') {
    return new AiAvatarError(
      'The AI could not use that photo. Try a clear, well-lit selfie of your face.',
      'rejected',
    );
  }
  return new AiAvatarError(
    'We could not create your avatar this time. Try another photo.',
  );
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
    throw avatarFailure(await describeFunctionError(error));
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
