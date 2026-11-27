import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { accountScopeMiddleware, withAccountReset } from './accountScope';
import authReducer from './slices/authSlice';
import userReducer from './slices/userSlice';
import questsReducer from './slices/questsSlice';
import gamificationReducer from './slices/gamificationSlice';
import chatReducer from './slices/chatSlice';
import analyticsReducer from './slices/analyticsSlice';
import themeReducer from './slices/themeSlice';
import languageReducer from './slices/languageSlice';
import syncReducer from './slices/syncSlice';
import { syncMachineMiddleware } from './syncMachineMiddleware';
import celebrationsReducer from './slices/celebrationsSlice';
import { celebrationMiddleware } from './celebrationMiddleware';
import { THEMES } from '../theme/themes';
import { applyThemeColors } from '../theme/tokens';

const rootReducer = combineReducers({
    auth: authReducer,
    user: userReducer,
    quests: questsReducer,
    gamification: gamificationReducer,
    chat: chatReducer,
    analytics: analyticsReducer,
    theme: themeReducer,
    language: languageReducer,
    sync: syncReducer,
    celebrations: celebrationsReducer,
});

export const store = configureStore({
  // Account data is cleared between accounts (store/accountScope.ts).
  reducer: withAccountReset(rootReducer) as typeof rootReducer,
  middleware: (getDefault) =>
    getDefault()
      .prepend(accountScopeMiddleware, celebrationMiddleware.middleware)
      .concat(syncMachineMiddleware),
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
