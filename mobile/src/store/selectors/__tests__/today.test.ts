import reducer, { questCompletedLocally, type QuestsState } from '../../slices/questsSlice';
import type { Quest } from '../../../api/types';
import type { RootState } from '../../index';
import {
  buildTodayList,
  sameTodayList,
  selectDayMood,
  selectPillarProgress,
  selectQuestById,
} from '../today';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../../lib/offlineQueue', () => ({}));

const quest = (id: string, pillar: Quest['pillar'], priority = 1): Quest => ({
  quest_id: id,
  predefined_id: null,
  pillar,
  title: id,
  description: '',
  difficulty: 'easy',
  xp_reward: 10,
  is_ai_generated: false,
  why_this_matters: null,
  time_estimate_minutes: null,
  assigned_date: '2026-11-14',
  completed: false,
  completed_at: null,
  skipped: false,
  priority,
});

const quests: QuestsState = {
  ...(reducer(undefined, { type: 'init' }) as QuestsState),
  date: '2026-11-14',
  pillarScores: { health: 40, family: 40, work: 40, fun: 40, spirituality: 40 },
  quests: [
    quest('h1', 'health', 1),
    quest('h2', 'health', 2),
    quest('w1', 'work', 1),
    quest('f1', 'fun', 1),
    quest('s1', 'spirituality', 1),
    quest('fa1', 'family', 1),
  ],
};
const root = (q: QuestsState) => ({ quests: q }) as unknown as RootState;

describe('Today selectors', () => {
  const after = reducer(quests, questCompletedLocally('h1'));

  it('keeps untouched quests by reference after a completion', () => {
    for (const id of ['h2', 'w1', 'f1', 's1', 'fa1']) {
      expect(selectQuestById(root(after), id)).toBe(selectQuestById(root(quests), id));
    }
    expect(selectQuestById(root(after), 'h1')).not.toBe(selectQuestById(root(quests), 'h1'));
  });

  it('counts done/total per pillar', () => {
    const p = selectPillarProgress(root(after));
    expect(p.health).toEqual({ done: 1, total: 2 });
    expect(p.work).toEqual({ done: 0, total: 1 });
  });

  it('keeps the mood until a threshold is crossed', () => {
    expect(selectDayMood(root(quests))).toBe('neutral');
    const nudged = { ...quests, pillarScores: { ...quests.pillarScores, health: 45 } };
    expect(selectDayMood(root(nudged))).toBe('neutral');
  });

  it('lists open quests first, capped at four for all pillars', () => {
    const list = buildTodayList(after.quests, null);
    expect(list.ids).toHaveLength(4);
    expect(list.ids).not.toContain('h1');
    expect(buildTodayList(after.quests, 'health').ids).toEqual(['h2', 'h1']);
    expect(sameTodayList(list, buildTodayList(after.quests, null))).toBe(true);
  });
});
