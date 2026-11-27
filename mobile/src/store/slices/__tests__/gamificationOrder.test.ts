// The XP on Today must not fall back after a completion: a progress read
// that started before complete_quest committed can answer after it.

import reducer, { fetchGamification, type GamificationState } from '../gamificationSlice';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

const row = (total_xp: number) => ({
  level: 1,
  total_xp,
  xp_today: total_xp,
  current_streak: 1,
  best_streak: 1,
  achievements: [],
});

function completion(total_xp: number, offline = false) {
  return {
    type: 'quests/complete/fulfilled',
    payload: {
      quest_id: 'q1',
      xp_awarded: 15,
      total_xp,
      level: 1,
      level_up: false,
      daily_score: 20,
      current_streak: 1,
      best_streak: 1,
      new_badges: [],
      completedAt: 0,
      offline,
    },
  };
}

const start = (id: string) => fetchGamification.pending(id, undefined);
const answer = (id: string, xp: number) => fetchGamification.fulfilled(row(xp), id, undefined);

describe('gamification XP ordering', () => {
  let s: GamificationState;
  beforeEach(() => {
    s = reducer(undefined, { type: 'init' });
  });

  it('shows the XP complete_quest returns right away', () => {
    s = reducer(s, completion(15));
    expect(s.totalXp).toBe(15);
    expect(s.xpToday).toBe(15);
  });

  it('drops an older read that answers after a newer one', () => {
    s = reducer(s, start('mount')); // Today opens: read before the tap
    s = reducer(s, start('after-complete')); // completeQuest refetches
    s = reducer(s, completion(15));
    s = reducer(s, answer('after-complete', 15));
    s = reducer(s, answer('mount', 0)); // stale row, answers last
    expect(s.totalXp).toBe(15);
    expect(s.loading).toBe(false);
  });

  it('drops an older read that answers before the newer one', () => {
    s = reducer(s, start('mount'));
    s = reducer(s, start('after-complete'));
    s = reducer(s, completion(15));
    s = reducer(s, answer('mount', 0));
    expect(s.totalXp).toBe(15);
    expect(s.loading).toBe(true);
    s = reducer(s, answer('after-complete', 15));
    expect(s.totalXp).toBe(15);
    expect(s.loading).toBe(false);
  });

  it('ignores completions saved offline (their XP is pending, not server)', () => {
    s = reducer(s, completion(999, true));
    expect(s.totalXp).toBe(0);
  });
});
