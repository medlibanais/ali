import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  applyQueuedActions,
  cancelQueuedQuest,
  enqueueCompletion,
  enqueueUndo,
  estimateXp,
  isOfflineError,
  loadQuestsCache,
  localDateOf,
  readOfflineQueue,
  saveQuestsCache,
} from '../../lib/offlineQueue';
import { isOnline, reportOffline, reportOnline } from '../../lib/connectivity';
import { supabase } from '../../lib/supabase';
import type {
  CompleteQuestResponse,
  DailyQuestsResponse,
  Quest,
  SkipQuestResponse,
  UndoQuestResponse,
} from '../../api/types';
import type { Pillar } from '../../theme/tokens';
import { fetchGamification, type GamificationState } from './gamificationSlice';
import type { SyncState } from './syncSlice';
import { refreshPendingCompletions } from '../pendingCompletions';

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
  return localDateOf(new Date());
}

/** The parts of the root state the quest thunks read. */
export interface QuestThunkState {
  auth: { userId: string | null };
  gamification: GamificationState;
  sync: SyncState;
  quests: QuestsState;
}

/** An online completion that takes longer than this is treated as offline. */
const COMPLETE_TIMEOUT_MS = 12000;

export type CompleteQuestResult = CompleteQuestResponse & {
  completedAt: number;
  /** True when the completion was saved on the device, waiting to sync. */
  offline: boolean;
};

/** Mean of the pillar scores that have quests, like recompute_daily_score. */
function lifeScoreOf(state: QuestsState): number {
  const pillars = new Set(state.quests.filter((q) => !q.skipped).map((q) => q.pillar));
  if (pillars.size === 0) return state.dailyLifeScore;
  let sum = 0;
  pillars.forEach((p) => {
    sum += state.pillarScores[p] ?? 0;
  });
  return Math.round(sum / pillars.size);
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
  if (msg.includes('daily_completion_limit')) {
    return 'You reached today\'s limit of 15 completed quests. See you tomorrow.';
  }
  if (msg.includes('quest_not_today')) return 'This quest is from another day.';
  if (msg.includes('quest_skipped')) return 'This quest was skipped.';
  return fallback;
}

export const fetchDailyQuests = createAsyncThunk<
  DailyQuestsResponse,
  { silent?: boolean } | undefined,
  { rejectValue: string; state: QuestThunkState }
>('quests/fetchDaily', async (args, { dispatch, getState, rejectWithValue }) => {
  const userId = getState().auth?.userId ?? null;
  // Actions still waiting in the offline queue stay applied on screen.
  const withQueued = async (day: DailyQuestsResponse): Promise<DailyQuestsResponse> => {
    if (!userId) return day;
    return applyQueuedActions(day, await readOfflineQueue(userId));
  };
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
    reportOnline();

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

    return withQueued({
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
    });
  } catch (error) {
    if (isOfflineError(error)) reportOffline();
    // Offline: serve the last cached day so the app still works.
    const cached = await loadQuestsCache();
    if (cached && cached.date === todayLocal()) {
      return withQueued(cached);
    }
    return rejectWithValue(
      rpcError(error as { message?: string }, 'Could not load today\'s quests.'),
    );
  }
});

export const completeQuest = createAsyncThunk<
  CompleteQuestResult,
  Quest,
  { rejectValue: { questId: string; message: string }; state: QuestThunkState }
>('quests/complete', async (quest, { dispatch, getState, rejectWithValue }) => {
  const now = new Date();
  // Optimistic update; rolled back only if the server refuses for good.
  dispatch(questCompletedLocally(quest.quest_id));
  const userId = getState().auth.userId;

  const saveOffline = async (afterOnlineAttempt = false): Promise<CompleteQuestResult> => {
    const item = await enqueueCompletion({
      afterOnlineAttempt,
      questId: quest.quest_id,
      userId,
      at: now.toISOString(),
      xpEstimate: estimateXp(quest, now, getState().gamification.xpToday),
      title: quest.title,
      localDate: localDateOf(now),
    });
    await dispatch(refreshPendingCompletions());
    const gam = getState().gamification;
    return {
      quest_id: quest.quest_id,
      xp_awarded: item.xpEstimate,
      total_xp: gam.totalXp,
      level: gam.level,
      level_up: false,
      daily_score: getState().quests.dailyLifeScore,
      current_streak: gam.currentStreak,
      best_streak: gam.bestStreak,
      new_badges: [],
      completedAt: now.getTime(),
      offline: true,
    };
  };

  // Known offline, or older completions still waiting: queue behind them
  // so the server sees completions in the order they happened.
  if (!isOnline() || getState().sync.pending > 0) {
    return saveOffline();
  }

  let data: CompleteQuestResponse | null = null;
  let error: unknown = null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), COMPLETE_TIMEOUT_MS);
  try {
    const request = supabase.rpc('complete_quest', { p_quest_id: quest.quest_id });
    const res = await (controller ? request.abortSignal(controller.signal) : request);
    data = res.data as CompleteQuestResponse;
    error = res.error;
  } catch (e) {
    error = e;
  } finally {
    clearTimeout(timer);
  }
  if (error) {
    if (isOfflineError(error)) {
      // If the request did reach the server, the replay is a no-op there
      // (the quest is already completed), so nothing is counted twice.
      reportOffline();
      return saveOffline(true);
    }
    dispatch(questRolledBack(quest.quest_id));
    return rejectWithValue({
      questId: quest.quest_id,
      message: rpcError(error as { message?: string }, 'Could not complete this quest.'),
    });
  }
  reportOnline();
  // Server recomputed XP/level/streak/badges — sync the gamification slice.
  dispatch(fetchGamification());
  return { ...(data as CompleteQuestResponse), completedAt: now.getTime(), offline: false };
});

export const undoQuest = createAsyncThunk<
  UndoQuestResponse & { questId: string },
  string,
  { rejectValue: string; state: QuestThunkState }
>('quests/undo', async (questId, { dispatch, getState, rejectWithValue }) => {
  const now = new Date();
  const userId = getState().auth.userId;
  // Completion still on the device: the two cancel out.
  const queued = await cancelQueuedQuest(questId, userId);
  if (queued) {
    await dispatch(refreshPendingCompletions());
    return {
      quest_id: questId,
      xp_refunded: queued.xpEstimate,
      total_xp: getState().gamification.totalXp,
      questId,
    };
  }

  // The server has the completion: queue the undo for when we reconnect.
  const saveOffline = async () => {
    const { undo, lastCompleted, quests } = getState().quests;
    const xpRefund =
      undo?.questId === questId
        ? undo.xpAwarded
        : lastCompleted?.questId === questId
          ? lastCompleted.xpAwarded
          : 0;
    await enqueueUndo({
      questId,
      userId,
      at: now.toISOString(),
      xpRefund,
      title: quests.find((q) => q.quest_id === questId)?.title ?? '',
      localDate: localDateOf(now),
    });
    await dispatch(refreshPendingCompletions());
    return {
      quest_id: questId,
      xp_refunded: xpRefund,
      total_xp: getState().gamification.totalXp,
      questId,
    };
  };
  if (!isOnline() || getState().sync.pending > 0) {
    return saveOffline();
  }

  let data: UndoQuestResponse | null = null;
  let error: { message?: string } | null = null;
  let thrown: unknown = null;
  try {
    const res = await supabase.rpc('undo_quest_completion', { p_quest_id: questId });
    data = res.data as UndoQuestResponse;
    error = res.error;
  } catch (e) {
    thrown = e;
  }
  if (thrown || (error && isOfflineError(error))) {
    reportOffline();
    return saveOffline();
  }
  if (error) {
    return rejectWithValue(rpcError(error, 'The undo window has closed.'));
  }
  reportOnline();
  dispatch(fetchGamification());
  return { ...(data as UndoQuestResponse), questId };
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
    /** The server's answer wins over an optimistic change (sync conflicts). */
    questServerState(
      state,
      action: PayloadAction<{ questId: string; completed: boolean }>,
    ) {
      const quest = state.quests.find((q) => q.quest_id === action.payload.questId);
      if (quest) {
        quest.completed = action.payload.completed;
        if (!action.payload.completed) quest.completed_at = null;
      }
      if (state.undo?.questId === action.payload.questId) state.undo = null;
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
        // Saved offline: the server has not scored the day yet.
        if (action.payload.offline) {
          state.dailyLifeScore = lifeScoreOf(state);
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
  questServerState,
  undoCleared,
  questsErrorCleared,
} = questsSlice.actions;

export default questsSlice.reducer;
