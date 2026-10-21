// generate-avatar: turns the user's photo into their "Future Self" avatar.
// Client sends a small square JPEG (base64). We call fal.ai's synchronous
// image-edit endpoint (Flux Kontext by default, ~5-10 s), copy the result
// into Storage, and point profiles.ai_avatar_url at it. Any failure leaves
// the SVG avatar in place, so the client can always fall back.
// Key comes ONLY from Edge Function env (FAL_KEY) — never from the client.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'profile-photos';
const DAILY_LIMIT = 5; // generations per rolling 24 h (cost control)
const MAX_INPUT_CHARS = 1_400_000; // ~1 MB JPEG as base64
const PROVIDER_TIMEOUT_MS = 55_000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const falKey = Deno.env.get('FAL_KEY');
    const model = Deno.env.get('AVATAR_MODEL') ?? 'fal-ai/flux-pro/kontext';
    if (!falKey) return json({ error: 'not_configured' }, 503);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'invalid_session' }, 401);

    let imageBase64 = '';
    try {
      const body = await req.json();
      imageBase64 =
        typeof body?.image_base64 === 'string' ? body.image_base64 : '';
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    imageBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '').trim();
    if (imageBase64.length === 0) return json({ error: 'missing_image' }, 400);
    if (imageBase64.length > MAX_INPUT_CHARS) {
      return json({ error: 'image_too_large' }, 413);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ---- daily limit (server-side, rolling 24 h) ----
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('avatar_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ error: 'daily_limit', limit: DAILY_LIMIT }, 429);
    }

    const { data: goals } = await admin
      .from('user_goals')
      .select('dream_body, dream_personality')
      .eq('user_id', user.id)
      .maybeSingle();

    const prompt = buildPrompt(
      goals?.dream_body ?? null,
      (goals?.dream_personality as string[] | null) ?? [],
    );

    // ---- provider call ----
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    let resultUrl = '';
    try {
      const response = await fetch(`https://fal.run/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          image_url: `data:image/jpeg;base64,${imageBase64}`,
          num_images: 1,
          output_format: 'jpeg',
          aspect_ratio: '1:1',
          safety_tolerance: '2',
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        await logAttempt(admin, user.id, false, started, `fal_${response.status}: ${text.slice(0, 200)}`);
        return json({ error: 'generation_failed' }, 502);
      }
      const result = await response.json();
      resultUrl = result?.images?.[0]?.url ?? '';
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      await logAttempt(admin, user.id, false, started, aborted ? 'timeout' : String(e).slice(0, 200));
      return json({ error: aborted ? 'timeout' : 'generation_failed' }, 504);
    } finally {
      clearTimeout(timer);
    }
    if (!resultUrl) {
      await logAttempt(admin, user.id, false, started, 'empty_result');
      return json({ error: 'generation_failed' }, 502);
    }

    // ---- copy into our Storage (provider URLs are not permanent) ----
    const imageResponse = await fetch(resultUrl);
    if (!imageResponse.ok) {
      await logAttempt(admin, user.id, false, started, `download_${imageResponse.status}`);
      return json({ error: 'generation_failed' }, 502);
    }
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    const path = `${user.id}/ai-avatar.jpg`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      await logAttempt(admin, user.id, false, started, `upload: ${uploadError.message}`);
      return json({ error: 'storage_failed' }, 500);
    }
    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET).getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await admin
      .from('profiles')
      .update({ ai_avatar_url: url, avatar_mode: 'ai' })
      .eq('id', user.id);
    if (updateError) {
      await logAttempt(admin, user.id, false, started, `profile: ${updateError.message}`);
      return json({ error: 'storage_failed' }, 500);
    }

    const latencyMs = Date.now() - started;
    await logAttempt(admin, user.id, true, started, null);
    return json(
      {
        url,
        latency_ms: latencyMs,
        remaining_today: Math.max(0, DAILY_LIMIT - (count ?? 0) - 1),
      },
      200,
    );
  } catch (e) {
    return json(
      { error: 'internal', message: e instanceof Error ? e.message : 'unknown' },
      500,
    );
  }
});

function buildPrompt(dreamBody: string | null, personality: string[]): string {
  const traits = personality
    .filter((t) => typeof t === 'string')
    .slice(0, 4)
    .map((t) => t.replace(/[^a-zA-Z -]/g, '').slice(0, 20))
    .filter(Boolean);
  const body = (dreamBody ?? '').replace(/[^\p{L}\p{N} ,.'-]/gu, '').slice(0, 80);
  const parts = [
    'Turn this photo into a polished 3D animated character portrait of the same person, in the style of a modern animated feature film.',
    'Keep their identity: same face shape, skin tone, eye color, hairstyle and hair color, facial hair, glasses, and any head covering such as a hijab or cap.',
    'Show them as the best version of themselves a few years from now: healthy, rested, glowing skin, upright posture, warm confident smile.',
    traits.length > 0 ? `Their expression feels ${traits.join(', ')}.` : '',
    body ? `Physique hint: ${body}.` : '',
    'Head and shoulders, centered, facing the camera, soft studio light, clean warm gradient background, no text, no logos, modest everyday clothing.',
  ];
  return parts.filter(Boolean).join(' ');
}

async function logAttempt(
  admin: ReturnType<typeof createClient>,
  userId: string,
  ok: boolean,
  started: number,
  error: string | null,
): Promise<void> {
  await admin.from('avatar_generations').insert({
    user_id: userId,
    ok,
    latency_ms: Date.now() - started,
    error,
  });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
