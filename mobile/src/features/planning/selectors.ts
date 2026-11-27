import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { openForDay, pickWithin, planMinutesForDay, rankQuests, timeEstimate, weekStart } from './logic';

export const selectDailyPlan = createSelector(
  [(s: RootState) => s.quests.date, (s: RootState) => s.quests.quests, (s: RootState) => s.planning.data],
  (date, quests, data) => {
    const week = date ? weekStart(date) : null;
    const plan = week ? data.weeks[week] : undefined;
    const focus = date && data.focus?.date === date ? data.focus : null;
    const pending = date ? rankQuests(openForDay(quests, date), plan?.pillar) : [];
    const spent = plan ? quests.reduce((sum, quest) =>
      quest.assigned_date === date && quest.completed && !quest.skipped ? sum + (timeEstimate(quest) ?? 0) : sum, 0) : 0;
    const priority = plan && date ? pickWithin(pending, planMinutesForDay(plan, date) - spent) : [];
    const preferred = new Set(priority.map((q) => q.quest_id));
    const ordered = [...priority, ...pending.filter((q) => !preferred.has(q.quest_id))];
    const focused = focus ? focus.ids.flatMap((id) => pending.find((q) => q.quest_id === id) ?? []) : ordered;
    const action = data.suggestion?.week === week ? data.suggestion.action : null;
    return { date, plan, priority, ordered, focus, focused, action };
  },
);
