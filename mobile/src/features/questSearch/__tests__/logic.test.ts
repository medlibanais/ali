import {
  normalizeQuery,
  parseSearchResponse,
  relevanceBand,
  relevanceLabel,
} from '../logic';

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  relaxing   things\nwith my mom ')).toBe('relaxing things with my mom');
  });
  it('returns empty for queries under 3 characters', () => {
    expect(normalizeQuery(' mo ')).toBe('');
  });
  it('caps very long input at 200 characters', () => {
    expect(normalizeQuery('a'.repeat(500))).toHaveLength(200);
  });
});

describe('parseSearchResponse', () => {
  const good = {
    id: 'q1',
    pillar: 'family',
    title: 'Call Your Mother',
    description: 'Call Mom and talk for at least 10 minutes.',
    difficulty: 'easy',
    xp_reward: 10,
    time_estimate_minutes: 15,
    similarity: 0.86,
    relevance: 75,
  };

  it('maps rows to camelCase results', () => {
    expect(parseSearchResponse({ results: [good] })).toEqual([
      {
        id: 'q1',
        pillar: 'family',
        title: 'Call Your Mother',
        description: 'Call Mom and talk for at least 10 minutes.',
        difficulty: 'easy',
        xpReward: 10,
        timeEstimateMinutes: 15,
        similarity: 0.86,
        relevance: 75,
      },
    ]);
  });

  it('drops malformed rows and clamps relevance', () => {
    const rows = parseSearchResponse({
      results: [good, { ...good, pillar: 'gaming' }, null, { ...good, id: 'q2', relevance: 140 }],
    });
    expect(rows.map((r) => r.id)).toEqual(['q1', 'q2']);
    expect(rows[1].relevance).toBe(100);
  });

  it('returns [] for unexpected bodies', () => {
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse({ results: 'nope' })).toEqual([]);
  });
});

describe('relevance', () => {
  it('bands and labels', () => {
    expect(relevanceBand(85)).toBe('strong');
    expect(relevanceBand(50)).toBe('good');
    expect(relevanceBand(10)).toBe('weak');
    expect(relevanceLabel(74.6)).toBe('75% relevant');
  });
});
