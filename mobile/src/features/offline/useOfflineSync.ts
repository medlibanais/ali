// Runs the offline sync in the background while signed in: follows
// connectivity, probes while offline, and drains the completion queue
// (in order) whenever the app is online with completions waiting.

import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  isOnline,
  probeConnectivity,
  subscribeConnectivity,
  watchBrowserConnectivity,
} from '../../lib/connectivity';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { syncOfflineCompletions } from '../../store/offlineSync';
import { refreshPendingCompletions } from '../../store/pendingCompletions';
import { connectivityChanged } from '../../store/slices/syncSlice';

const OFFLINE_PROBE_MS = 15000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Delay before retrying after `failures` server errors in a row. */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(MAX_BACKOFF_MS, 15000 * 2 ** (failures - 1));
}

export function useOfflineSync(): void {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((s) => s.auth.userId);
  const online = useAppSelector((s) => s.sync.online);
  const pending = useAppSelector((s) => s.sync.pending);
  const syncing = useAppSelector((s) => s.sync.syncing);
  const failures = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  // Connectivity -> redux.
  useEffect(() => {
    dispatch(connectivityChanged(isOnline()));
    const unsubscribe = subscribeConnectivity((next) => {
      dispatch(connectivityChanged(next));
    });
    const unwatch = watchBrowserConnectivity();
    probeConnectivity().catch(() => undefined);
    return () => {
      unsubscribe();
      unwatch();
    };
  }, [dispatch]);

  // Count what this account has waiting (also after switching accounts).
  useEffect(() => {
    dispatch(refreshPendingCompletions());
  }, [dispatch, userId]);

  // Coming back to the app is a good moment to check the connection.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') probeConnectivity().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  // While offline, knock every 15 s.
  useEffect(() => {
    if (online) return undefined;
    const id = setInterval(() => {
      probeConnectivity().catch(() => undefined);
    }, OFFLINE_PROBE_MS);
    return () => clearInterval(id);
  }, [online]);

  // Drain whenever online with something waiting.
  useEffect(() => {
    if (!userId || !online || pending === 0 || syncing) return undefined;
    const timer = setTimeout(() => {
      dispatch(syncOfflineCompletions()).then((res) => {
        if (
          syncOfflineCompletions.fulfilled.match(res) &&
          res.payload.stoppedBy === 'error'
        ) {
          failures.current += 1;
          setRetryTick((t) => t + 1);
        } else if (syncOfflineCompletions.fulfilled.match(res)) {
          failures.current = 0;
        }
      });
    }, retryDelayMs(failures.current));
    return () => clearTimeout(timer);
  }, [dispatch, userId, online, pending, syncing, retryTick]);
}
