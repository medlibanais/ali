import { createSlice, PayloadAction, type UnknownAction } from '@reduxjs/toolkit';

// The drain thunk lives in store/offlineSync.ts; matching its action types
// by name keeps this slice free of an import cycle.
const DRAIN = 'sync/drain';

export interface SyncRejection {
  questId: string;
  title: string;
  reason: string;
}

export interface SyncState {
  online: boolean;
  /** Completions saved on this device, waiting for the server. */
  pending: number;
  syncing: boolean;
  /** Completions confirmed by the last sync (shown briefly in the banner). */
  justSynced: number;
  /** Completions the server refused for good during the last sync. */
  rejected: SyncRejection[];
  lastSyncAt: number | null;
}

const initialState: SyncState = {
  online: true,
  pending: 0,
  syncing: false,
  justSynced: 0,
  rejected: [],
  lastSyncAt: null,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    connectivityChanged(state, action: PayloadAction<boolean>) {
      state.online = action.payload;
    },
    pendingChanged(state, action: PayloadAction<number>) {
      state.pending = Math.max(0, action.payload);
    },
    syncFinished(
      state,
      action: PayloadAction<{ synced: number; rejected: SyncRejection[] }>,
    ) {
      state.lastSyncAt = Date.now();
      state.justSynced = action.payload.synced;
      state.rejected = action.payload.rejected;
    },
    syncNoticeCleared(state) {
      state.justSynced = 0;
      state.rejected = [];
    },
    syncReset() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(
        (a: UnknownAction) => a.type === `${DRAIN}/pending`,
        (state) => {
          state.syncing = true;
        },
      )
      .addMatcher(
        (a: UnknownAction) => a.type === `${DRAIN}/fulfilled` || a.type === `${DRAIN}/rejected`,
        (state) => {
          state.syncing = false;
        },
      );
  },
});

export const {
  connectivityChanged,
  pendingChanged,
  syncFinished,
  syncNoticeCleared,
  syncReset,
} = syncSlice.actions;

export default syncSlice.reducer;
