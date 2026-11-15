// Background sync of offline quest completions.
//
// Replays the queue one item at a time, in the order the quests were
// completed, through the sync_quest_completion RPC (migration 0014):
//  - each item carries a client id, so a replay never awards XP twice;
//  - each item carries the time it happened, so the server counts it on
//    the right day (daily limit, XP cap, 6 PM bonus, streak);
//  - refusals that can never succeed (daily limit, too old, skipped...)
//    are dropped and reported, so one bad item cannot block the queue;
//  - a network error stops the run; the rest waits for the next one.
// XP conflicts resolve to the server: after the run the app refetches
// XP, level, streak and the day, and the optimistic XP of the synced
// items is removed, so the displayed numbers become the server's.

import { createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../lib/supabase';
import {
  isMissingSyncRpc,
  isOfflineError,
  permanentSyncReason,
  readCompletionQueue,
  removeQueued,
  type QueuedCompletion,
} from '../lib/offlineQueue';
import { reportOffline, reportOnline } from '../lib/connectivity';
import { fetchGamification } from './slices/gamificationSlice';
import { fetchDailyQuests, type QuestThunkState } from './slices/questsSlice';
import { syncFinished, type SyncRejection } from './slices/syncSlice';
import { refreshPendingCompletions } from './pendingCompletions';

const SYNC_TIMEOUT_MS = 15000;

export type SyncStop = 'done' | 'offline' | 'error' | 'signed_out';

export interface SyncResult {
  synced: number;
  duplicates: number;
  rejected: SyncRejection[];
  stoppedBy: SyncStop;
}

interface RpcError {
  code?: string;
  message?: string;
}

type Outcome =
  | { kind: 'ok'; duplicate: boolean }
  | { kind: 'rejected'; reason: string }
  | { kind: 'offline' }
  | { kind: 'error' };

async function callRpc(
  name: string,
  params: Record<string, unknown>,
): Promise<{ data: unknown; error: RpcError | null; thrown: unknown }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), SYNC_TIMEOUT_MS);
  try {
    const request = supabase.rpc(name, params);
    const res = await (controller ? request.abortSignal(controller.signal) : request);
    return { data: res.data, error: res.error as RpcError | null, thrown: null };
  } catch (e) {
    return { data: null, error: null, thrown: e };
  } finally {
    clearTimeout(timer);
  }
}

function classify(error: RpcError | null, thrown: unknown): Outcome | null {
  if (thrown) return isOfflineError(thrown) ? { kind: 'offline' } : { kind: 'error' };
  if (!error) return null;
  if (isOfflineError(error)) return { kind: 'offline' };
  const reason = permanentSyncReason(error.message);
  if (reason) return { kind: 'rejected', reason };
  return { kind: 'error' };
}

/** Sends one queued completion. Exported for tests. */
export async function syncOne(item: QueuedCompletion): Promise<Outcome> {
  const res = await callRpc('sync_quest_completion', {
    p_quest_id: item.questId,
    p_client_id: item.clientId,
    p_completed_at: item.completedAt,
  });
  if (!res.thrown && isMissingSyncRpc(res.error)) {
    // Migration 0014 is not on this database yet: fall back to the
    // online RPC (counts on the sync day, still never twice).
    const old = await callRpc('complete_quest', { p_quest_id: item.questId });
    const outcome = classify(old.error, old.thrown);
    return outcome ?? { kind: 'ok', duplicate: false };
  }
  const outcome = classify(res.error, res.thrown);
  if (outcome) return outcome;
  const duplicate = Boolean((res.data as { duplicate?: boolean } | null)?.duplicate);
  return { kind: 'ok', duplicate };
}

export const syncOfflineCompletions = createAsyncThunk<
  SyncResult,
  void,
  { state: QuestThunkState }
>(
  'sync/drain',
  async (_, { dispatch, getState }) => {
    const result: SyncResult = { synced: 0, duplicates: 0, rejected: [], stoppedBy: 'done' };
    const userId = getState().auth.userId;
    if (!userId) {
      result.stoppedBy = 'signed_out';
      dispatch(syncFinished({ synced: 0, rejected: [] }));
      return result;
    }

    const queue = await readCompletionQueue(userId);
    for (const item of queue) {
      const outcome = await syncOne(item);
      if (outcome.kind === 'ok') {
        await removeQueued(item.clientId);
        if (outcome.duplicate) result.duplicates += 1;
        else result.synced += 1;
        reportOnline();
      } else if (outcome.kind === 'rejected') {
        await removeQueued(item.clientId);
        result.rejected.push({
          questId: item.questId,
          title: item.title,
          reason: outcome.reason,
        });
        reportOnline();
      } else if (outcome.kind === 'offline') {
        result.stoppedBy = 'offline';
        reportOffline();
        break;
      } else {
        result.stoppedBy = 'error';
        break;
      }
    }

    const touched = result.synced + result.duplicates + result.rejected.length;
    if (touched > 0) {
      // Server is the source of truth: take its XP, then drop the
      // optimistic XP of what was synced, then refresh the day.
      await dispatch(fetchGamification());
      await dispatch(refreshPendingCompletions());
      dispatch(fetchDailyQuests({ silent: true }));
    } else {
      await dispatch(refreshPendingCompletions());
    }
    dispatch(syncFinished({ synced: result.synced + result.duplicates, rejected: result.rejected }));
    return result;
  },
  {
    // One run at a time; a second request while running is ignored.
    condition: (_, { getState }) => !getState().sync.syncing,
  },
);
