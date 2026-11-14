// Narrow selectors for the Today screen. Each piece of the screen subscribes
// only to the slice of state it draws, so completing one quest re-renders
// that quest's row and its pillar bubble, not the whole screen.
//
// Immer keeps every untouched quest object by reference when one quest
// changes, so selectQuestById returns the same object for the other rows
// and their React.memo checks skip them.

import { createSelector } from '@reduxjs/toolkit';
import type { Quest } from '../../api/types';
import { moodForScore, type Mood } from '../../avatar/types';
import { PILLARS, type Pillar } from '../../theme/tokens';
import type { RootState } from '../index';

/** Quests listed under the orbit before "See all quests". */
export const UP_NEXT_LIMIT = 4;

const selectQuestList = (state: RootState) => state.quests.quests;
const selectPillarScores = (state: RootState) => state.quests.pillarScores;

export const selectActiveQuests = createSelector([selectQuestList], (quests) =>
  quests.filter((q) => !q.skipped),
);

export const selectQuestById = (state: RootState, questId: string): Quest | undefined =>
  state.quests.quests.find((q) => q.quest_id === questId);

export const selectPillarScore = (state: RootState, pillar: Pillar): number =>
  state.quests.pillarScores[pillar] ?? 0;

export interface PillarProgress {
  done: number;
  total: number;
}

/** done/total per pillar, recomputed once per quest-list change. */
export const selectPillarProgress = createSelector([selectActiveQuests], (active) => {
  const out = {} as Record<Pillar, PillarProgress>;
  for (const pillar of PILLARS) out[pillar] = { done: 0, total: 0 };
  for (const q of active) {
    out[q.pillar].total += 1;
    if (q.completed) out[q.pillar].done += 1;
  }
  return out;
});

export const selectPillarDone = (state: RootState, pillar: Pillar): number =>
  selectPillarProgress(state)[pillar].done;

export const selectPillarTotal = (state: RootState, pillar: Pillar): number =>
  selectPillarProgress(state)[pillar].total;

/** The avatar's expression: a string, so it only changes at a threshold. */
export const selectDayMood = createSelector(
  [selectPillarScores],
  (scores): Mood =>
    moodForScore(PILLARS.reduce((sum, p) => sum + (scores[p] ?? 0), 0) / PILLARS.length),
);

export const selectDoneCount = (state: RootState): number =>
  selectActiveQuests(state).filter((q) => q.completed).length;

export const selectActiveCount = (state: RootState): number =>
  selectActiveQuests(state).length;

export const selectInitialLoading = (state: RootState): boolean =>
  state.quests.loading && state.quests.date === null;

export interface TodayList {
  /** Ids to show, open quests first, then done ones, by priority. */
  ids: string[];
  openCount: number;
  inScopeCount: number;
}

const byPriority = (a: Quest, b: Quest) => (a.priority ?? 1) - (b.priority ?? 1);

/** The quests listed under the orbit for all pillars, or the tapped one. */
export function buildTodayList(active: Quest[], pillar: Pillar | null): TodayList {
  const inScope = active.filter((q) => pillar === null || q.pillar === pillar);
  const open = inScope.filter((q) => !q.completed).sort(byPriority);
  const done = inScope.filter((q) => q.completed).sort(byPriority);
  const ids = [...open, ...done]
    .slice(0, pillar === null ? UP_NEXT_LIMIT : inScope.length)
    .map((q) => q.quest_id);
  return { ids, openCount: open.length, inScopeCount: inScope.length };
}

export const selectTodayList = (state: RootState, pillar: Pillar | null): TodayList =>
  buildTodayList(selectActiveQuests(state), pillar);

/** Equality for useAppSelector: same ids in the same order and same counts. */
export function sameTodayList(a: TodayList, b: TodayList): boolean {
  return (
    a.openCount === b.openCount &&
    a.inScopeCount === b.inScopeCount &&
    a.ids.length === b.ids.length &&
    a.ids.every((id, i) => id === b.ids[i])
  );
}
