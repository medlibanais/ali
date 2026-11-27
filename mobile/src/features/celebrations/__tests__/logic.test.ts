import type { Quest } from '../../../api/types';
import {
  baselineMarks,
  decideLevelUp,
  decidePerfectDay,
  isPerfectDay,
  particleCount,
} from '../logic';

const q = (id: string, completed: boolean, skipped = false): Quest => ({
  quest_id: id,
  predefined_id: null,
  pillar: 'health',
  title: id,
  description: '',
  difficulty: 'easy',
  xp_reward: 10,
  is_ai_generated: false,
  why_this_matters: null,
  time_estimate_minutes: null,
  assigned_date: '2026-11-15',
  completed,
  completed_at: null,
  skipped,
  priority: 1,
});

describe('decideLevelUp', () => {
  it('celebrates a higher level once, with the titles from levels.ts', () => {
    const first = decideLevelUp({ level: 10, perfectDay: null }, 11);
    expect(first.levelUp).toEqual({
      fromLevel: 10,
      toLevel: 11,
      fromTitle: 'Novice',
      toTitle: 'Disciplined Human',
      titleChanged: true,
    });
    expect(decideLevelUp(first.marks, 11).levelUp).toBeNull();
  });

  it('does not replay after an undo drops the level and it comes back', () => {
    const { marks } = decideLevelUp({ level: 3, perfectDay: null }, 4);
    const dropped = decideLevelUp(marks, 3);
    expect(dropped.levelUp).toBeNull();
    expect(decideLevelUp(dropped.marks, 4).levelUp).toBeNull();
  });

  it('keeps the title when it does not change', () => {
    expect(decideLevelUp({ level: 2, perfectDay: null }, 3).levelUp?.titleChanged).toBe(false);
  });
});

describe('baselineMarks', () => {
  it('never lowers a stored mark and adopts a higher live level silently', () => {
    expect(baselineMarks({ level: 7, perfectDay: '2026-11-14' }, 5)).toEqual({
      level: 7,
      perfectDay: '2026-11-14',
    });
    expect(baselineMarks(null, 9)).toEqual({ level: 9, perfectDay: null });
  });
});

describe('Perfect Day', () => {
  it('needs every active quest done and at least three of them', () => {
    expect(isPerfectDay([q('a', true), q('b', true)])).toBe(false);
    expect(isPerfectDay([q('a', true), q('b', true), q('c', false)])).toBe(false);
    expect(isPerfectDay([q('a', true), q('b', true), q('c', true), q('d', false, true)])).toBe(true);
  });

  it('fires once per date', () => {
    const done = [q('a', true), q('b', true), q('c', true)];
    const first = decidePerfectDay({ level: 1, perfectDay: null }, '2026-11-15', done);
    expect(first.perfect).toBe(true);
    expect(decidePerfectDay(first.marks, '2026-11-15', done).perfect).toBe(false);
    expect(decidePerfectDay(first.marks, '2026-11-16', done).perfect).toBe(true);
  });
});

describe('particleCount', () => {
  it('scales with XP between 6 and 14', () => {
    expect(particleCount(0)).toBe(0);
    expect(particleCount(10)).toBe(6);
    expect(particleCount(35)).toBe(9);
    expect(particleCount(500)).toBe(14);
  });
});
