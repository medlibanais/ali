import i18n from '../../i18n';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { unregisterDeviceForPush } from '../../lib/notifications';
import { clearPortraits } from '../../avatar/renderCache';
import {
  rememberOnboardingCompleted,
  wasOnboardingCompleted,
} from '../../lib/onboardingCache';

export type AuthStatus =
  | 'restoring'
  | 'unauthenticated'
  | 'needsOnboarding'
  /** Signed in, but the profile could not be read and nothing is cached. */
  | 'profileUnavailable'
  | 'ready';

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  busy: boolean;
  error: string | null;
  /** Invite code carried from a deep link / register screen until redeemed. */
  pendingInviteCode: string | null;
}

const initialState: AuthState = {
  status: 'restoring',
  userId: null,
  email: null,
  busy: false,
  error: null,
  pendingInviteCode: null,
};

/**
 * Whether this account finished onboarding. A failed read (offline, server
 * error) is NOT "unfinished": a returning user who finished on this device
 * goes on to Today with cached data, anyone else gets a retry screen.
 */
async function getOnboardingCompleted(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    const completed = data?.onboarding_completed ?? false;
    if (completed) rememberOnboardingCompleted(userId);
    return completed;
  } catch {
    return wasOnboardingCompleted(userId) ? true : null;
  }
}

function authErrorMessage(error: { message?: string } | null, fallback: string): string {
  const msg = error?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login credentials')) return i18n.t('authErrors.badCredentials');
  if (msg.includes('email not confirmed')) return i18n.t('authErrors.verifyFirst');
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return i18n.t('authErrors.tooMany');
  }
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return i18n.t('authErrors.emailExists');
  }
  return error?.message ?? fallback;
}

/** Where email links (verify / reset) should return the user. */
export function emailRedirect(path: 'verify-email' | 'reset-password'): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/${path}`;
  }
  return `prayerlock://${path}`;
}

export const restoreSession = createAsyncThunk<
  { userId: string; email: string | null; onboardingCompleted: boolean | null } | null,
  void
>('auth/restoreSession', async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const onboardingCompleted = await getOnboardingCompleted(user.id);
  return { userId: user.id, email: user.email ?? null, onboardingCompleted };
});

export const login = createAsyncThunk<
  { userId: string; email: string | null; onboardingCompleted: boolean | null },
  { email: string; password: string },
  { rejectValue: string }
>('auth/login', async ({ email, password }, { rejectWithValue }) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return rejectWithValue(authErrorMessage(error, i18n.t('authErrors.signInFailed')));
  }
  const onboardingCompleted = await getOnboardingCompleted(data.user.id);
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    onboardingCompleted,
  };
});

export const register = createAsyncThunk<
  { email: string; needsVerification: boolean },
  { email: string; password: string },
  { rejectValue: string }
>('auth/register', async ({ email, password }, { rejectWithValue }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: emailRedirect('verify-email') },
  });
  if (error) {
    return rejectWithValue(authErrorMessage(error, i18n.t('authErrors.createFailed')));
  }
  // Supabase returns a user with no session when email confirmation is on.
  return {
    email,
    needsVerification: !data.session,
  };
});

export const sendPasswordReset = createAsyncThunk<
  void,
  { email: string },
  { rejectValue: string }
>('auth/sendPasswordReset', async ({ email }, { rejectWithValue }) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: emailRedirect('reset-password'),
  });
  if (error) {
    return rejectWithValue(authErrorMessage(error, i18n.t('authErrors.resetFailed')));
  }
});

export const updatePassword = createAsyncThunk<
  void,
  { password: string },
  { rejectValue: string }
>('auth/updatePassword', async ({ password }, { rejectWithValue }) => {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return rejectWithValue(authErrorMessage(error, i18n.t('authErrors.updatePasswordFailed')));
  }
});

export const resendVerification = createAsyncThunk<
  void,
  { email: string },
  { rejectValue: string }
>('auth/resendVerification', async ({ email }, { rejectWithValue }) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: emailRedirect('verify-email') },
  });
  if (error) {
    return rejectWithValue(authErrorMessage(error, i18n.t('authErrors.resendFailed')));
  }
});

export const logout = createAsyncThunk<void, void>('auth/logout', async () => {
  // Stop this phone getting the signed-out user's pushes (never throws).
  await unregisterDeviceForPush();
  // The next person must not see this one's avatar while theirs draws.
  await clearPortraits();
  // Signing out must always work, even offline or with an expired token.
  // A global sign-out that fails keeps the local session, so fall back to
  // clearing it on this device only.
  try {
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
  } catch {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired(state) {
      state.status = 'unauthenticated';
      state.userId = null;
      state.email = null;
    },
    onboardingCompletedLocally(state) {
      state.status = 'ready';
      if (state.userId) rememberOnboardingCompleted(state.userId);
    },
    clearAuthError(state) {
      state.error = null;
    },
    setPendingInviteCode(state, action: PayloadAction<string | null>) {
      state.pendingInviteCode = action.payload;
    },
  },
  extraReducers: (builder) => {
    const applyAuth = (
      state: AuthState,
      action: PayloadAction<{
        userId: string;
        email: string | null;
        onboardingCompleted: boolean | null;
      } | null>,
    ) => {
      if (action.payload) {
        state.userId = action.payload.userId;
        state.email = action.payload.email;
        const done = action.payload.onboardingCompleted;
        state.status = done === null
          ? 'profileUnavailable'
          : done
            ? 'ready'
            : 'needsOnboarding';
      } else {
        state.status = 'unauthenticated';
      }
    };

    builder
      .addCase(restoreSession.fulfilled, applyAuth)
      .addCase(restoreSession.rejected, (state) => {
        state.status = 'unauthenticated';
      })
      .addCase(login.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.busy = false;
        applyAuth(state, action);
      })
      .addCase(login.rejected, (state, action) => {
        state.busy = false;
        state.error = action.payload ?? i18n.t('authErrors.signInFailed');
      })
      .addCase(register.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state) => {
        state.busy = false;
      })
      .addCase(register.rejected, (state, action) => {
        state.busy = false;
        state.error = action.payload ?? i18n.t('authErrors.registerFailed');
      })
      .addCase(logout.rejected, (state) => {
        state.status = 'unauthenticated';
        state.userId = null;
        state.email = null;
        state.busy = false;
      })
      .addCase(logout.fulfilled, (state) => {
        state.status = 'unauthenticated';
        state.userId = null;
        state.email = null;
        state.busy = false;
        state.error = null;
      });
  },
});

export const {
  sessionExpired,
  onboardingCompletedLocally,
  clearAuthError,
  setPendingInviteCode,
} = authSlice.actions;

export default authSlice.reducer;
