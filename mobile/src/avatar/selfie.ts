// "Make it look like me": the pure part. How an AI reading of a selfie
// lands in the editor, and how the app waits for the job. The network
// side lives in lib/selfieAvatar.ts; the server side in
// supabase/functions/generate-avatar-config.

import { fitToSex, VALID_OPTION_IDS } from './options';
import type { AvatarChoiceKey, AvatarConfig } from './types';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type FacialHair = 'none' | 'stubble' | 'moustache' | 'beard';

/** What the Edge Function writes to avatar_generation_jobs.result_config. */
export interface SelfieResult {
  sex: string;
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  eyeColor: string;
  glasses: string;
  facialHair: FacialHair;
  /** 'ai' when the photo was read, 'random' when the server fell back. */
  source: 'ai' | 'random';
}

export interface JobRow {
  id: string;
  status: JobStatus;
  result_config: unknown;
  error: string | null;
}

/** Which result field fills which editor field. */
const FIELD_MAP: [keyof SelfieResult, AvatarChoiceKey][] = [
  ['skinTone', 'skin'],
  ['hairStyle', 'hair'],
  ['hairColor', 'hairColor'],
  ['eyeColor', 'eyeColor'],
  ['glasses', 'glasses'],
];

const FACIAL: FacialHair[] = ['none', 'stubble', 'moustache', 'beard'];

/** Coerce result_config JSON into a SelfieResult, or null if unusable. */
export function readSelfieResult(raw: unknown): SelfieResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const facial = str('facialHair') as FacialHair;
  return {
    sex: str('sex'),
    skinTone: str('skinTone'),
    hairStyle: str('hairStyle'),
    hairColor: str('hairColor'),
    eyeColor: str('eyeColor'),
    glasses: str('glasses'),
    facialHair: FACIAL.includes(facial) ? facial : 'none',
    source: r.source === 'ai' ? 'ai' : 'random',
  };
}

/**
 * Put a selfie reading onto the avatar being edited. Only the fields the
 * photo can tell are changed; face shape sliders, body, outfit and pose
 * stay as they are. Unknown ids are skipped, never written.
 */
export function applySelfieResult(config: AvatarConfig, result: SelfieResult): AvatarConfig {
  let next: AvatarConfig = { ...config, sliders: { ...config.sliders } };
  if (VALID_OPTION_IDS.sex.includes(result.sex) && result.sex !== config.sex) {
    next = fitToSex({ ...next, sex: result.sex as AvatarConfig['sex'] });
  }
  const record = next as unknown as Record<AvatarChoiceKey, string>;
  for (const [from, to] of FIELD_MAP) {
    const value = result[from];
    if (typeof value === 'string' && VALID_OPTION_IDS[to].includes(value)) record[to] = value;
  }
  return next;
}

/** What to tell the person once the avatar is loaded. */
export function resultNote(result: SelfieResult | null, error: string | null): string {
  if (!result || result.source === 'random') {
    if (error === 'no_face') return 'We could not see a face in that photo, so here is a random start. Try a clear, front-facing selfie.';
    if (error === 'not_configured') return 'Photo reading is not switched on yet, so here is a random start.';
    if (error && /rate_limited/.test(error)) return 'The AI is busy right now, so here is a random start. Try again in a minute.';
    return 'We could not read the photo this time, so here is a random start to edit.';
  }
  const beard = result.facialHair !== 'none'
    ? ` The avatar cannot show ${result.facialHair === 'stubble' ? 'stubble' : `a ${result.facialHair}`} yet.`
    : '';
  return `We matched your skin tone, hair, eye color and glasses. Fine-tune the face in the tabs below.${beard}`;
}

export interface PollDeps {
  fetchJob: (id: string) => Promise<JobRow | null>;
  /** Ask the server to run the job, in case the webhook call never came. */
  kick: (id: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  /** Still 'pending' after this long: call the function ourselves (once). */
  kickAfterMs?: number;
  isCancelled?: () => boolean;
}

export type PollOutcome =
  | { kind: 'completed'; result: SelfieResult | null; error: string | null }
  | { kind: 'failed'; error: string | null }
  | { kind: 'timeout' }
  | { kind: 'cancelled' };

/** Check the job every 3 seconds until it is done, failed, or 60 s pass. */
export async function pollJob(jobId: string, deps: PollDeps, options: PollOptions = {}): Promise<PollOutcome> {
  const interval = options.intervalMs ?? 3000;
  const timeout = options.timeoutMs ?? 60_000;
  const kickAfter = options.kickAfterMs ?? 6000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const started = now();
  let kicked = false;
  for (;;) {
    if (options.isCancelled?.()) return { kind: 'cancelled' };
    let row: JobRow | null = null;
    try {
      row = await deps.fetchJob(jobId);
    } catch {
      row = null; // a dropped poll is not a failed job; try again next tick
    }
    if (options.isCancelled?.()) return { kind: 'cancelled' };
    if (row?.status === 'completed') {
      return { kind: 'completed', result: readSelfieResult(row.result_config), error: row.error };
    }
    if (row?.status === 'failed') return { kind: 'failed', error: row.error };
    const elapsed = now() - started;
    if (elapsed >= timeout) return { kind: 'timeout' };
    if (!kicked && row?.status === 'pending' && elapsed >= kickAfter) {
      kicked = true;
      deps.kick(jobId).catch(() => undefined);
    }
    await sleep(Math.min(interval, Math.max(0, timeout - elapsed)));
  }
}
