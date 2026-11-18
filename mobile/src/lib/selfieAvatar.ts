// "Make it look like me": selfie -> private Storage -> job row -> the
// generate-avatar-config Edge Function (webhook) -> poll the row.
// No AI key is ever in the app; the function holds them.

import { Platform } from 'react-native';
import i18n from '../i18n';
import { pollJob, type JobRow, type PollOutcome } from '../avatar/selfie';
import { base64ToBytes, PhotoError, pickSquarePhoto } from './profilePhoto';
import { supabase } from './supabase';

const BUCKET = 'selfies';
const MAX_BYTES = 500 * 1024;

export type SelfieSource = 'camera' | 'gallery';

export class SelfieError extends Error {
  constructor(
    message: string,
    public readonly code: 'cancelled' | 'permission' | 'too_large' | 'daily_limit' | 'busy' | 'upload' | 'failed' = 'failed',
  ) {
    super(message);
  }
}

/** The camera is a native-only path; web picks a file instead. */
export function selfieSources(): SelfieSource[] {
  return Platform.OS === 'web' ? ['gallery'] : ['camera', 'gallery'];
}

/** Take or pick the selfie: square, 512 px, JPEG under 500 KB. */
export async function captureSelfie(source: SelfieSource): Promise<Uint8Array> {
  try {
    const base64 = await pickSquarePhoto(Platform.OS === 'web' ? 'gallery' : source);
    const bytes = base64ToBytes(base64);
    if (bytes.length === 0) throw new SelfieError(i18n.t('selfie.couldNotReadThat'));
    if (bytes.length > MAX_BYTES) throw new SelfieError(i18n.t('selfie.thatPhotoIsStill'), 'too_large');
    return bytes;
  } catch (e) {
    if (e instanceof SelfieError) throw e;
    if (e instanceof PhotoError) {
      const code = e.code === 'cancelled' || e.code === 'permission' || e.code === 'too_large' ? e.code : 'failed';
      throw new SelfieError(e.message, code);
    }
    throw new SelfieError(i18n.t('selfie.couldNotOpenThe'));
  }
}

/** Upload to selfies/{userId}.jpg, then queue a job. Returns the job id. */
export async function startSelfieJob(bytes: Uint8Array): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new SelfieError(i18n.t('selfie.youAreSignedOut'), 'upload');

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(`${user.id}.jpg`, bytes.buffer as ArrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw new SelfieError(i18n.t('selfie.couldNotUploadThe', { message: uploadError.message }), 'upload');

  const { data, error } = await supabase
    .from('avatar_generation_jobs')
    .insert({ user_id: user.id })
    .select('id')
    .single();
  if (error || !data) {
    const text = `${error?.message ?? ''}`;
    if (text.includes('daily_limit')) throw new SelfieError(i18n.t('selfie.youHaveMade10'), 'daily_limit');
    if (text.includes('job_in_progress')) throw new SelfieError(i18n.t('selfie.yourLastPhotoIs'), 'busy');
    if (/relation .* does not exist|avatar_generation_jobs/.test(text)) {
      throw new SelfieError(i18n.t('selfie.thisFeatureIsNot'));
    }
    throw new SelfieError(i18n.t('selfie.couldNotStartReading'));
  }
  return (data as { id: string }).id;
}

async function fetchJob(id: string): Promise<JobRow | null> {
  const { data, error } = await supabase
    .from('avatar_generation_jobs')
    .select('id, status, result_config, error')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as JobRow | null) ?? null;
}

async function kick(id: string): Promise<void> {
  await supabase.functions.invoke('generate-avatar-config', { body: { job_id: id } });
}

/** Poll the job every 3 seconds (gives up after 60 s). */
export function waitForSelfieJob(jobId: string, isCancelled: () => boolean): Promise<PollOutcome> {
  return pollJob(jobId, { fetchJob, kick }, { intervalMs: 3000, timeoutMs: 60_000, kickAfterMs: 6000, isCancelled });
}
