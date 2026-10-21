import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_THEME_ID, isThemeId, ThemeId } from '../../theme/themes';

const THEME_STORAGE_KEY = 'grow.theme_id';

export const hydrateTheme = createAsyncThunk('theme/hydrate', async () => {
  try {
    const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
});

export const setTheme = createAsyncThunk(
  'theme/set',
  async (themeId: ThemeId) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      // Persistence is best-effort; the theme still applies for the session.
    }
    return themeId;
  },
);

interface ThemeState {
  themeId: ThemeId;
  hydrated: boolean;
}

const initialState: ThemeState = {
  themeId: DEFAULT_THEME_ID,
  hydrated: false,
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateTheme.fulfilled, (state, action) => {
      state.themeId = action.payload;
      state.hydrated = true;
    });
    builder.addCase(hydrateTheme.rejected, (state) => {
      state.hydrated = true;
    });
    builder.addCase(setTheme.fulfilled, (state, action) => {
      state.themeId = action.payload;
    });
  },
});

export default themeSlice.reducer;
