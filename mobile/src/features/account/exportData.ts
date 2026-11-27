// "Export my data": everything this account owns, complete and in a stable
// order. PostgREST returns at most one page per request (1000 rows on the
// hosted project), so every list is read page by page with an explicit
// order (a unique key last, so rows never shift between pages). Every
// query filters on the signed-in account as well as relying on RLS. Any
// failed read stops the export and names the part that failed.

import { supabase } from '../../lib/supabase';

export const EXPORT_PAGE_SIZE = 500;

type Row = Record<string, unknown>;
interface PageResult {
  data: Row[] | null;
  error: { message: string } | null;
}
interface Ordered {
  order(column: string, options?: { ascending?: boolean }): Ordered;
  range(from: number, to: number): PromiseLike<PageResult>;
}

/** Thrown when one part of the export could not be read. */
export class ExportError extends Error {
  constructor(public readonly section: string, cause: string) {
    super(`${section}: ${cause}`);
    this.name = 'ExportError';
  }
}

/** Reads every page of an ordered query. */
export async function fetchAllPages(
  section: string,
  query: () => Ordered,
  order: string[],
  pageSize = EXPORT_PAGE_SIZE,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = query();
    for (const column of order) q = q.order(column, { ascending: true });
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new ExportError(section, error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function single(section: string, request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await request;
  if (error) throw new ExportError(section, error.message);
  return data ?? null;
}

export interface AccountExport {
  exported_at: string;
  account: { id: string; email: string | null };
  profile: unknown;
  goals: unknown;
  gamification: unknown;
  achievements: Row[];
  daily_scores: Row[];
  quests: Row[];
  completions: Row[];
  conversations: Row[];
  messages: Row[];
  counts: Record<string, number>;
}

export async function buildAccountExport(
  user: { id: string; email?: string | null },
  pageSize = EXPORT_PAGE_SIZE,
): Promise<AccountExport> {
  const uid = user.id;
  const own = (table: string, columns = '*') =>
    supabase.from(table).select(columns).eq('user_id', uid) as unknown as Ordered;

  const [profile, goals, gamification] = await Promise.all([
    single('profile', supabase.from('profiles').select('*').eq('id', uid).maybeSingle()),
    single('goals', supabase.from('user_goals').select('*').eq('user_id', uid).maybeSingle()),
    single('gamification', supabase.from('gamification').select('*').eq('user_id', uid).maybeSingle()),
  ]);
  // Sequential pages per table, tables in parallel.
  const [achievements, dailyScores, quests, completions, conversations, messages] =
    await Promise.all([
      fetchAllPages('achievements', () => own('achievements'), ['unlocked_at', 'id'], pageSize),
      fetchAllPages('daily_scores', () => own('daily_scores'), ['score_date'], pageSize),
      fetchAllPages('quests', () => own('quests'), ['assigned_date', 'id'], pageSize),
      fetchAllPages('completions', () => own('quest_completions'), ['completed_at', 'id'], pageSize),
      fetchAllPages('conversations', () => own('conversations'), ['created_at', 'id'], pageSize),
      // Messages have no user_id: filter through the owning conversation in
      // the same request instead of a huge `in (...)` list.
      fetchAllPages(
        'messages',
        () =>
          supabase
            .from('messages')
            .select('id, conversation_id, role, content, feedback, created_at, conversations!inner(user_id)')
            .eq('conversations.user_id', uid) as unknown as Ordered,
        ['created_at', 'id'],
        pageSize,
      ),
    ]);

  const cleanMessages = messages.map(({ conversations: _owner, ...m }) => m);
  return {
    exported_at: new Date().toISOString(),
    account: { id: uid, email: user.email ?? null },
    profile,
    goals,
    gamification,
    achievements,
    daily_scores: dailyScores,
    quests,
    completions,
    conversations,
    messages: cleanMessages,
    counts: {
      achievements: achievements.length,
      daily_scores: dailyScores.length,
      quests: quests.length,
      completions: completions.length,
      conversations: conversations.length,
      messages: cleanMessages.length,
    },
  };
}
