// Export: complete across pages, stable order, only the requesting
// account's rows, and failures surface instead of a partial file.

import { buildAccountExport, ExportError } from '../exportData';

type Row = Record<string, unknown>;
const PAGE_CAP = 1000; // what the hosted PostgREST returns at most
const mockDb: Record<string, Row[]> = {};
const mockRanges: string[] = [];
let mockFailTable: string | null = null;

jest.mock('../../../lib/supabase', () => {
  const query = (table: string) => {
    const filters: [string, unknown][] = [];
    const orders: string[] = [];
    const rows = () => {
      let out = (mockDb[table] ?? []).filter((r) =>
        filters.every(([col, v]) =>
          col === 'conversations.user_id'
            ? (mockDb.conversations ?? []).some((c) => c.id === r.conversation_id && c.user_id === v)
            : r[col] === v,
        ),
      );
      out = [...out].sort((a, b) => {
        for (const o of orders) {
          const x = String(a[o]);
          const y = String(b[o]);
          if (x !== y) return x < y ? -1 : 1;
        }
        return 0;
      });
      return out;
    };
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, v: unknown) => {
      filters.push([col, v]);
      return b;
    };
    b.order = (col: string) => {
      orders.push(col);
      return b;
    };
    b.range = (from: number, to: number) => {
      mockRanges.push(`${table}:${from}-${to}`);
      if (table === mockFailTable) {
        return Promise.resolve({ data: null, error: { message: 'timeout' } });
      }
      const page = rows().slice(from, Math.min(to + 1, from + PAGE_CAP));
      return Promise.resolve({ data: page, error: null });
    };
    b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
    return b;
  };
  return { supabase: { from: query } };
});

const ME = 'me';
const OTHER = 'other';

function seed() {
  for (const k of Object.keys(mockDb)) delete mockDb[k];
  const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  mockDb.profiles = [{ id: ME, first_name: 'Me' }, { id: OTHER, first_name: 'Other' }];
  // 1,203 quests for me (several share a date, so the id breaks ties).
  mockDb.quests = [
    ...Array.from({ length: 1203 }, (_, i) => ({ id: `q${String(i).padStart(5, '0')}`, user_id: ME, assigned_date: day(Math.floor(i / 3)) })),
    ...Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, user_id: OTHER, assigned_date: day(i) })),
  ];
  mockDb.daily_scores = Array.from({ length: 401 }, (_, i) => ({ user_id: ME, score_date: day(i) }));
  mockDb.quest_completions = Array.from({ length: 1100 }, (_, i) => ({ id: `c${String(i).padStart(5, '0')}`, user_id: i % 10 === 0 ? OTHER : ME, completed_at: `${day(i % 300)}T08:00:00Z` }));
  mockDb.conversations = [{ id: 'conv-me', user_id: ME, created_at: '2025-01-01' }, { id: 'conv-other', user_id: OTHER, created_at: '2025-01-01' }];
  mockDb.messages = [
    ...Array.from({ length: 1050 }, (_, i) => ({ id: `m${String(i).padStart(5, '0')}`, conversation_id: 'conv-me', created_at: `2025-02-01T00:00:${String(i % 60).padStart(2, '0')}Z` })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, conversation_id: 'conv-other', created_at: '2025-02-01T00:00:00Z' })),
  ];
  mockDb.achievements = [{ id: 'a1', user_id: ME, unlocked_at: '2025-01-02' }, { id: 'a2', user_id: OTHER, unlocked_at: '2025-01-02' }];
}

beforeEach(() => {
  seed();
  mockRanges.length = 0;
  mockFailTable = null;
});

it('exports every row past one API page, in a stable order, for this account only', async () => {
  const out = await buildAccountExport({ id: ME, email: 'me@x.test' });
  expect(out.counts).toEqual({
    achievements: 1, daily_scores: 401, quests: 1203, completions: 990, conversations: 1, messages: 1050,
  });
  // Nothing from the other account.
  const all = [...out.quests, ...out.completions, ...out.achievements, ...out.daily_scores];
  expect(all.every((r) => r.user_id === ME)).toBe(true);
  expect(out.messages.every((m) => m.conversation_id === 'conv-me')).toBe(true);
  // No duplicates, and ordered by date then id.
  const ids = out.quests.map((q) => q.id);
  expect(new Set(ids).size).toBe(1203);
  expect(ids).toEqual([...ids].sort());
  // Read in pages of 500, so 1,203 quests took three requests.
  expect(mockRanges.filter((r) => r.startsWith('quests:'))).toEqual([
    'quests:0-499', 'quests:500-999', 'quests:1000-1499',
  ]);
  expect((out.profile as Row).first_name).toBe('Me');
});

it('stops with the failing part named instead of sharing a partial export', async () => {
  mockFailTable = 'messages';
  await expect(buildAccountExport({ id: ME })).rejects.toBeInstanceOf(ExportError);
  await expect(buildAccountExport({ id: ME })).rejects.toThrow('messages: timeout');
});
