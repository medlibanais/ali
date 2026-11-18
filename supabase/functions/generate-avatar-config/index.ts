// generate-avatar-config: "Make it look like me".
// Called by the database webhook on avatar_generation_jobs (migration
// 0030), or by the app for its own job if no webhook call arrived. Reads
// the selfie from the private `selfies` bucket, asks a vision model which
// avatar options resemble the person, and writes result_config. If the AI
// is missing, rate-limited, slow or unsure, the job still completes with a
// random config (source 'random') so the app always has something to show.
// Keys (GROQ_API_KEY, FAL_KEY) come ONLY from Edge Function secrets.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  extractJson,
  parseSelfieResult,
  randomSelfieResult,
  SELFIE_SYSTEM_PROMPT,
  type SelfieAvatarResult,
  type StoredSelfieResult,
} from '../_shared/avatarSelfie.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

const BUCKET = 'selfies';
const ATTEMPT_TIMEOUT_MS = 20_000;
const TOTAL_BUDGET_MS = 45_000; // the app gives up polling after 60 s
const MAX_RETRIES = 2; // per provider, for 429 and 5xx
const MAX_RETRY_WAIT_MS = 8_000;
/** A 'processing' job older than this is treated as abandoned. */
const STALE_MS = 90_000;

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DEFAULT_FAL_BASE_URL = 'https://fal.run';
const DEFAULT_FAL_VISION_ENDPOINT = 'openrouter/router/vision';
const DEFAULT_FAL_VISION_MODEL = 'google/gemini-2.5-flash';

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;

interface ProviderAnswer {
  ok: boolean;
  text: string;
  /** rate_limited | timeout | provider_auth | provider_error | network */
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const webhookSecret = Deno.env.get('AVATAR_WEBHOOK_SECRET') ?? 'prayerlock-dev-cron-secret';
  const admin: Admin = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  // ---- who is calling: the database webhook, or the job's owner ----
  let jobId = '';
  let ownerId: string | null = null; // set when a person calls for their own job
  const sentSecret = req.headers.get('x-webhook-secret');
  if (sentSecret !== null) {
    if (!timingSafeEqual(sentSecret, webhookSecret)) return json({ error: 'forbidden' }, 403);
    const record = body.record as Record<string, unknown> | undefined;
    jobId = typeof record?.id === 'string' ? record.id : '';
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_authorization' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: 'invalid_session' }, 401);
    ownerId = user.id;
    jobId = typeof body.job_id === 'string' ? body.job_id : '';
  }
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: 'missing_job_id' }, 400);

  // ---- claim the job (only one caller wins) ----
  const job = await claimJob(admin, jobId, ownerId);
  if (!job) return json({ status: 'already_handled' }, 200);

  try {
    const started = Date.now();
    const { result, error } = await describeSelfie(admin, job.user_id, started);
    const stored: StoredSelfieResult = result
      ? { ...result, source: 'ai' }
      : { ...randomSelfieResult(), source: 'random' };
    await admin
      .from('avatar_generation_jobs')
      .update({ status: 'completed', result_config: stored, error, updated_at: new Date().toISOString() })
      .eq('id', job.id);
    // The selfie is only needed for this one read.
    await admin.storage.from(BUCKET).remove([`${job.user_id}.jpg`]);
    console.log('generate-avatar-config', job.id, stored.source, error ?? 'ok', `${Date.now() - started}ms`);
    return json({ status: 'completed', source: stored.source }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    console.error('generate-avatar-config failed', job.id, message);
    await admin
      .from('avatar_generation_jobs')
      .update({ status: 'failed', error: `internal: ${message.slice(0, 180)}`, updated_at: new Date().toISOString() })
      .eq('id', job.id);
    return json({ error: 'internal' }, 500);
  }
});

async function claimJob(
  admin: Admin,
  jobId: string,
  ownerId: string | null,
): Promise<{ id: string; user_id: string } | null> {
  const { data: current } = await admin
    .from('avatar_generation_jobs')
    .select('id, user_id, status, attempts, updated_at')
    .eq('id', jobId)
    .maybeSingle();
  if (!current) return null;
  if (ownerId && current.user_id !== ownerId) return null; // never someone else's job
  const stale = current.status === 'processing' &&
    Date.now() - new Date(current.updated_at as string).getTime() > STALE_MS;
  if (current.status !== 'pending' && !stale) return null;

  // Compare-and-set on the status we saw, so a webhook and an app call
  // arriving together cannot both run the model.
  const { data: claimed } = await admin
    .from('avatar_generation_jobs')
    .update({
      status: 'processing',
      attempts: (current.attempts as number) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', current.status)
    .eq('updated_at', current.updated_at)
    .select('id, user_id')
    .maybeSingle();
  return claimed ?? null;
}

async function describeSelfie(
  admin: Admin,
  userId: string,
  started: number,
): Promise<{ result: SelfieAvatarResult | null; error: string | null }> {
  const { data: file, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(`${userId}.jpg`);
  if (downloadError || !file) return { result: null, error: 'selfie_missing' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 600 * 1024) return { result: null, error: 'selfie_too_large' };
  const dataUrl = `data:image/jpeg;base64,${toBase64(bytes)}`;

  const providers: { name: string; call: () => Promise<ProviderAnswer> }[] = [];
  const groqKey = Deno.env.get('GROQ_API_KEY');
  const falKey = Deno.env.get('FAL_KEY');
  if (groqKey) providers.push({ name: 'groq', call: () => askGroq(groqKey, dataUrl) });
  if (falKey) providers.push({ name: 'fal', call: () => askFal(falKey, dataUrl) });
  if (providers.length === 0) return { result: null, error: 'not_configured' };

  let lastError = 'provider_error';
  for (const provider of providers) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      if (Date.now() - started > TOTAL_BUDGET_MS - ATTEMPT_TIMEOUT_MS / 2) {
        return { result: null, error: 'timeout' };
      }
      const answer = await provider.call();
      if (answer.ok) {
        const parsed = parseSelfieResult(extractJson(answer.text));
        if (parsed) return { result: parsed, error: null };
        const raw = extractJson(answer.text) as { error?: unknown } | null;
        if (raw && raw.error === 'no_face') return { result: null, error: 'no_face' };
        lastError = `${provider.name}_bad_answer`;
        break; // a wrong-shaped answer will not get better on retry; try the next provider
      }
      lastError = `${provider.name}_${answer.error ?? 'provider_error'}`;
      if (answer.error === 'provider_auth') break;
      if (answer.error === 'rate_limited' || answer.error === 'provider_error' || answer.error === 'timeout') {
        if (attempt < MAX_RETRIES) await sleep(backoffMs(attempt, answer));
        continue;
      }
      break;
    }
  }
  return { result: null, error: lastError };
}

interface RetryHint extends ProviderAnswer {
  retryAfterMs?: number;
}

function backoffMs(attempt: number, answer: RetryHint): number {
  const exp = 1000 * 2 ** attempt + Math.floor(Math.random() * 400);
  return Math.min(MAX_RETRY_WAIT_MS, answer.retryAfterMs ?? exp);
}

async function askGroq(apiKey: string, dataUrl: string): Promise<RetryHint> {
  const base = (Deno.env.get('GROQ_BASE_URL') || DEFAULT_GROQ_BASE_URL).replace(/\/+$/, '');
  const model = Deno.env.get('AVATAR_VISION_MODEL') || DEFAULT_GROQ_VISION_MODEL;
  return await post(`${base}/chat/completions`, `Bearer ${apiKey}`, {
    model,
    temperature: 0.2,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SELFIE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this selfie as the JSON object.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  }, (j) => {
    const r = j as { choices?: { message?: { content?: string } }[] };
    return r.choices?.[0]?.message?.content ?? '';
  });
}

async function askFal(apiKey: string, dataUrl: string): Promise<RetryHint> {
  const base = (Deno.env.get('FAL_BASE_URL') || DEFAULT_FAL_BASE_URL).replace(/\/+$/, '');
  const endpoint = Deno.env.get('AVATAR_FAL_VISION_ENDPOINT') || DEFAULT_FAL_VISION_ENDPOINT;
  const model = Deno.env.get('AVATAR_FAL_VISION_MODEL') || DEFAULT_FAL_VISION_MODEL;
  return await post(`${base}/${endpoint}`, `Key ${apiKey}`, {
    model,
    system_prompt: SELFIE_SYSTEM_PROMPT,
    prompt: 'Describe this selfie as the JSON object.',
    image_urls: [dataUrl],
    temperature: 0.2,
    max_tokens: 300,
  }, (j) => {
    const r = j as { output?: string };
    return r.output ?? '';
  });
}

async function post(
  url: string,
  authorization: string,
  payload: unknown,
  read: (body: unknown) => string,
): Promise<RetryHint> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      console.error('vision provider', response.status, text.slice(0, 200));
      if (response.status === 429) {
        const after = Number(response.headers.get('retry-after'));
        return {
          ok: false,
          text: '',
          error: 'rate_limited',
          retryAfterMs: Number.isFinite(after) && after > 0 ? after * 1000 : undefined,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, text: '', error: 'provider_auth' };
      }
      return { ok: false, text: '', error: response.status >= 500 ? 'provider_error' : 'rejected' };
    }
    const text = read(await response.json()).trim();
    return text ? { ok: true, text } : { ok: false, text: '', error: 'provider_error' };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { ok: false, text: '', error: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
