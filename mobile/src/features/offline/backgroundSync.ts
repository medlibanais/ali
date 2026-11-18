// Background flush of the offline queue (Android).
//
// expo-background-fetch + expo-task-manager wake the app's JS in the
// background and run this task. Android decides when: about every 15
// minutes at best, batched with other apps, and not while the phone is in
// deep sleep. So this is the safety net for "phone back in the pocket";
// the instant flush on reconnect happens in the foreground (useOfflineSync
// listening to NetInfo).
//
// The task only reads the stored session and the MMKV queue and talks to
// Supabase; it does not touch Redux. The next time the app opens, the
// usual refresh shows the synced state.

import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../../lib/supabase';
import { probeConnectivity } from '../../lib/connectivity';
import { flushOfflineQueue } from '../../store/offlineSync';

export const OFFLINE_SYNC_TASK = 'prayerlock-offline-sync';

/** Runs one background flush. Exported for tests. */
export async function runBackgroundSync(): Promise<BackgroundFetch.BackgroundFetchResult> {
  try {
    if (!(await probeConnectivity())) return BackgroundFetch.BackgroundFetchResult.NoData;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return BackgroundFetch.BackgroundFetchResult.NoData;
    const result = await flushOfflineQueue(userId);
    if (result.stoppedBy === 'error') return BackgroundFetch.BackgroundFetchResult.Failed;
    const sent = result.synced + result.duplicates + result.conflicts.length + result.rejected.length;
    return sent > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

// Must run at module load (imported from index.js), so Android can start
// the task without the UI.
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(OFFLINE_SYNC_TASK, () => runBackgroundSync());
  } catch {
    // Expo Go or an older dev build without the native module.
  }
}

/** Registers the periodic task once per install. Safe to call often. */
export async function registerBackgroundSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(OFFLINE_SYNC_TASK)) return;
    await BackgroundFetch.registerTaskAsync(OFFLINE_SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Not available in this build: the foreground sync still works.
  }
}
