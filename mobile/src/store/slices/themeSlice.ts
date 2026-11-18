import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { DEFAULT_THEME_ID, isThemeId, ThemeId } from '../../theme/themes';
import { prepareThemeTransition } from '../../theme/transition';

const THEME_STORAGE_KEY = 'grow.theme_id';
/** Set while a theme picked on this device has not reached Supabase yet. */
const THEME_PENDING_KEY = 'grow.theme_pending_sync';

interface ThemeState {
  themeId: ThemeId;
  hydrated: boolean;
}

const initialState: ThemeState = {
  themeId: DEFAULT_THEME_ID,
  hydrated: false,
};

// AsyncStorage is localStorage on web; private browsing can make it throw,
// so every access is best-effort and the theme still applies in memory.
async function readLocal(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeLocal(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // Ignored on purpose, see readLocal.
  }
}

/** Saves the theme on the signed-in user's own profile row (RLS: id = auth.uid()). */
async function pushToProfile(themeId: ThemeId): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    const { error } = await supabase
      .from('profiles')
      .update({ theme_preference: themeId })
      .eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

export const hydrateTheme = createAsyncThunk('theme/hydrate', async () => {
  const saved = await readLocal(THEME_STORAGE_KEY);
  return isThemeId(saved) ? saved : DEFAULT_THEME_ID;
});

/**
 * Switches the app theme: cross-fades the screen, applies the theme right
 * away, then saves it on this device and on the user's profile so other
 * devices pick it up. If the profile write fails (offline), it is retried
 * the next time the profile loads.
 */
export const setTheme = createAsyncThunk<ThemeId, ThemeId, { state: { theme: ThemeState } }>(
  'theme/set',
  async (themeId, { dispatch, getState }) => {
    if (getState().theme.themeId !== themeId) {
      await prepareThemeTransition();
      dispatch(themeSlice.actions.themeApplied(themeId));
    }
    await writeLocal(THEME_STORAGE_KEY, themeId);
    await writeLocal(THEME_PENDING_KEY, '1');
    if (await pushToProfile(themeId)) {
      await writeLocal(THEME_PENDING_KEY, null);
    }
    return themeId;
  },
);

/**
 * Reconciles this device with the theme saved on the profile, once the
 * profile has loaded. A change still waiting to upload wins (it is newer);
 * otherwise the profile wins, so a theme picked on another device follows
 * the user here. An empty profile value adopts this device's theme.
 */
export const syncThemeWithProfile = createAsyncThunk<
  void,
  string | null,
  { state: { theme: ThemeState } }
>('theme/syncWithProfile', async (remote, { dispatch, getState }) => {
  const local = getState().theme.themeId;
  const pending = (await readLocal(THEME_PENDING_KEY)) === '1';
  if (pending || !isThemeId(remote)) {
    if (remote !== local && (await pushToProfile(local))) {
      await writeLocal(THEME_PENDING_KEY, null);
    } else if (remote === local) {
      await writeLocal(THEME_PENDING_KEY, null);
    }
    return;
  }
  if (remote !== local) {
    dispatch(themeSlice.actions.themeApplied(remote));
    await writeLocal(THEME_STORAGE_KEY, remote);
  }
});

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    themeApplied(state, action: PayloadAction<ThemeId>) {
      state.themeId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(hydrateTheme.fulfilled, (state, action) => {
      state.themeId = action.payload;
      state.hydrated = true;
    });
    builder.addCase(hydrateTheme.rejected, (state) => {
      state.hydrated = true;
    });
  },
});

export const { themeApplied } = themeSlice.actions;
export default themeSlice.reducer;
