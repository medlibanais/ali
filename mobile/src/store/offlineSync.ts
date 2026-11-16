// Background flush of the offline queue.
//
// Replays queued quest actions one at a time, in the exact order they
// happened, through the RPCs from migration 0015:
//   complete -> sync_quest_completion(quest, client id, time it happened)
//   undo     -> sync_quest_undo(quest, time it happened)
//
// Outcomes per item:
//   ok        removed from the queue.
//   conflict  the server already had a different state (e.g. the quest was
//             completed on another device): the server wins, the item is
//             removed and the local optimistic change is rolled back.
//   rejected  a refusal that can never succeed (daily limit, undo too
//             late, quest skipped...): server wins, removed, rolled back,
//             and reported in the banner.
//   offline   stop; this item and everything after it stay queued.
//   error     any other failure: the item stays queued with its attempt
//             count, and so does everything after it (order is kept), so
//             "3 of 5 synced" leaves exactly the other 2 in the queue.
// After a run the app refetches XP, level, streak and the day from the
// server (the source of truth) and drops the optimistic XP of what synced.

import { createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../lib/supabase';
import {
  isMissingSyncRpc,
  isOfflineError,
  markAttempt,
  permanentSyncReason,
  readOfflineQueue,
  removeQueued,
  type QueuedAction,
} from '../lib/offlineQueue';
import { reportOffline, reportOnline } from '../lib/connectivity';
import { fetchGamification } from './slices/gamificationSlice';
import {
  fetchDailyQuests,
  questServerState,
  type QuestThunkState,
} from './slices/questsSlice';
import { syncFinished, type SyncRejection } from './slices/syncSlice';
import { refreshPendingCompletions } from './pendingCompletions';

const SYNC_TIMEOUT_MS = 15000;
/**
 * Gap between two queued actions. The server allows at most 10 quest
 * calls per 5 seconds; 600 ms keeps a long flush under that.
 */
export const FLUSH_PACE_MS = 600;

export const COMPLETED_ELSEWHERE =
  'This quest was already completed on another device, your XP was not doubled.';
export const UNDONE_ELSEWHERE = 'This quest was already undone on another device.';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type SyncStop = 'done' | 'offline' | 'error' | 'signed_out';

export interface SyncResult {
  synced: number;
  /** Server already had the same state from this device (lost answer). */
  duplicates: number;
  /** Server had a different state (another device); server won. */
  conflicts: SyncRejection[];
  /** Server refused for good; server won. */
  rejected: SyncRejection[];
  /** Items still queued after this run. */
  remaining: number;
  stoppedBy: SyncStop;
}

interface RpcError {
  code?: string;
  message?: string;
}

export type Outcome =
  | { kind: 'ok'; duplicate: boolean }
  | { kind: 'conflict'; reason: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

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

function classifyFailure(error: RpcError | null, thrown: unknown): Outcome | null {
  if (thrown) {
    return isOfflineError(thrown)
      ? { kind: 'offline' }
      : { kind: 'error', message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
  if (!error) return null;
  if (isOfflineError(error)) return { kind: 'offline' };
  const reason = permanentSyncReason(error.message);
  if (reason) return { kind: 'rejected', reason };
  return { kind: 'error', message: error.message ?? 'server error' };
}

interface SyncReply {
  duplicate?: boolean;
  conflict?: boolean;
}

function outcomeOf(data: unknown, conflictReason: string): Outcome {
  const reply = (data ?? {}) as SyncReply;
  if (reply.conflict) return { kind: 'conflict', reason: conflictReason };
  return { kind: 'ok', duplicate: Boolean(reply.duplicate) };
}

/** Sends one queued action. Exported for tests. */
export async function syncOne(item: QueuedAction): Promise<Outcome> {
  if (item.kind === 'complete') {
    const res = await callRpc('sync_quest_completion', {
      p_quest_id: item.questId,
      p_client_id: item.clientId,
      p_completed_at: item.at,
    });
    if (!res.thrown && isMissingSyncRpc(res.error)) {
      // Migration 0015 is not on this database yet: fall back to the
      // online RPC (counts on the sync day, still never twice).
      const old = await callRpc('complete_quest', { p_quest_id: item.questId });
      return classifyFailure(old.error, old.thrown) ?? { kind: 'ok', duplicate: false };
    }
    return (
      classifyFailure(res.error, res.thrown) ??
      outcomeOf(res.data, COMPLETED_ELSEWHERE)
    );
  }

  const res = await callRpc('sync_quest_undo', {
    p_quest_id: item.questId,
    p_undone_at: item.at,
  });
  if (!res.thrown && isMissingSyncRpc(res.error)) {
    const old = await callRpc('undo_quest_completion', { p_quest_id: item.questId });
    if (!old.thrown && old.error?.message?.includes('not_completed')) {
      return { kind: 'conflict', reason: UNDONE_ELSEWHERE };
    }
    return classifyFailure(old.error, old.thrown) ?? { kind: 'ok', duplicate: false };
  }
  return (
    classifyFailure(res.error, res.thrown) ??
    outcomeOf(res.data, UNDONE_ELSEWHERE)
  );
}

export interface FlushHooks {
  /** Called when the server's state wins over an optimistic change. */
  onServerState?: (questId: string, completed: boolean) => void;
  paceMs?: number;
}

/**
 * Sends the queue for one user, in order. Used by the Redux thunk in the
 * foreground and by the background task (no Redux) in the background.
 */
export async function flushOfflineQueue(userId: string, hooks: FlushHooks = {}): Promise<SyncResult> {
  const result: SyncResult = {
    synced: 0,
    duplicates: 0,
    conflicts: [],
    rejected: [],
    remaining: 0,
    stoppedBy: 'done',
  };
  const pace = hooks.paceMs ?? FLUSH_PACE_MS;
  const queue = await readOfflineQueue(userId);
  let index = 0;
  for (; index < queue.length; index += 1) {
    const item = queue[index];
    if (index > 0 && pace > 0) await wait(pace);
    const outcome = await syncOne(item);
    if (outcome.kind === 'offline') {
      result.stoppedBy = 'offline';
      reportOffline();
      break;
    }
    if (outcome.kind === 'error') {
      // Kept in the queue (with everything after it, to keep the order).
      await markAttempt(item.clientId, outcome.message);
      result.stoppedBy = 'error';
      break;
    }
    reportOnline();
    await removeQueued(item.clientId);
    if (outcome.kind === 'ok') {
      if (outcome.duplicate) result.duplicates += 1;
      else result.synced += 1;
      continue;
    }
    // Server wins: undo the local optimistic change.
    hooks.onServerState?.(item.questId, item.kind === 'undo');
    const entry = { questId: item.questId, title: item.title, reason: outcome.reason };
    if (outcome.kind === 'conflict') result.conflicts.push(entry);
    else result.rejected.push(entry);
  }
  result.remaining = queue.length - index;
  return result;
}

export const syncOfflineCompletions = createAsyncThunk<
  SyncResult,
  void,
  { state: QuestThunkState }
>(
  'sync/drain',
  async (_, { dispatch, getState }) => {
    const userId = getState().auth.userId;
    if (!userId) {
      dispatch(syncFinished());
      return {
        synced: 0,
        duplicates: 0,
        conflicts: [],
        rejected: [],
        remaining: 0,
        stoppedBy: 'signed_out',
      };
    }
    const result = await flushOfflineQueue(userId, {
      onServerState: (questId, completed) => dispatch(questServerState({ questId, completed })),
    });

    const touched =
      result.synced + result.duplicates + result.conflicts.length + result.rejected.length;
    if (touched > 0) {
      // Server is the source of truth: take its XP first, then drop the
      // optimistic XP of what was synced, then refresh the day. Tagged
      // 'sync' so reward animations do not replay.
      await dispatch(fetchGamification({ reason: 'sync' }));
      await dispatch(refreshPendingCompletions());
      dispatch(fetchDailyQuests({ silent: true }));
    } else {
      await dispatch(refreshPendingCompletions());
    }
    dispatch(syncFinished());
    return result;
  },
  {
    // One flush at a time; a second request while running is ignored.
    condition: (_, { getState }) => !getState().sync.syncing,
  },
);
