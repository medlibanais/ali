// Account scope for the Redux store.
//
// Everything that belongs to one signed-in account (profile, quests, XP,
// Coach chat, Insights, celebrations, the sync counters) is cleared when the
// account ends: sign-out, an expired session, or a sign-in as someone else.
// Device settings (theme, language, connectivity) are kept.
//
// Requests started by the previous account can still answer after that
// (a slow quest load, a Coach reply, a profile read). Their results must
// never land in the next account's state, so every async thunk remembers
// the account "epoch" it started in, and its result is dropped when the
// epoch has moved on. Auth thunks are exempt: they are what moves it.

import {
  isAnyOf,
  type Middleware,
  type Reducer,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { login, logout, restoreSession, sessionExpired } from './slices/authSlice';

/** Slices that hold one account's data and are cleared between accounts. */
export const ACCOUNT_SLICES = [
  'user',
  'quests',
  'gamification',
  'chat',
  'analytics',
  'planning',
  'celebrations',
] as const;

type AuthPayload = { userId: string } | null | undefined;

interface AuthLike {
  auth: { userId: string | null };
}

const isSignedOut = isAnyOf(sessionExpired, logout.fulfilled, logout.rejected);
const isSignedIn = isAnyOf(login.fulfilled, restoreSession.fulfilled);

/**
 * True when this action ends the current account, or signs in a different
 * one than the account whose data is in the store.
 */
export function endsAccount(action: UnknownAction, currentUserId: string | null): boolean {
  if (isSignedOut(action)) return true;
  if (isSignedIn(action)) {
    const next = (action.payload as AuthPayload)?.userId ?? null;
    return next !== null && currentUserId !== null && next !== currentUserId;
  }
  return false;
}

/** Wraps the root reducer: clears the account slices when an account ends. */
export function withAccountReset<S extends AuthLike & Record<string, unknown>>(
  reducer: Reducer<S, UnknownAction, Partial<S>>,
): Reducer<S, UnknownAction, Partial<S>> {
  return (state, action) => {
    if (state && endsAccount(action, state.auth?.userId ?? null)) {
      const cleared: Partial<S> = { ...state };
      for (const key of ACCOUNT_SLICES) delete cleared[key];
      const sync = state.sync as { online?: boolean } | undefined;
      const next = reducer(cleared as S, action);
      // Keep the device's connectivity; drop the old account's counters.
      if (sync && typeof sync.online === 'boolean') {
        return {
          ...next,
          sync: {
            ...(next.sync as object),
            pending: 0,
            syncing: false,
            lastSyncAt: null,
          },
        };
      }
      return next;
    }
    return reducer(state, action);
  };
}

interface ThunkMeta {
  requestId?: string;
  requestStatus?: 'pending' | 'fulfilled' | 'rejected';
}

let epoch = 0;
const startedIn = new Map<string, number>();

/** Test hook: the current account epoch. */
export function accountEpoch(): number {
  return epoch;
}

/**
 * Drops results of async thunks that were started under a previous account.
 * The epoch moves as soon as sign-out STARTS (logout.pending), so a request
 * that answers while signing out is already ignored.
 */
export const accountScopeMiddleware: Middleware<object, AuthLike> = (api) => (next) => (action) => {
  const a = action as UnknownAction & { meta?: ThunkMeta };
  if (
    logout.pending.match(a) ||
    endsAccount(a, api.getState().auth.userId)
  ) {
    epoch += 1;
  }

  const meta = a.meta;
  const isAuth = typeof a.type === 'string' && a.type.startsWith('auth/');
  if (!isAuth && meta?.requestId && meta.requestStatus) {
    if (meta.requestStatus === 'pending') {
      startedIn.set(meta.requestId, epoch);
    } else {
      const began = startedIn.get(meta.requestId);
      startedIn.delete(meta.requestId);
      if (began !== undefined && began !== epoch) {
        // Started by an account that is gone: never reaches the reducers.
        return action;
      }
    }
  }
  // The Coach stream reports progress with plain actions that name the
  // request that started it; drop those from a previous account too.
  const streamRequest = (a.payload as { requestId?: unknown } | undefined)?.requestId;
  if (a.type === 'chat/streamMeta' && typeof streamRequest === 'string') {
    const began = startedIn.get(streamRequest);
    if (began !== undefined && began !== epoch) return action;
  }
  return next(action);
};
