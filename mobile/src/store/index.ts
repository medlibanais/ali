import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import userReducer from './slices/userSlice';
import questsReducer from './slices/questsSlice';
import gamificationReducer from './slices/gamificationSlice';
import chatReducer from './slices/chatSlice';
import analyticsReducer from './slices/analyticsSlice';
import themeReducer from './slices/themeSlice';
import { THEMES } from '../theme/themes';
import { applyThemeColors } from '../theme/tokens';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    quests: questsReducer,
    gamification: gamificationReducer,
    chat: chatReducer,
    analytics: analyticsReducer,
    theme: themeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Keep the live color binding in sync with the selected theme.
let appliedThemeId = store.getState().theme.themeId;
applyThemeColors(THEMES[appliedThemeId].colors);
store.subscribe(() => {
  const { themeId } = store.getState().theme;
  if (themeId !== appliedThemeId) {
    appliedThemeId = themeId;
    applyThemeColors(THEMES[themeId].colors);
  }
});
