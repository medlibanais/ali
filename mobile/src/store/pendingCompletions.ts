// Keeps the "waiting to sync" count and the optimistic XP in step with the
// offline queue on disk. Imported by the quests slice and the sync thunk.

import { createAsyncThunk } from '@reduxjs/toolkit';
import { localDateOf, pendingXpOf, readOfflineQueue } from '../lib/offlineQueue';
import { pendingXpChanged } from './slices/gamificationSlice';
import { pendingChanged } from './slices/syncSlice';

interface AuthSlice {
  auth: { userId: string | null };
}

export const refreshPendingCompletions = createAsyncThunk<
  number,
  void,
  { state: AuthSlice }
>('sync/refreshPending', async (_, { dispatch, getState }) => {
  const userId = getState().auth.userId;
  const queue = userId ? await readOfflineQueue(userId) : [];
  dispatch(pendingChanged(queue.length));
  dispatch(pendingXpChanged(pendingXpOf(queue, localDateOf(new Date()))));
  return queue.length;
});
