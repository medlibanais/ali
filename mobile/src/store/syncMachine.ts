// The quest-completion sync state machine (XState v5).
//
//            COMPLETE_TAPPED                SERVER_CONFIRMED
//   Idle ───────────────────▶ OptimisticPending ─────────────▶ Synced ──(2.5 s)──▶ Idle
//    │                           │      │                         ▲
//    │ QUEUED / PENDING>0        │      │ SERVER_FAILED           │ FLUSH_SUCCEEDED (0 left)
//    ▼                           │      ▼                         │
//  Syncing ◀──────── QUEUED ─────┘    Error ◀── FLUSH_CONFLICT / FLUSH_FAILED ── Syncing
//    ▲                                  │
//    └──────────── RETRY (queue not empty) / back to Idle (queue empty)
//
// - OptimisticPending: the UI already shows the quest done; the online RPC
//   is in flight.
// - Syncing: actions are saved in the offline queue, waiting for the
//   network or being flushed in order.
// - Synced: the server confirmed everything; shown briefly.
// - Error: an online completion failed (Retry re-sends it), a flush hit a
//   server error (Retry flushes again), or the server resolved a conflict
//   in its own favour (shown with a toast).
//
// The machine is pure: no side effects, no Supabase. The Redux middleware
// in syncMachineMiddleware.ts feeds it events from Redux actions and
// mirrors every snapshot into the sync slice, which the UI reads.

import { assign, setup, type SnapshotFrom } from 'xstate';

export type SyncMachineState = 'Idle' | 'OptimisticPending' | 'Syncing' | 'Synced' | 'Error';

export type SyncErrorKind = 'failed' | 'conflict';

export interface FailedQuest {
  questId: string;
  title: string;
}

export interface SyncMachineContext {
  /** Actions waiting in the offline queue. */
  pending: number;
  /** Quest whose online completion is in flight. */
  inFlightQuestId: string | null;
  /** Online completion that failed; Retry sends it again. */
  failedQuest: FailedQuest | null;
  errorKind: SyncErrorKind | null;
  errorMessage: string | null;
  /** A flush is running (the queue may hit 0 before its result lands). */
  flushing: boolean;
}

export type SyncMachineEvent =
  | { type: 'FLUSH_STARTED' }
  | { type: 'COMPLETE_TAPPED'; questId: string }
  | { type: 'SERVER_CONFIRMED'; questId: string }
  | { type: 'SERVER_FAILED'; questId: string; title: string; message: string }
  | { type: 'QUEUED'; pending: number }
  | { type: 'PENDING_CHANGED'; pending: number }
  | { type: 'FLUSH_SUCCEEDED'; remaining: number }
  | { type: 'FLUSH_CONFLICT'; message: string; remaining: number }
  | { type: 'FLUSH_FAILED'; message: string; remaining: number }
  | { type: 'RETRY' }
  | { type: 'DISMISS' };

export const SYNCED_DISPLAY_MS = 2500;

export const initialSyncContext: SyncMachineContext = {
  pending: 0,
  inFlightQuestId: null,
  failedQuest: null,
  errorKind: null,
  errorMessage: null,
  flushing: false,
};

export const syncMachine = setup({
  types: {
    context: {} as SyncMachineContext,
    events: {} as SyncMachineEvent,
  },
  guards: {
    hasPending: ({ context }) => context.pending > 0,
    eventHasPending: ({ event }) =>
      (event.type === 'PENDING_CHANGED' || event.type === 'QUEUED') && event.pending > 0,
    eventQueueEmpty: ({ context, event }) =>
      (event.type === 'PENDING_CHANGED' && event.pending === 0 && !context.flushing) ||
      (event.type === 'FLUSH_SUCCEEDED' && event.remaining === 0),
    isInFlightQuest: ({ context, event }) =>
      (event.type === 'SERVER_CONFIRMED' || event.type === 'SERVER_FAILED') &&
      event.questId === context.inFlightQuestId,
  },
  actions: {
    startInFlight: assign({
      inFlightQuestId: ({ event }) => (event.type === 'COMPLETE_TAPPED' ? event.questId : null),
      errorKind: null,
      errorMessage: null,
      failedQuest: null,
    }),
    clearInFlight: assign({ inFlightQuestId: null }),
    setPending: assign({
      pending: ({ context, event }) => {
        switch (event.type) {
          case 'QUEUED':
          case 'PENDING_CHANGED':
            return event.pending;
          case 'FLUSH_SUCCEEDED':
          case 'FLUSH_CONFLICT':
          case 'FLUSH_FAILED':
            return event.remaining;
          default:
            return context.pending;
        }
      },
    }),
    recordFailure: assign({
      inFlightQuestId: null,
      errorKind: 'failed' as const,
      errorMessage: ({ event }) =>
        event.type === 'SERVER_FAILED' || event.type === 'FLUSH_FAILED' ? event.message : null,
      failedQuest: ({ event }) =>
        event.type === 'SERVER_FAILED' ? { questId: event.questId, title: event.title } : null,
    }),
    recordConflict: assign({
      errorKind: 'conflict' as const,
      errorMessage: ({ event }) => (event.type === 'FLUSH_CONFLICT' ? event.message : null),
      failedQuest: null,
    }),
    clearError: assign({ errorKind: null, errorMessage: null, failedQuest: null }),
    flushStarted: assign({ flushing: true }),
    flushEnded: assign({ flushing: false }),
  },
  delays: {
    syncedDisplay: SYNCED_DISPLAY_MS,
  },
}).createMachine({
  id: 'questSync',
  initial: 'Idle',
  context: initialSyncContext,
  on: {
    // The queue count is always kept current, whatever the state.
    PENDING_CHANGED: { actions: 'setPending' },
    FLUSH_STARTED: { actions: 'flushStarted' },
    FLUSH_SUCCEEDED: { actions: ['flushEnded', 'setPending'] },
    FLUSH_CONFLICT: { actions: 'flushEnded' },
    FLUSH_FAILED: { actions: 'flushEnded' },
  },
  states: {
    Idle: {
      on: {
        FLUSH_CONFLICT: { target: 'Error', actions: ['flushEnded', 'setPending', 'recordConflict'] },
        FLUSH_FAILED: { target: 'Error', actions: ['flushEnded', 'setPending', 'recordFailure'] },
        COMPLETE_TAPPED: { target: 'OptimisticPending', actions: 'startInFlight' },
        QUEUED: { target: 'Syncing', actions: 'setPending' },
        PENDING_CHANGED: [
          { guard: 'eventHasPending', target: 'Syncing', actions: 'setPending' },
          { actions: 'setPending' },
        ],
      },
    },
    OptimisticPending: {
      on: {
        SERVER_CONFIRMED: { guard: 'isInFlightQuest', target: 'Synced', actions: 'clearInFlight' },
        SERVER_FAILED: { guard: 'isInFlightQuest', target: 'Error', actions: 'recordFailure' },
        QUEUED: { target: 'Syncing', actions: ['setPending', 'clearInFlight'] },
        PENDING_CHANGED: [
          { guard: 'eventHasPending', target: 'Syncing', actions: ['setPending', 'clearInFlight'] },
          { actions: 'setPending' },
        ],
        COMPLETE_TAPPED: { actions: 'startInFlight' },
      },
    },
    Syncing: {
      on: {
        COMPLETE_TAPPED: {},
        QUEUED: { actions: 'setPending' },
        PENDING_CHANGED: [
          { guard: 'eventQueueEmpty', target: 'Idle', actions: 'setPending' },
          { actions: 'setPending' },
        ],
        FLUSH_SUCCEEDED: [
          { guard: 'eventQueueEmpty', target: 'Synced', actions: ['flushEnded', 'setPending'] },
          { actions: ['flushEnded', 'setPending'] },
        ],
        FLUSH_CONFLICT: { target: 'Error', actions: ['flushEnded', 'setPending', 'recordConflict'] },
        FLUSH_FAILED: { target: 'Error', actions: ['flushEnded', 'setPending', 'recordFailure'] },
      },
    },
    Synced: {
      after: { syncedDisplay: { target: 'Idle' } },
      on: {
        COMPLETE_TAPPED: { target: 'OptimisticPending', actions: 'startInFlight' },
        QUEUED: { target: 'Syncing', actions: 'setPending' },
        PENDING_CHANGED: [
          { guard: 'eventHasPending', target: 'Syncing', actions: 'setPending' },
          { actions: 'setPending' },
        ],
      },
    },
    Error: {
      on: {
        RETRY: [
          { guard: 'hasPending', target: 'Syncing', actions: 'clearError' },
          // The middleware re-sends failedQuest; COMPLETE_TAPPED follows.
          { target: 'Idle', actions: 'clearError' },
        ],
        DISMISS: [
          { guard: 'hasPending', target: 'Syncing', actions: 'clearError' },
          { target: 'Idle', actions: 'clearError' },
        ],
        COMPLETE_TAPPED: { target: 'OptimisticPending', actions: 'startInFlight' },
        QUEUED: { target: 'Syncing', actions: ['setPending', 'clearError'] },
        FLUSH_SUCCEEDED: [
          { guard: 'eventQueueEmpty', target: 'Synced', actions: ['flushEnded', 'setPending', 'clearError'] },
          { target: 'Syncing', actions: ['flushEnded', 'setPending', 'clearError'] },
        ],
      },
    },
  },
});

export type SyncMachineSnapshot = SnapshotFrom<typeof syncMachine>;

/** Plain, serializable view of a snapshot for Redux. */
export interface SyncMachineView {
  state: SyncMachineState;
  pending: number;
  errorKind: SyncErrorKind | null;
  errorMessage: string | null;
  failedQuest: FailedQuest | null;
}

export function viewOf(snapshot: SyncMachineSnapshot): SyncMachineView {
  return {
    state: snapshot.value as SyncMachineState,
    pending: snapshot.context.pending,
    errorKind: snapshot.context.errorKind,
    errorMessage: snapshot.context.errorMessage,
    failedQuest: snapshot.context.failedQuest,
  };
}
