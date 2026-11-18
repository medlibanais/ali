import { createSlice, PayloadAction, type UnknownAction } from '@reduxjs/toolkit';
import { initialSyncContext, type SyncMachineView } from '../syncMachine';

// The flush thunk lives in store/offlineSync.ts; matching its action types
// by name keeps this slice free of an import cycle.
const DRAIN = 'sync/drain';

export interface SyncRejection {
  questId: string;
  title: string;
  reason: string;
}

export interface SyncState {
  /** From NetInfo (and failed requests). */
  online: boolean;
  /** Actions saved on this device, waiting for the server. */
  pending: number;
  /** A flush is running right now. */
  syncing: boolean;
  lastSyncAt: number | null;
  /** Mirror of the XState sync machine (store/syncMachine.ts). */
  machine: SyncMachineView;
}

const initialState: SyncState = {
  online: true,
  pending: 0,
  syncing: false,
  lastSyncAt: null,
  machine: {
    state: 'Idle',
    pending: initialSyncContext.pending,
    errorKind: null,
    errorMessage: null,
    failedQuest: null,
  },
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
    syncFinished(state) {
      state.lastSyncAt = Date.now();
    },
    /** Written only by the sync machine middleware. */
    machineChanged(state, action: PayloadAction<SyncMachineView>) {
      state.machine = action.payload;
    },
    /** The banner's Retry button (handled by the machine middleware). */
    syncRetryRequested() {},
    /** The banner's OK button on a conflict notice. */
    syncNoticeDismissed() {},
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
  machineChanged,
  syncRetryRequested,
  syncNoticeDismissed,
  syncReset,
} = syncSlice.actions;

export default syncSlice.reducer;
