import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

export type AuthStatus =
  | 'restoring'
  | 'unauthenticated'
  | 'needsOnboarding'
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

async function getOnboardingCompleted(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .maybeSingle();
  return data?.onboarding_completed ?? false;
}

function authErrorMessage(error: { message?: string } | null, fallback: string): string {
  const msg = error?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login credentials')) return 'Email or password incorrect.';
  if (msg.includes('email not confirmed')) return 'Please verify your email first. Check your inbox.';
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'An account with this email already exists.';
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
  { userId: string; email: string | null; onboardingCompleted: boolean } | null,
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
  { userId: string; email: string | null; onboardingCompleted: boolean },
  { email: string; password: string },
  { rejectValue: string }
>('auth/login', async ({ email, password }, { rejectWithValue }) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return rejectWithValue(authErrorMessage(error, 'Sign in failed.'));
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
    return rejectWithValue(authErrorMessage(error, 'Could not create the account.'));
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
    return rejectWithValue(authErrorMessage(error, 'Could not send the reset email.'));
  }
});

export const updatePassword = createAsyncThunk<
  void,
  { password: string },
  { rejectValue: string }
>('auth/updatePassword', async ({ password }, { rejectWithValue }) => {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return rejectWithValue(authErrorMessage(error, 'Could not update the password.'));
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
    return rejectWithValue(authErrorMessage(error, 'Could not resend the email.'));
  }
});

export const logout = createAsyncThunk<void, void>('auth/logout', async () => {
  await supabase.auth.signOut();
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
        onboardingCompleted: boolean;
      } | null>,
    ) => {
      if (action.payload) {
        state.userId = action.payload.userId;
        state.email = action.payload.email;
        state.status = action.payload.onboardingCompleted
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
        state.error = action.payload ?? 'Sign in failed.';
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
        state.error = action.payload ?? 'Registration failed.';
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
