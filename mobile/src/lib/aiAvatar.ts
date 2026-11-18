// AI "Future Self" avatar: photo -> generate-avatar Edge Function -> stored
// image in profiles.ai_avatar_url. The SVG avatar stays as the fallback.

import i18n from '../i18n';
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
      i18n.t('aiAvatarErrors.offline'),
      'network',
    );
  }
  switch (failure.status) {
    case 401:
      return new AiAvatarError(
        i18n.t('aiAvatarErrors.session'),
        'session',
      );
    case 404:
      return new AiAvatarError(
        i18n.t('aiAvatarErrors.notDeployed'),
        'not_deployed',
      );
    case 413:
      return new AiAvatarError(i18n.t('aiAvatarErrors.tooLarge'));
    case 429:
      return new AiAvatarError(
        i18n.t('aiAvatarErrors.dailyLimit'),
        'daily_limit',
      );
    case 503:
      return new AiAvatarError(
        i18n.t('aiAvatarErrors.notConfigured'),
        'not_configured',
      );
    case 504:
      return new AiAvatarError(
        i18n.t('aiAvatarErrors.timeout'),
        'timeout',
      );
    default:
      break;
  }
  if (failure.code === 'provider_auth') {
    return new AiAvatarError(
      i18n.t('aiAvatarErrors.providerAuth'),
      'provider_auth',
    );
  }
  if (failure.code === 'rejected') {
    return new AiAvatarError(
      i18n.t('aiAvatarErrors.rejected'),
      'rejected',
    );
  }
  return new AiAvatarError(
    i18n.t('aiAvatarErrors.generic'),
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
      i18n.t('aiAvatarErrors.generic'),
    );
  }
  return {
    url: payload.url,
    latencyMs: payload.latency_ms,
    remainingToday: payload.remaining_today,
  };
}

export { PhotoError };
