// generate-insights: 2 human-readable behavioral insights for Insights.
//
// 1. Reads public.user_behavioral_patterns AS THE CALLER (their JWT), so
//    RLS and the view's auth.uid() pin apply; no service-role reads.
// 2. Asks Groq for exactly 2 insights grounded in those facts, validates
//    them (kind, length, must name the real weekday/pillar/time).
// 3. Falls back to template insights when Groq is off, rate-limited,
//    slow or off-data, so the screen always has something true to say.
// 4. Caches the result in public.pattern_insights (service role write):
//    reused for 24 h while the detected patterns stay the same, and never
//    regenerated more than once per 15 minutes per user.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callGroq, hasGroqKey } from '../_shared/llm.ts';
import {
  type BehavioralPatterns,
  buildPrompt,
  extractJsonArray,
  hasEnoughData,
  type PatternInsight,
  patternSignature,
  ruleBasedInsights,
  validateInsights,
} from '../_shared/patternInsights.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FRESH_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 15 * 60 * 1000;

type Source = 'ai' | 'rules' | 'none';

interface CachedRow {
  insights: PatternInsight[];
  patterns: Partial<BehavioralPatterns>;
  source: 'ai' | 'rules';
  generated_at: string;
}

interface Payload {
  status: 'ok' | 'not_enough_data';
  source: Source;
  cached: boolean;
  generatedAt: string;
  insights: PatternInsight[];
  patterns: BehavioralPatterns;
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
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'invalid_session' }, 401);

  let force = false;
  try {
    const body = (await req.json()) as { force?: unknown };
    force = body?.force === true;
  } catch {
    // Empty body is fine.
  }

  const [patternsRes, cacheRes] = await Promise.all([
    userClient.from('user_behavioral_patterns').select('*').maybeSingle(),
    userClient
      .from('pattern_insights')
      .select('insights, patterns, source, generated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  if (patternsRes.error) {
    console.error('generate-insights: view read failed', patternsRes.error.message);
    return json({ error: 'patterns_unavailable' }, 500);
  }
  const patterns = patternsRes.data as BehavioralPatterns | null;
  if (!patterns) return json({ error: 'profile_not_found' }, 404);

  const now = Date.now();
  if (!hasEnoughData(patterns)) {
    return json(
      payload('not_enough_data', 'none', false, new Date(now).toISOString(), [], patterns),
      200,
    );
  }

  const cache = (cacheRes.data ?? null) as CachedRow | null;
  if (cache) {
    const age = now - new Date(cache.generated_at).getTime();
    const sameFacts =
      patternSignature(cache.patterns as BehavioralPatterns) === patternSignature(patterns);
    const reuse =
      cache.source === 'ai' &&
      (age < COOLDOWN_MS || (!force && sameFacts && age < FRESH_MS));
    if (reuse) {
      return json(payload('ok', 'ai', true, cache.generated_at, cache.insights, patterns), 200);
    }
  }

  let insights: PatternInsight[] | null = null;
  let source: 'ai' | 'rules' = 'rules';
  // Reserve the model call first (migration 0045): parallel or repeated
  // requests past the budget get the rule-based insights instead.
  let modelAllowed = hasGroqKey();
  if (modelAllowed && serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { error: budgetError } = await admin.rpc('reserve_ai_call', {
      p_user: user.id,
      p_action: 'ai_insights',
      p_max: 6,
      p_window: '1 hour',
    });
    if (budgetError) {
      console.warn('generate-insights: model budget', budgetError.message);
      modelAllowed = false;
    }
  }
  if (modelAllowed) {
    const llm = await callGroq(
      [
        { role: 'system', content: buildPrompt(patterns) },
        { role: 'user', content: 'Write the 2 insights as a JSON array only.' },
      ],
      // One retry on 429/5xx/timeout, then the fallback model, then rules.
      { maxTokens: 400, temperature: 0.5, timeoutMs: 12000, retries: 1, useFallbackModel: true },
    );
    if (llm.ok) {
      insights = validateInsights(extractJsonArray(llm.text), patterns);
      if (!insights) console.warn('generate-insights: model output rejected');
    } else {
      console.warn('generate-insights: groq failed', llm.error);
    }
    if (insights) source = 'ai';
  }
  if (!insights) insights = ruleBasedInsights(patterns);

  const generatedAt = new Date(now).toISOString();
  if (serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { error } = await admin.from('pattern_insights').upsert({
      user_id: user.id,
      insights,
      patterns,
      source,
      generated_at: generatedAt,
    });
    if (error) console.error('generate-insights: cache write failed', error.message);
  }

  return json(payload('ok', source, false, generatedAt, insights, patterns), 200);
});

function payload(
  status: Payload['status'],
  source: Source,
  cached: boolean,
  generatedAt: string,
  insights: PatternInsight[],
  patterns: BehavioralPatterns,
): Payload {
  return { status, source, cached, generatedAt, insights, patterns };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
