// search-quests: semantic search over the quest library.
// POST { query: string, limit?: number } with the user's JWT.
// 1. embeds the query with gte-small (built into Edge Functions, no key)
// 2. calls rpc search_quests(query_embedding) as the user, so RLS applies
// Returns the top quests with cosine similarity and a 0-100 relevance.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embed, embedMissing, toPgVector } from '../_shared/embeddings.ts';
import { relevanceFromSimilarity } from '../_shared/relevance.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_QUERY = 200;
const SELF_HEAL_LIMIT = 10;

interface Row {
  id: string;
  pillar: string;
  title: string;
  description: string;
  difficulty: string;
  xp_reward: number;
  time_estimate_minutes: number | null;
  similarity: number;
}

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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'invalid_session' }, 401);

  const body = (await req.json().catch(() => ({}))) as { query?: unknown; limit?: unknown };
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY) : '';
  if (query.length < 2) return json({ error: 'query_too_short' }, 400);
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.min(20, Math.max(1, Math.round(body.limit)))
      : 5;

  // Self-heal: a quest added or edited since the last generate-embeddings
  // run has a null vector and would be invisible. Embed a few per call.
  const admin = createClient(supabaseUrl, serviceKey);
  const { count: missing } = await admin
    .from('predefined_quests')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);
  if ((missing ?? 0) > 0) {
    await embedMissing(admin, SELF_HEAL_LIMIT).catch((e) => console.error('self-heal', e));
  }

  const t0 = performance.now();
  let vector: number[];
  try {
    vector = await embed(query);
  } catch (e) {
    console.error('embed query failed', e);
    return json({ error: 'embedding_unavailable' }, 503);
  }
  const t1 = performance.now();

  const { data, error } = await userClient.rpc('search_quests', {
    query_embedding: toPgVector(vector),
    match_count: limit,
  });
  const t2 = performance.now();
  if (error) return json({ error: 'search_failed', message: error.message }, 500);

  const results = ((data ?? []) as Row[]).map((r) => ({
    ...r,
    relevance: relevanceFromSimilarity(r.similarity),
  }));
  return json(
    {
      query,
      results,
      timings_ms: { embed: Math.round(t1 - t0), search: Math.round(t2 - t1) },
    },
    200,
  );
});
