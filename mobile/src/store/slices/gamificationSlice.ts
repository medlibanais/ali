import i18n from '../../i18n';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { supabase } from '../../lib/supabase';
import {
  DAILY_XP_CAP,
  cumulativeXpForLevel,
  levelForXp,
  titleForLevel,
  xpToNextLevel,
} from '../../lib/levels';
import type { Achievement } from '../../api/types';

export { titleForLevel };

export interface GamificationState {
  level: number;
  totalXp: number;
  xpToday: number;
  xpToNextLevel: number | null;
  nextLevel: number | null;
  currentStreak: number;
  bestStreak: number;
  achievements: Achievement[];
  currentTitle: string | null;
  loading: boolean;
  error: string | null;
  /** Server truth from the last fetch; displayed values add pending XP. */
  serverTotalXp: number;
  serverXpToday: number;
  serverLevel: number;
  /** Optimistic XP of completions still in the offline queue. */
  pendingXp: number;
  pendingXpToday: number;
}

const initialState: GamificationState = {
  level: 1,
  totalXp: 0,
  xpToday: 0,
  xpToNextLevel: null,
  nextLevel: null,
  currentStreak: 0,
  bestStreak: 0,
  achievements: [],
  currentTitle: null,
  loading: false,
  error: null,
  serverTotalXp: 0,
  serverXpToday: 0,
  serverLevel: 1,
  pendingXp: 0,
  pendingXpToday: 0,
};

/**
 * Displayed XP = server XP + XP still waiting in the offline queue. When
 * the queue drains, pending drops to 0 and the server's numbers (which
 * include the real streak bonus, caps and badge XP) take over.
 */
function applyDisplay(state: GamificationState): void {
  state.totalXp = state.serverTotalXp + state.pendingXp;
  state.xpToday = Math.min(DAILY_XP_CAP, state.serverXpToday + state.pendingXpToday);
  state.level =
    state.pendingXp > 0
      ? Math.max(state.serverLevel, levelForXp(state.totalXp))
      : state.serverLevel;
  state.xpToNextLevel = xpToNextLevel(state.totalXp);
  state.nextLevel = Math.min(100, state.level + 1);
  state.currentTitle = titleForLevel(state.level);
}

interface AchievementRow {
  badge_id: string;
  unlocked_at: string;
  badge_catalog:
    | {
        name: string;
        description: string;
        rarity: Achievement['rarity'];
        xp_reward: number;
      }
    | {
        name: string;
        description: string;
        rarity: Achievement['rarity'];
        xp_reward: number;
      }[]
    | null;
}

function catalogOf(
  row: AchievementRow,
): { name: string; description: string; rarity: Achievement['rarity']; xp_reward: number } | null {
  const c = row.badge_catalog;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

/**
 * Why the progress is being refetched. 'sync' means the offline queue was
 * just replayed or rolled back: the XP/level change is the server catching
 * up with something the user already saw, so reward animations must not
 * fire again. Middleware reads it from action.meta.arg.reason.
 */
export type GamificationRefreshReason = 'sync';

export interface FetchGamificationArgs {
  reason?: GamificationRefreshReason;
}

export const fetchGamification = createAsyncThunk<
  {
    level: number;
    total_xp: number;
    xp_today: number;
    current_streak: number;
    best_streak: number;
    achievements: Achievement[];
  },
  FetchGamificationArgs | void,
  { rejectValue: string }
>('gamification/fetch', async (_, { rejectWithValue }) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error(i18n.t('errors.notSignedIn'));

    const [gamRes, achRes] = await Promise.all([
      supabase.from('gamification').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('achievements')
        .select('badge_id, unlocked_at, badge_catalog(name, description, rarity, xp_reward)')
        .eq('user_id', user.id)
        .order('unlocked_at', { ascending: false }),
    ]);
    if (gamRes.error) throw gamRes.error;
    const g = gamRes.data;

    // xp_today_date is the user's local date; compare against local, not UTC.
    const now = new Date();
    const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    const xpToday = g?.xp_today_date === today ? g?.xp_today ?? 0 : 0;

    const achievements: Achievement[] = (
      (achRes.data ?? []) as unknown as AchievementRow[]
    ).map((row) => {
      const catalog = catalogOf(row);
      return {
        badge_id: row.badge_id,
        badge_name: catalog?.name ?? row.badge_id,
        description: catalog?.description ?? '',
        rarity: catalog?.rarity ?? 'common',
        xp_reward: catalog?.xp_reward ?? 0,
        unlocked_at: row.unlocked_at,
      };
    });

    return {
      level: g?.level ?? 1,
      total_xp: g?.total_xp ?? 0,
      xp_today: xpToday,
      current_streak: g?.current_streak ?? 0,
      best_streak: g?.best_streak ?? 0,
      achievements,
    };
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : i18n.t('errors.loadProgress'),
    );
  }
});

/** Full badge catalog with unlock state, for the Achievements screen. */
export const fetchAllBadges = createAsyncThunk<
  Achievement[],
  void,
  { rejectValue: string }
>('gamification/fetchAllBadges', async (_, { rejectWithValue }) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error(i18n.t('errors.notSignedIn'));
    const [catalogRes, unlockedRes] = await Promise.all([
      supabase.from('badge_catalog').select('*').order('sort'),
      supabase.from('achievements').select('badge_id, unlocked_at').eq('user_id', user.id),
    ]);
    if (catalogRes.error) throw catalogRes.error;
    const unlockedMap = new Map(
      (unlockedRes.data ?? []).map((r: { badge_id: string; unlocked_at: string }) => [
        r.badge_id,
        r.unlocked_at,
      ]),
    );
    return (catalogRes.data ?? []).map(
      (b: {
        badge_id: string;
        name: string;
        description: string;
        rarity: Achievement['rarity'];
        xp_reward: number;
      }): Achievement => ({
        badge_id: b.badge_id,
        badge_name: b.name,
        description: b.description,
        rarity: b.rarity,
        xp_reward: b.xp_reward,
        unlocked_at: unlockedMap.get(b.badge_id) ?? null,
      }),
    );
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : i18n.t('errors.loadAchievements'),
    );
  }
});

const gamificationSlice = createSlice({
  name: 'gamification',
  initialState,
  reducers: {
    clearGamification() {
      return initialState;
    },
    pendingXpChanged(
      state,
      action: PayloadAction<{ total: number; today: number }>,
    ) {
      state.pendingXp = Math.max(0, action.payload.total);
      state.pendingXpToday = Math.max(0, action.payload.today);
      applyDisplay(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGamification.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGamification.fulfilled, (state, action) => {
        state.loading = false;
        const d = action.payload;
        state.serverLevel = d.level;
        state.serverTotalXp = d.total_xp;
        state.serverXpToday = d.xp_today;
        state.currentStreak = d.current_streak;
        state.bestStreak = d.best_streak;
        state.achievements = d.achievements;
        applyDisplay(state);
      })
      .addCase(fetchGamification.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? i18n.t('errors.loadProgress');
      });
  },
});

export const { clearGamification, pendingXpChanged } = gamificationSlice.actions;

// Re-exported for screens that showed progress math locally.
export { cumulativeXpForLevel, levelForXp, xpToNextLevel };

export default gamificationSlice.reducer;
