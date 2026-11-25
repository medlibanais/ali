import type { Quest } from '../../../api/types';
import type { RootState } from '../../../store';
import { buildTodayList } from '../../../store/selectors/today';
import { buildTimeProposal, minutesFromCoachMessage, planMinutesForDay, strongestTime, weekStart, type DayFocus } from '../logic';
import { selectDailyPlan } from '../selectors';

const DATE = '2026-01-04';

function quest(id: string, minutes: number | null, overrides: Partial<Quest> = {}): Quest {
  return {
    quest_id: id, predefined_id: null, pillar: 'health', title: id, description: '',
    difficulty: 'easy', xp_reward: 10, is_ai_generated: false, why_this_matters: null,
    time_estimate_minutes: minutes, assigned_date: DATE, completed: false,
    completed_at: null, skipped: false, priority: 1, ...overrides,
  };
}

describe('guided planning', () => {
  const week = { pillar: 'work', minutes: 30, busyDays: [6] } as const;

  it('keeps Monday-based plans attached to their week across years', () => {
    expect(weekStart(DATE)).toBe('2025-12-29');
    expect(weekStart(DATE, true)).toBe('2026-01-05');
    const plan = { ...week, busyDays: [6] };
    expect(planMinutesForDay(plan, DATE)).toBe(10);
    expect(planMinutesForDay(plan, '2026-01-05')).toBe(30);
  });

  it.each([
    ['I only have twenty minutes', 20],
    ['Je n’ai que 15 minutes', 15],
    ['عندي فقط ١٠ دقائق', 10],
    ['لدي ۲۰ دقيقة', 20],
    ['Did I spend 10 minutes yesterday?', null],
    ['I have 1200 minutes', null],
  ])('interprets explicit available time in %s', (message, minutes) => {
    expect(minutesFromCoachMessage(message)).toBe(minutes);
  });

  it('previews a focused plan from open quests with defensible time estimates', () => {
    const quests = [
      quest('priority', 8, { pillar: 'work' }), quest('short', 3),
      quest('quick', 2), quest('unknown', null), quest('done', 1, { completed: true }),
      quest('skipped', 1, { skipped: true }), quest('tomorrow', 1, { assigned_date: '2026-01-05' }),
    ];
    const proposal = buildTimeProposal(quests, DATE, 10, 'work');
    expect(proposal.selected.map((q) => q.quest_id)).toEqual(['priority', 'quick']);
    expect(proposal.deferred.map((q) => q.quest_id)).toEqual(['short', 'unknown']);
  });

  it('requires enough completions and a clear lead for a weekly suggestion', () => {
    expect(strongestTime({ morning: 4, afternoon: 1, evening: 0 })).toBeNull();
    expect(strongestTime({ morning: 3, afternoon: 3, evening: 0 })).toBeNull();
    expect(strongestTime({ morning: 4, afternoon: 2, evening: 1 }))
      .toEqual({ time: 'morning', count: 4, total: 7 });
  });

  it('accounts for time already spent on a busy day and keeps a focused list fixed', () => {
    const quests = [
      quest('done', 5, { completed: true }), quest('priority', 6, { pillar: 'work' }),
      quest('next', 3), quest('extra', 4),
    ];
    const state = (focus: DayFocus | null) => ({
      quests: { date: DATE, quests },
      planning: { data: { weeks: { [weekStart(DATE)]: { ...week, busyDays: [6] } }, focus, suggestion: null } },
    }) as unknown as RootState;

    const normal = selectDailyPlan(state({ date: '2026-01-03', kind: 'low', ids: ['extra'] }));
    expect(normal.focus).toBeNull();
    expect(normal.priority.map((q) => q.quest_id)).toEqual(['next']);
    const low = selectDailyPlan(state({ date: DATE, kind: 'low', ids: ['done', 'next'] }));
    expect(low.focused.map((q) => q.quest_id)).toEqual(['next']);
    expect(buildTodayList(quests, null, { ids: ['done', 'next'], focused: true }).ids).toEqual(['next']);
  });
});
