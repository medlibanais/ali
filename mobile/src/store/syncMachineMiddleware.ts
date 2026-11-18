// Runs the XState sync machine next to Redux.
//
// Redux actions in -> machine events -> machine snapshot -> sync slice
// (`state.sync.machine`), which the UI reads. The machine stays pure; the
// only side effect here is the Retry button, which re-sends the failed
// online completion or flushes the queue again.

import type { Middleware, UnknownAction } from '@reduxjs/toolkit';
import { createActor } from 'xstate';
import type { Quest } from '../api/types';
import { syncMachine, viewOf, type SyncMachineEvent } from './syncMachine';
import { machineChanged, pendingChanged, syncNoticeDismissed, syncRetryRequested } from './slices/syncSlice';
import { completeQuest, type CompleteQuestResult, type QuestThunkState } from './slices/questsSlice';
import { syncOfflineCompletions, type SyncResult } from './offlineSync';

interface ThunkMeta<A> {
  arg: A;
  requestStatus: 'pending' | 'fulfilled' | 'rejected';
}

function isAction<P, A>(
  action: UnknownAction,
  type: string,
): action is UnknownAction & { payload: P; meta: ThunkMeta<A> } {
  return action.type === type;
}

/** Maps a Redux action to the machine event it means, if any. */
export function eventForAction(action: UnknownAction): SyncMachineEvent | null {
  if (isAction<undefined, Quest>(action, completeQuest.pending.type)) {
    return { type: 'COMPLETE_TAPPED', questId: action.meta.arg.quest_id };
  }
  if (isAction<CompleteQuestResult, Quest>(action, completeQuest.fulfilled.type)) {
    return action.payload.offline
      ? null // the queue count arrives as PENDING_CHANGED
      : { type: 'SERVER_CONFIRMED', questId: action.meta.arg.quest_id };
  }
  if (isAction<{ message: string } | undefined, Quest>(action, completeQuest.rejected.type)) {
    return {
      type: 'SERVER_FAILED',
      questId: action.meta.arg.quest_id,
      title: action.meta.arg.title,
      message: action.payload?.message ?? 'Could not complete this quest.',
    };
  }
  if (action.type === syncOfflineCompletions.pending.type) return { type: 'FLUSH_STARTED' };
  if (pendingChanged.match(action)) {
    return { type: 'PENDING_CHANGED', pending: action.payload };
  }
  if (isAction<SyncResult, void>(action, syncOfflineCompletions.fulfilled.type)) {
    const r = action.payload;
    const lines = [
      ...r.conflicts.map((c) => c.reason),
      ...r.rejected.map(
        (c) => `${c.title ? `"${c.title}"` : 'A quest'} was not counted: ${c.reason}.`,
      ),
    ];
    if (lines.length > 0) {
      const more = lines.length > 1 ? ` (+${lines.length - 1} more)` : '';
      return { type: 'FLUSH_CONFLICT', message: `${lines[0]}${more}`, remaining: r.remaining };
    }
    if (r.stoppedBy === 'error') {
      return { type: 'FLUSH_FAILED', message: 'Sync failed. Your quests are still saved.', remaining: r.remaining };
    }
    // 'done', or 'offline' (remaining > 0 keeps it in Syncing, waiting).
    return { type: 'FLUSH_SUCCEEDED', remaining: r.remaining };
  }
  if (syncRetryRequested.match(action)) return { type: 'RETRY' };
  if (syncNoticeDismissed.match(action)) return { type: 'DISMISS' };
  return null;
}

export const syncMachineMiddleware: Middleware<object, QuestThunkState> = (api) => {
  const actor = createActor(syncMachine);
  // Redux forbids dispatching while middleware is being built, so the
  // initial snapshot (which equals the slice's initial state) is not sent.
  let constructing = true;
  let last = JSON.stringify(viewOf(actor.getSnapshot()));
  actor.subscribe((snapshot) => {
    const view = viewOf(snapshot);
    const key = JSON.stringify(view);
    if (key === last || constructing) return;
    last = key;
    api.dispatch(machineChanged(view));
  });
  actor.start();
  constructing = false;

  return (next) => (action) => {
    const result = next(action);
    const a = action as UnknownAction;
    if (machineChanged.match(a)) return result;

    // Retry: re-send the failed online completion, or flush the queue.
    let retryQuest: Quest | null = null;
    if (syncRetryRequested.match(a)) {
      const failed = actor.getSnapshot().context.failedQuest;
      if (failed) {
        retryQuest = api.getState().quests.quests.find((q) => q.quest_id === failed.questId) ?? null;
      }
    }

    const event = eventForAction(a);
    if (event) actor.send(event);

    if (syncRetryRequested.match(a)) {
      if (retryQuest) {
        (api.dispatch as (t: ReturnType<typeof completeQuest>) => unknown)(completeQuest(retryQuest));
      } else {
        (api.dispatch as (t: ReturnType<typeof syncOfflineCompletions>) => unknown)(
          syncOfflineCompletions(),
        );
      }
    }
    return result;
  };
};
