type SearchInput =
  | { query: string; limit: number }
  | { error: 'invalid_body' | 'query_too_short' | 'query_too_long' | 'invalid_limit' };

export function parseSearchInput(body: unknown): SearchInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'invalid_body' };
  }
  const { query: rawQuery, limit = 5 } = body as Record<string, unknown>;
  if (typeof rawQuery !== 'string') return { error: 'invalid_body' };
  const query = rawQuery.trim();
  if (query.length < 2) return { error: 'query_too_short' };
  if (query.length > 200) return { error: 'query_too_long' };
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    return { error: 'invalid_limit' };
  }
  return { query, limit };
}
