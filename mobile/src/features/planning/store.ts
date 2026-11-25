import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { readJson, writeJson } from '../../lib/kvStore';
import type { AppDispatch, RootState } from '../../store';
import { buildTimeProposal, weekStart, type DayFocus, type TimeProposal, type WeeklyAction, type WeeklyPlan } from './logic';

interface PlanningData {
  weeks: Record<string, WeeklyPlan>;
  focus: DayFocus | null;
  suggestion: { week: string; action: WeeklyAction | null } | null;
}

const empty: PlanningData = { weeks: {}, focus: null, suggestion: null };
const cacheKey = (userId: string) => `grow.planning.v1.${userId}`;

const planning = createSlice({
  name: 'planning',
  initialState: { owner: null as string | null, data: empty },
  reducers: {
    loaded(_state, action: PayloadAction<{ owner: string; data: PlanningData }>) {
      return action.payload;
    },
    edited(state, action: PayloadAction<PlanningData>) {
      state.data = action.payload;
    },
  },
});

export default planning.reducer;

const savedData = (id: string): PlanningData =>
  readJson<PlanningData>(cacheKey(id)) ?? empty;

export const loadPlanning = () => (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState();
  const owner = state.auth.userId;
  if (owner && owner !== state.planning.owner) {
    dispatch(planning.actions.loaded({ owner, data: savedData(owner) }));
  }
};

function updatePlanning(edit: (data: PlanningData) => PlanningData) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const owner = state.auth.userId;
    if (!owner) return false;
    const current = state.planning.owner === owner ? state.planning.data : savedData(owner);
    const data = edit(current);
    if (state.planning.owner === owner) {
      dispatch(planning.actions.edited(data));
    } else {
      dispatch(planning.actions.loaded({ owner, data }));
    }
    writeJson(cacheKey(owner), data);
    return true;
  };
}

export const saveWeek = (week: string, plan: WeeklyPlan) =>
  updatePlanning((data) => ({
    ...data,
    weeks: Object.fromEntries(Object.entries({ ...data.weeks, [week]: plan })
      .sort(([a], [b]) => a.localeCompare(b)).slice(-3)),
  }));

export const setDayFocus = (focus: DayFocus | null) =>
  updatePlanning((data) => ({ ...data, focus }));

export const answerWeeklyAction = (week: string, action: WeeklyAction | null) =>
  updatePlanning((data) => ({ ...data, suggestion: { week, action } }));

export const applyCoachProposal = (proposal: TimeProposal) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const { quests, planning: { data } } = getState();
    if (quests.date !== proposal.date || proposal.selected.length === 0) return false;
    const current = buildTimeProposal(
      quests.quests, proposal.date, proposal.minutes, data.weeks[weekStart(proposal.date)]?.pillar,
    );
    const ids = proposal.selected.map((q) => q.quest_id);
    if (current.selected.length !== ids.length ||
        current.selected.some((q, i) => q.quest_id !== ids[i]) ||
        current.deferred.length !== proposal.deferred.length ||
        current.deferred.some((q, i) => q.quest_id !== proposal.deferred[i].quest_id)) return false;
    return dispatch(setDayFocus({ date: proposal.date, kind: 'coach', minutes: proposal.minutes, ids }));
  };
