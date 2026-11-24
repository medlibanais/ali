import i18n from '../../i18n';
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
import { logout, sessionExpired } from './authSlice';
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
  dailyRequestId: string | null;
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
  dailyRequestId: null,
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
  if (msg.includes('undo_window_expired')) return i18n.t('questErrors.undoClosed');
  if (msg.includes('skip_limit_reached')) return i18n.t('questErrors.skipLimit');
  if (msg.includes('already_completed')) return i18n.t('questErrors.alreadyCompleted');
  if (msg.includes('not_authenticated')) return i18n.t('questErrors.sessionExpired');
  if (msg.includes('daily_completion_limit')) {
    return i18n.t('questErrors.dailyLimit');
  }
  if (msg.includes('quest_not_today')) return i18n.t('questErrors.otherDay');
  if (msg.includes('quest_skipped')) return i18n.t('questErrors.wasSkipped');
  if (msg.includes('rate_limited')) return i18n.t('questErrors.rateLimited');
  return fallback;
}

const pendingQuestGeneration = new Set<string>();

type FetchDailyArgs = { silent?: boolean; refreshAfterGeneration?: boolean };

export const fetchDailyQuests = createAsyncThunk<
  DailyQuestsResponse,
  FetchDailyArgs | undefined,
  { rejectValue: string; state: QuestThunkState }
>('quests/fetchDaily', async (args, { dispatch, getState, rejectWithValue }) => {
  const userId = getState().auth.userId;
  if (!userId) return rejectWithValue(i18n.t('errors.notSignedIn'));

  const date = todayLocal();
  const withQueued = async (day: DailyQuestsResponse): Promise<DailyQuestsResponse> =>
    applyQueuedActions(day, await readOfflineQueue(userId));
  try {
    const { error: assignError } = await supabase.rpc('assign_daily_quests', {
      p_date: date,
    });
    if (assignError) throw assignError;

    const [questsRes, scoreRes] = await Promise.all([
      supabase
        .from('quests')
        .select('*, quest_completions(id, completed_at, undone_at)')
        .eq('user_id', userId)
        .eq('assigned_date', date)
        .order('pillar')
        .order('priority'),
      supabase
        .from('daily_scores')
        .select('overall, health, family, work, fun, spirituality')
        .eq('user_id', userId)
        .eq('score_date', date)
        .maybeSingle(),
    ]);
    if (questsRes.error) throw questsRes.error;
    if (scoreRes.error) throw scoreRes.error;

    const quests = ((questsRes.data ?? []) as QuestRow[]).map(rowToQuest);
    const score = scoreRes.data;
    const day: DailyQuestsResponse = {
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
    reportOnline();
    saveQuestsCache(userId, day);

    const generationKey = `${userId}:${date}`;
    if (
      !args?.refreshAfterGeneration &&
      getState().auth.userId === userId &&
      !quests.some((q) => q.is_ai_generated) &&
      !pendingQuestGeneration.has(generationKey)
    ) {
      pendingQuestGeneration.add(generationKey);
      void supabase.functions
        .invoke<{ results?: Record<string, string> }>('generate-quests', { body: {} })
        .then(async ({ data, error }) => {
          const result = data?.results?.[userId];
          if (
            !error &&
            (result === 'already_done' || result?.startsWith('ok:')) &&
            getState().auth.userId === userId &&
            todayLocal() === date
          ) {
            await dispatch(fetchDailyQuests({ silent: true, refreshAfterGeneration: true }));
          }
        })
        .catch(() => undefined)
        .finally(() => pendingQuestGeneration.delete(generationKey));
    }

    return withQueued(day);
  } catch (error) {
    if (isOfflineError(error)) {
      reportOffline();
      const cached = loadQuestsCache(userId);
      if (cached?.date === date) return withQueued(cached);
    }
    return rejectWithValue(
      rpcError(error as { message?: string }, i18n.t('questErrors.loadFailed')),
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
    const message = (error as { message?: string }).message ?? '';
    if (message.includes('already_completed')) {
      // The server already has it (e.g. a retry after a dropped reply):
      // keep the tick and refresh XP instead of un-ticking it.
      dispatch(fetchGamification());
    } else {
      dispatch(questRolledBack(quest.quest_id));
    }
    return rejectWithValue({
      questId: quest.quest_id,
      message: rpcError(error as { message?: string }, i18n.t('questErrors.completeFailed')),
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
    return rejectWithValue(rpcError(error, i18n.t('questErrors.undoClosed')));
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
    return rejectWithValue(rpcError(error, i18n.t('questErrors.skipFailed')));
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
      .addCase(sessionExpired, () => initialState)
      .addCase(logout.fulfilled, () => initialState)
      .addCase(logout.rejected, () => initialState)
      .addCase(fetchDailyQuests.pending, (state, action) => {
        state.dailyRequestId = action.meta.requestId;
        state.error = null;
        state.refreshing = Boolean(action.meta.arg?.silent) && state.date !== null;
        state.loading = !state.refreshing;
      })
      .addCase(fetchDailyQuests.fulfilled, (state, action) => {
        if (state.dailyRequestId !== action.meta.requestId) return;
        state.dailyRequestId = null;
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
        if (state.dailyRequestId !== action.meta.requestId) return;
        state.dailyRequestId = null;
        state.loading = false;
        state.refreshing = false;
        state.error = action.payload ?? i18n.t('questErrors.loadFailed');
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
        state.error = action.payload?.message ?? i18n.t('questErrors.completeFailed');
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
        state.error = action.payload ?? i18n.t('questErrors.undoClosed');
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
        state.error = action.payload ?? i18n.t('questErrors.skipFailed');
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
