import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  dequeueCompletion,
  enqueueCompletion,
  isOfflineError,
  loadQuestsCache,
  readCompletionQueue,
  saveQuestsCache,
} from '../../lib/offlineQueue';
import { supabase } from '../../lib/supabase';
import type {
  CompleteQuestResponse,
  DailyQuestsResponse,
  Quest,
  SkipQuestResponse,
  UndoQuestResponse,
} from '../../api/types';
import type { Pillar } from '../../theme/tokens';
import { fetchGamification } from './gamificationSlice';

export const DAILY_SKIP_LIMIT = 3;
export const UNDO_WINDOW_MS = 10000;

export interface UndoState {
  questId: string;
  xpAwarded: number;
  deadline: number;
}

export interface QuestsState {
  date: string | null;
  dailyLifeScore: number;
  pillarScores: Partial<Record<Pillar, number>>;
  quests: Quest[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  skipsUsed: number;
  undo: UndoState | null;
  lastCompleted: { questId: string; xpAwarded: number; at: number } | null;
  completingId: string | null;
}

const initialState: QuestsState = {
  date: null,
  dailyLifeScore: 0,
  pillarScores: {},
  quests: [],
  loading: false,
  refreshing: false,
  error: null,
  skipsUsed: 0,
  undo: null,
  lastCompleted: null,
  completingId: null,
};

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface QuestRow {
  id: string;
  predefined_id: string | null;
  pillar: Pillar;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  xp_reward: number;
  is_ai_generated: boolean;
  why_this_matters: string | null;
  time_estimate_minutes: number | null;
  assigned_date: string;
  skipped: boolean;
  priority: number;
  quest_completions: { id: string; completed_at: string; undone_at: string | null }[];
}

function rowToQuest(row: QuestRow): Quest {
  const live = row.quest_completions?.find((c) => c.undone_at === null);
  return {
    quest_id: row.id,
    predefined_id: row.predefined_id,
    pillar: row.pillar,
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    xp_reward: row.xp_reward,
    is_ai_generated: row.is_ai_generated,
    why_this_matters: row.why_this_matters,
    time_estimate_minutes: row.time_estimate_minutes ?? null,
    assigned_date: row.assigned_date,
    completed: Boolean(live),
    completed_at: live?.completed_at ?? null,
    skipped: row.skipped,
    priority: row.priority,
  };
}

function rpcError(error: { message?: string } | null, fallback: string): string {
  const msg = error?.message ?? '';
  if (msg.includes('undo_window_expired')) return 'The undo window has closed.';
  if (msg.includes('skip_limit_reached')) return 'You can skip 3 quests per day.';
  if (msg.includes('already_completed')) return 'This quest is already completed.';
  if (msg.includes('not_authenticated')) return 'Your session expired. Sign in again.';
  return fallback;
}

export const fetchDailyQuests = createAsyncThunk<
  DailyQuestsResponse,
  { silent?: boolean } | undefined,
  { rejectValue: string }
>('quests/fetchDaily', async (args, { dispatch, rejectWithValue }) => {
  try {
    const date = todayLocal();
    // Ensure today's quests exist (personalized assignment, no repeats).
    const { error: assignError } = await supabase.rpc('assign_daily_quests', {
      p_date: date,
    });
    if (assignError) throw assignError;

    const [questsRes, scoreRes] = await Promise.all([
      supabase
        .from('quests')
        .select('*, quest_completions(id, completed_at, undone_at)')
        .eq('assigned_date', date)
        .order('pillar')
        .order('priority'),
      supabase
        .from('daily_scores')
        .select('*')
        .eq('score_date', date)
        .maybeSingle(),
    ]);
    if (questsRes.error) throw questsRes.error;

    const quests = ((questsRes.data ?? []) as QuestRow[]).map(rowToQuest);
    const score = scoreRes.data;

    // Fresh copy for offline days.
    saveQuestsCache({
      date,
      daily_life_score: score?.overall ?? 0,
      pillars: score
        ? {
            health: score.health,
            family: score.family,
            work: score.work,
            fun: score.fun,
            spirituality: score.spirituality,
          }
        : {},
      quests,
    }).catch(() => undefined);

    // Coach picks arrive a moment later: generate in the background and
    // refresh silently. Idempotent server-side (one log row per day).
    if (!quests.some((q) => q.is_ai_generated)) {
      supabase.functions
        .invoke('generate-quests', { body: {} })
        .then(() => {
          dispatch(fetchDailyQuests({ silent: true }));
        })
        .catch(() => undefined);
    }

    return {
      date,
      daily_life_score: score?.overall ?? 0,
      pillars: score
        ? {
            health: score.health,
            family: score.family,
            work: score.work,
            fun: score.fun,
            spirituality: score.spirituality,
          }
        : {},
      quests,
    };
  } catch (error) {
    // Offline: serve the last cached day so the app still works.
    const cached = await loadQuestsCache();
    if (cached && cached.date === todayLocal()) {
      return cached;
    }
    return rejectWithValue(
      rpcError(error as { message?: string }, 'Could not load today\'s quests.'),
    );
  }
});

export const completeQuest = createAsyncThunk<
  CompleteQuestResponse & { completedAt: number },
  Quest,
  { rejectValue: { questId: string; message: string } }
>('quests/complete', async (quest, { dispatch, rejectWithValue }) => {
  // Optimistic update; rollback on failure.
  dispatch(questCompletedLocally(quest.quest_id));
  let data: CompleteQuestResponse | null = null;
  let error: unknown = null;
  try {
    const res = await supabase.rpc('complete_quest', {
      p_quest_id: quest.quest_id,
    });
    data = res.data as CompleteQuestResponse;
    error = res.error;
  } catch (e) {
    error = e;
  }
  if (error) {
    // Offline: keep the optimistic completion, sync when we're back.
    if (isOfflineError(error)) {
      await enqueueCompletion(quest.quest_id);
      dispatch(fetchGamification());
      return {
        quest_id: quest.quest_id,
        xp_awarded: quest.xp_reward,
        total_xp: 0,
        level: 1,
        level_up: false,
        daily_score: 0,
        current_streak: 0,
        best_streak: 0,
        new_badges: [],
        completedAt: Date.now(),
        offline: true,
      } as CompleteQuestResponse & { completedAt: number; offline: boolean };
    }
    dispatch(questRolledBack(quest.quest_id));
    return rejectWithValue({
      questId: quest.quest_id,
      message: rpcError(error as { message?: string }, 'Could not complete this quest.'),
    });
  }
  // Server recomputed XP/level/streak/badges — sync the gamification slice.
  dispatch(fetchGamification());
  return { ...(data as CompleteQuestResponse), completedAt: Date.now() };
});

export const undoQuest = createAsyncThunk<
  UndoQuestResponse & { questId: string },
  string,
  { rejectValue: string }
>('quests/undo', async (questId, { dispatch, rejectWithValue }) => {
  const { data, error } = await supabase.rpc('undo_quest_completion', {
    p_quest_id: questId,
  });
  if (error) {
    return rejectWithValue(rpcError(error, 'The undo window has closed.'));
  }
  dispatch(fetchGamification());
  return { ...(data as UndoQuestResponse), questId };
});

/** Replays queued offline completions once we're back online. */
export const drainCompletionQueue = createAsyncThunk<
  { synced: number },
  void
>('quests/drainQueue', async (_, { dispatch }) => {
  const queue = await readCompletionQueue();
  let synced = 0;
  for (const item of queue) {
    try {
      const { error } = await supabase.rpc('complete_quest', {
        p_quest_id: item.questId,
      });
      if (!error) {
        await dequeueCompletion(item.questId);
        synced += 1;
      } else {
        break; // still offline or server unhappy — retry next launch
      }
    } catch {
      break;
    }
  }
  if (synced > 0) {
    dispatch(fetchDailyQuests({ silent: true }));
    dispatch(fetchGamification());
  }
  return { synced };
});

export const skipQuest = createAsyncThunk<
  SkipQuestResponse,
  string,
  { rejectValue: string }
>('quests/skip', async (questId, { rejectWithValue }) => {
  const { data, error } = await supabase.rpc('skip_quest', {
    p_quest_id: questId,
  });
  if (error) {
    return rejectWithValue(rpcError(error, 'Could not skip this quest.'));
  }
  return data as SkipQuestResponse;
});

const questsSlice = createSlice({
  name: 'quests',
  initialState,
  reducers: {
    questCompletedLocally(state, action: PayloadAction<string>) {
      const quest = state.quests.find((q) => q.quest_id === action.payload);
      if (quest) {
        quest.completed = true;
        quest.completed_at = new Date().toISOString();
      }
      state.completingId = action.payload;
    },
    questRolledBack(state, action: PayloadAction<string>) {
      const quest = state.quests.find((q) => q.quest_id === action.payload);
      if (quest) {
        quest.completed = false;
        quest.completed_at = null;
      }
      state.completingId = null;
    },
    undoCleared(state) {
      state.undo = null;
    },
    questsErrorCleared(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDailyQuests.pending, (state, action) => {
        state.error = null;
        if (action.meta.arg?.silent) {
          state.refreshing = true;
        } else {
          state.loading = true;
        }
      })
      .addCase(fetchDailyQuests.fulfilled, (state, action) => {
        state.loading = false;
        state.refreshing = false;
        if (state.date !== null && state.date !== action.payload.date) {
          state.undo = null;
          state.lastCompleted = null;
        }
        state.date = action.payload.date;
        state.skipsUsed = action.payload.quests.filter((q) => q.skipped).length;
        state.dailyLifeScore = action.payload.daily_life_score;
        state.pillarScores = action.payload.pillars ?? {};
        state.quests = action.payload.quests;
      })
      .addCase(fetchDailyQuests.rejected, (state, action) => {
        state.loading = false;
        state.refreshing = false;
        state.error = action.payload ?? 'Could not load today\'s quests.';
      })
      .addCase(completeQuest.fulfilled, (state, action) => {
        state.completingId = null;
        if (typeof action.payload.daily_score === 'number') {
          state.dailyLifeScore = action.payload.daily_score;
        }
        state.undo = {
          questId: action.payload.quest_id,
          xpAwarded: action.payload.xp_awarded,
          deadline: action.payload.completedAt + UNDO_WINDOW_MS,
        };
        state.lastCompleted = {
          questId: action.payload.quest_id,
          xpAwarded: action.payload.xp_awarded,
          at: action.payload.completedAt,
        };
        // Pillar scores shift as one pillar completes — refetch to stay exact.
        const quest = state.quests.find(
          (q) => q.quest_id === action.payload.quest_id,
        );
        if (quest) {
          const remaining = state.quests.filter(
            (q) => q.pillar === quest.pillar && !q.skipped,
          );
          const done = remaining.filter((q) => q.completed).length;
          if (remaining.length > 0) {
            state.pillarScores[quest.pillar] = Math.round(
              (100 * done) / remaining.length,
            );
          }
        }
      })
      .addCase(completeQuest.rejected, (state, action) => {
        state.completingId = null;
        state.error = action.payload?.message ?? 'Could not complete this quest.';
      })
      .addCase(undoQuest.fulfilled, (state, action) => {
        const quest = state.quests.find(
          (q) => q.quest_id === action.payload.questId,
        );
        if (quest) {
          quest.completed = false;
          quest.completed_at = null;
        }
        state.undo = null;
        state.lastCompleted = null;
      })
      .addCase(undoQuest.rejected, (state, action) => {
        state.undo = null;
        state.error = action.payload ?? 'The undo window has closed.';
      })
      .addCase(skipQuest.fulfilled, (state, action) => {
        const quest = state.quests.find(
          (q) => q.quest_id === action.payload.quest_id,
        );
        if (quest) {
          quest.skipped = true;
        }
        state.skipsUsed = action.payload.skips_used;
      })
      .addCase(skipQuest.rejected, (state, action) => {
        state.error = action.payload ?? 'Could not skip this quest.';
      });
  },
});

export const {
  questCompletedLocally,
  questRolledBack,
  undoCleared,
  questsErrorCleared,
} = questsSlice.actions;

export default questsSlice.reducer;
