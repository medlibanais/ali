// generate-embeddings: fills predefined_quests.embedding with gte-small
// vectors (the model built into Supabase Edge Functions; no API key).
//
// Admin only. Call it with the service role key, or with x-cron-secret:
//   curl -X POST "$SUPABASE_URL/functions/v1/generate-embeddings" \
//     -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{}'
// Body: { "force": true } re-embeds every quest (after changing the
// document format in _shared/embeddings.ts). By default only quests with a
// null embedding are embedded: new quests and ones whose text changed.
// It works in passes of PASS_LIMIT quests and loops until none are left
// or the time budget runs out; `remaining` > 0 means "call it again".

import { matchesConfiguredSecret } from '../_shared/configuredSecret.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedMissing } from '../_shared/embeddings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const PASS_LIMIT = 40;
const TIME_BUDGET_MS = 100_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET');

  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const byServiceKey = matchesConfiguredSecret(bearer, serviceKey);
  const byCron = matchesConfiguredSecret(req.headers.get('x-cron-secret'), cronSecret);
  if (!byServiceKey && !byCron) return json({ error: 'forbidden' }, 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      (body.force !== undefined && typeof body.force !== 'boolean')) {
    return json({ error: 'invalid_body' }, 400);
  }
  const force = body.force === true;
  const admin = createClient(supabaseUrl, serviceKey);

  const started = Date.now();
  let embedded = 0;
  let failed = 0;
  let remaining = 0;
  try {
    if (force) {
      // One forced pass over everything (the library is ~100 quests).
      const r = await embedMissing(admin, 1000, true);
      embedded = r.embedded;
      failed = r.failed;
      remaining = r.remaining;
    } else {
      do {
        const r = await embedMissing(admin, PASS_LIMIT);
        embedded += r.embedded;
        failed += r.failed;
        remaining = r.remaining;
        if (r.embedded === 0) break; // only failures left: stop, report
      } while (remaining > 0 && Date.now() - started < TIME_BUDGET_MS);
    }
  } catch (e) {
    return json({ error: 'embed_failed', message: e instanceof Error ? e.message : String(e) }, 500);
  }

  return json({ embedded, failed, remaining, ms: Date.now() - started }, failed > 0 ? 207 : 200);
});
