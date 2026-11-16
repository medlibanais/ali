import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../../i18n';
import { applyDirection, nativeDirectionMatches } from '../../i18n/direction';
import { detectDeviceLanguage, isLanguage, Language } from '../../i18n/languages';
import { supabase } from '../../lib/supabase';

const LANGUAGE_STORAGE_KEY = 'grow.language';

/** Writes profiles.language for the signed-in user (RLS: own row only). */
export async function saveProfileLanguage(language: Language): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ language })
    .eq('id', user.id);
  // Before the migration is pushed the column is missing; the choice still
  // lives on the device, so this stays best-effort.
  if (error) throw error;
}

export const hydrateLanguage = createAsyncThunk('language/hydrate', async () => {
  let language: Language = detectDeviceLanguage();
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(saved)) language = saved;
  } catch {
    // Fall back to the device language.
  }
  await i18n.changeLanguage(language);
  applyDirection(language);
  return language;
});

export interface SetLanguageArgs {
  language: Language;
  /** false when the value just came from the profile row. */
  saveToProfile?: boolean;
}

export const setLanguage = createAsyncThunk(
  'language/set',
  async ({ language, saveToProfile = true }: SetLanguageArgs) => {
    // Text re-renders at once: every useTranslation() consumer listens.
    await i18n.changeLanguage(language);
    applyDirection(language);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Best-effort; the language still applies for this session.
    }
    if (saveToProfile) {
      try {
        await saveProfileLanguage(language);
      } catch {
        // Kept on the device; synced next time it is changed.
      }
    }
    return language;
  },
);

interface LanguageState {
  language: Language;
  hydrated: boolean;
  /** Android only: the native direction catches up after a restart. */
  restartNeeded: boolean;
}

const initialState: LanguageState = {
  language: 'en',
  hydrated: false,
  restartNeeded: false,
};

const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateLanguage.fulfilled, (state, action) => {
      state.language = action.payload;
      state.hydrated = true;
      state.restartNeeded = !nativeDirectionMatches(action.payload);
    });
    builder.addCase(hydrateLanguage.rejected, (state) => {
      state.hydrated = true;
    });
    builder.addCase(setLanguage.fulfilled, (state, action) => {
      state.language = action.payload;
      state.restartNeeded = !nativeDirectionMatches(action.payload);
    });
  },
});

export default languageSlice.reducer;
