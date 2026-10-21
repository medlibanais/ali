import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { supabase } from '../../lib/supabase';

// Shapes consumed by the screens (kept stable while the backend changed).
export interface UserProfile {
  first_name: string | null;
  username: string | null;
  avatar_url: string | null;
  photo_url: string | null;
  avatar_config: Record<string, unknown> | null;
  avatar_mode: 'avatar' | 'photo' | 'ai';
  ai_avatar_url: string | null;
  timezone: string;
  invite_code: string | null;
  stats_visibility: 'friends' | 'private';
  theme_id: string;
  dream_body: string | null;
  dream_personality: string[];
  career_goal: string | null;
}

export interface UserGoals {
  workouts_per_week: number;
  sleep_target_hours: number;
  water_liters_per_day: number;
  call_parents_frequency: string;
  quality_time_hours_per_week: number;
  deep_work_hours_per_week: number;
  career_goal: string | null;
  skill_to_develop: string | null;
  hobbies: string[];
  weekly_fun_hours: number;
  religion: string | null;
  prayer_frequency: string | null;
  spiritual_practice: string | null;
}

export interface OnboardingPayload {
  username: string;
  first_name: string;
  timezone: string;
  goals: Partial<UserGoals> & {
    dream_body?: string;
    dream_personality?: string[];
  };
}

export interface UserState {
  profile: UserProfile | null;
  goals: UserGoals | null;
  loading: boolean;
  error: string | null;
}

const initialState: UserState = {
  profile: null,
  goals: null,
  loading: false,
  error: null,
};

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  return user.id;
}

export const fetchProfile = createAsyncThunk<
  { profile: UserProfile; goals: UserGoals | null },
  void,
  { rejectValue: string }
>('user/fetchProfile', async (_, { rejectWithValue }) => {
  try {
    const userId = await requireUserId();
    const [profileRes, goalsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    if (profileRes.error) throw profileRes.error;
    const p = profileRes.data;
    const g = goalsRes.data;
    const profile: UserProfile = {
      first_name: p?.first_name ?? null,
      username: p?.username ?? null,
      avatar_url: p?.photo_url ?? null,
      photo_url: p?.photo_url ?? null,
      avatar_config: (p?.avatar_config as Record<string, unknown>) ?? null,
      avatar_mode: (p?.avatar_mode as UserProfile['avatar_mode']) ?? 'avatar',
      ai_avatar_url: p?.ai_avatar_url ?? null,
      timezone: p?.timezone ?? 'UTC',
      invite_code: p?.invite_code ?? null,
      stats_visibility: (p?.stats_visibility as 'friends' | 'private') ?? 'friends',
      theme_id: p?.theme_id ?? 'parchment',
      dream_body: g?.dream_body ?? null,
      dream_personality: g?.dream_personality ?? [],
      career_goal: g?.career_goal ?? null,
    };
    return { profile, goals: (g as UserGoals | null) ?? null };
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Could not load your profile.',
    );
  }
});

export const submitOnboarding = createAsyncThunk<
  void,
  OnboardingPayload,
  { rejectValue: string }
>('user/submitOnboarding', async (payload, { rejectWithValue }) => {
  try {
    const userId = await requireUserId();
    const username = payload.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new Error(
        'Username must be 3-20 chars: lowercase letters, numbers, underscore.',
      );
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        username,
        first_name: payload.first_name.trim(),
        timezone: payload.timezone,
        onboarding_completed: true,
      })
      .eq('id', userId);
    if (profileError) {
      if (profileError.message.toLowerCase().includes('duplicate') ||
          profileError.code === '23505') {
        throw new Error('That username is taken. Try another one.');
      }
      throw profileError;
    }

    const { dream_body, dream_personality, ...goals } = payload.goals;
    const { error: goalsError } = await supabase
      .from('user_goals')
      .update({
        ...goals,
        ...(dream_body !== undefined ? { dream_body } : {}),
        ...(dream_personality !== undefined
          ? { dream_personality }
          : {}),
      })
      .eq('user_id', userId);
    if (goalsError) throw goalsError;
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Could not save your answers.',
    );
  }
});

export const saveAvatarConfig = createAsyncThunk<
  Record<string, unknown>,
  Record<string, unknown>,
  { rejectValue: string }
>('user/saveAvatarConfig', async (config, { rejectWithValue }) => {
  try {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_config: config, avatar_mode: 'avatar' })
      .eq('id', userId);
    if (error) throw error;
    return config;
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Could not save your avatar.',
    );
  }
});

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    clearUser(state) {
      state.profile = null;
      state.goals = null;
      state.error = null;
    },
    avatarUpdated(state, action: PayloadAction<string>) {
      if (state.profile) {
        state.profile.avatar_url = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.profile = action.payload.profile;
        state.goals = action.payload.goals;
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Could not load your profile.';
      })
      .addCase(saveAvatarConfig.fulfilled, (state, action) => {
        if (state.profile) {
          state.profile.avatar_config = action.payload;
          state.profile.avatar_mode = 'avatar';
        }
      });
  },
});

export const { clearUser, avatarUpdated } = userSlice.actions;

export default userSlice.reducer;
