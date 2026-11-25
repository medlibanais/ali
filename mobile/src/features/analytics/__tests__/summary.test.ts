jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { summarizePeriod, useScoresRange, type DayScore } from '../api';

function day(date: string, overrides: Partial<DayScore> = {}): DayScore {
  return {
    date,
    overall: 50,
    health: 50,
    family: 50,
    work: 50,
    fun: 50,
    spirituality: 50,
    assigned: 4,
    completed: 2,
    skipped: 0,
    xp: 100,
    ...overrides,
  };
}

it('scopes personal score requests and cache keys to the signed-in account', async () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  (supabase.from as jest.Mock).mockReturnValue(query);

  useScoresRange('account-a', '2026-10-01', '2026-10-31');
  const [options] = (useQuery as jest.Mock).mock.calls[0];
  expect(options.queryKey).toContain('account-a');
  await expect(options.queryFn()).resolves.toEqual([]);
  expect(supabase.from).toHaveBeenCalledWith('daily_scores');
  expect(query.eq).toHaveBeenCalledWith('user_id', 'account-a');
  expect(query.gte).toHaveBeenCalledWith('score_date', '2026-10-01');
  expect(query.lte).toHaveBeenCalledWith('score_date', '2026-10-31');
});

describe('summarizePeriod', () => {
  it('handles an empty period', () => {
    const s = summarizePeriod([], []);
    expect(s.avgScore).toBe(0);
    expect(s.prevAvgScore).toBeNull();
    expect(s.completionRate).toBe(0);
    expect(s.strongest).toBeNull();
    expect(s.weakest).toBeNull();
    expect(s.bestWeekday).toBeNull();
  });

  it('averages only days that had quests', () => {
    const s = summarizePeriod(
      [day('2026-10-19', { overall: 80 }), day('2026-10-20', { overall: 0, assigned: 0, completed: 0 })],
      [day('2026-10-12', { overall: 40 })],
    );
    expect(s.avgScore).toBe(80);
    expect(s.prevAvgScore).toBe(40);
    expect(s.activeDays).toBe(1);
    expect(s.totalDays).toBe(2);
  });

  it('finds strongest and weakest pillars', () => {
    const s = summarizePeriod([day('2026-10-19', { health: 90, fun: 10 })], []);
    expect(s.strongest?.pillar).toBe('health');
    expect(s.weakest?.pillar).toBe('fun');
  });

  it('has no weakest pillar when all are equal', () => {
    const s = summarizePeriod([day('2026-10-19')], []);
    expect(s.weakest).toBeNull();
  });

  it('reports the best weekday once three weekdays have data', () => {
    // 2026-10-19 is a Monday
    const s = summarizePeriod(
      [
        day('2026-10-19', { overall: 40 }),
        day('2026-10-20', { overall: 90 }),
        day('2026-10-21', { overall: 60 }),
      ],
      [],
    );
    expect(s.bestWeekday).toBe(2);
    expect(s.completionRate).toBe(50);
  });
});
