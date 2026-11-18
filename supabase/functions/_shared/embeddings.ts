// Quest embeddings with gte-small, the model built into Supabase Edge
// Functions. It runs inside the function, so there is no API key, no bill
// and no provider rate limit. Vectors are 384-dim, mean-pooled and
// normalized, so cosine similarity == dot product.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface AiSession {
  run(
    input: string,
    options: { mean_pool: boolean; normalize: boolean },
  ): Promise<number[]>;
}
declare const Supabase: { ai: { Session: new (model: string) => AiSession } };

export const EMBEDDING_DIM = 384;

let session: AiSession | null = null;
function getSession(): AiSession {
  if (!session) session = new Supabase.ai.Session('gte-small');
  return session;
}

export async function embed(text: string): Promise<number[]> {
  const vector = await getSession().run(text, { mean_pool: true, normalize: true });
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) {
    throw new Error(`embedding_bad_shape:${Array.isArray(vector) ? vector.length : typeof vector}`);
  }
  return vector;
}

export interface QuestText {
  id: string;
  pillar: string;
  title: string;
  description: string;
  tags: string[] | null;
}

/** The text a quest is embedded from: title, pillar, description, tags. */
export function questDocument(q: QuestText): string {
  const tags = (q.tags ?? []).map((t) => t.replace(/_/g, ' ')).join(', ');
  return `${q.title}. ${q.pillar} quest. ${q.description}${tags ? ` Tags: ${tags}.` : ''}`;
}

/** pgvector's text form: "[0.1,0.2,...]". */
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      // Back off 250 ms, 500 ms ... (model warm-up, a busy worker, a DB blip).
      await new Promise((r) => setTimeout(r, 250 * 2 ** i));
    }
  }
  throw last;
}

export interface EmbedReport {
  embedded: number;
  failed: number;
  remaining: number;
}

/**
 * Embeds up to `limit` quests whose embedding is null (new quests, or
 * ones whose text changed: the 0020 trigger clears their vector). Needs a
 * service-role client: users can only read predefined_quests.
 */
export async function embedMissing(
  admin: SupabaseClient,
  limit: number,
  force = false,
): Promise<EmbedReport> {
  let query = admin
    .from('predefined_quests')
    .select('id, pillar, title, description, tags')
    .order('id')
    .limit(limit);
  if (!force) query = query.is('embedding', null);
  const { data, error } = await query;
  if (error) throw new Error(`load_failed:${error.message}`);
  const rows = (data ?? []) as QuestText[];

  let embedded = 0;
  let failed = 0;
  // Small batches: inference is CPU-bound inside one worker, and edge
  // functions have a CPU budget per request.
  const BATCH = 8;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (q) => {
        const vector = await withRetry(() => embed(questDocument(q)));
        await withRetry(async () => {
          const { error: upErr } = await admin
            .from('predefined_quests')
            .update({ embedding: toPgVector(vector) })
            .eq('id', q.id);
          if (upErr) throw new Error(upErr.message);
        });
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') embedded++;
      else {
        failed++;
        console.error('embed failed', r.reason);
      }
    }
  }

  const { count } = await admin
    .from('predefined_quests')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);
  return { embedded, failed, remaining: count ?? 0 };
}
