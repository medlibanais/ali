// search-quests: semantic search over the quest library.
// POST { query: string, limit?: number } with the user's JWT.
// Validates and rate-limits each authenticated caller before embedding the
// query, then searches the catalog as the user so RLS applies.
// Returns the top quests with cosine similarity and a 0-100 relevance.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embed, embedMissing, toPgVector } from '../_shared/embeddings.ts';
import { relevanceFromSimilarity } from '../_shared/relevance.ts';
import { parseSearchInput } from './input.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  const input = parseSearchInput(await req.json().catch(() => null));
  if ('error' in input) return json(input, 400);
  const { query, limit } = input;

  const admin = createClient(supabaseUrl, serviceKey);
  const { error: rateError } = await admin.rpc('reserve_quest_search', { p_user: user.id });
  if (rateError) {
    if (rateError.code === 'P0001' && rateError.message === 'rate_limited') {
      return json({ error: 'rate_limited' }, 429);
    }
    console.error('quest search rate limit failed', rateError.code);
    return json({ error: 'search_unavailable' }, 503);
  }

  // Embed a few recently added or edited catalog entries with missing vectors.
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
  if (error) {
    console.error('quest search failed', error.code);
    return json({ error: 'search_failed' }, 500);
  }

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
