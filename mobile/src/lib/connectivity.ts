// Lightweight connectivity tracking without a native module (NetInfo would
// need a new dev build). The app is "offline" when a request fails with a
// network error, or when the browser says so on web. While offline, the
// sync hook probes the Supabase health endpoint until it answers.

import { Platform } from 'react-native';

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

function set(next: boolean): void {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l(next));
}

export function isOnline(): boolean {
  return online;
}

export function reportOffline(): void {
  set(false);
}

export function reportOnline(): void {
  set(true);
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Asks the backend whether it is reachable. Any HTTP answer counts as
 * online; a thrown fetch or a timeout counts as offline.
 */
export async function probeConnectivity(timeoutMs = 5000): Promise<boolean> {
  if (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    set(false);
    return false;
  }
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!base) return online;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    await fetch(`${base}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: key },
      signal: controller?.signal,
    });
    set(true);
    return true;
  } catch {
    set(false);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Web only: follow the browser's online/offline events. */
export function watchBrowserConnectivity(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.addEventListener) {
    return () => undefined;
  }
  const goOnline = () => {
    probeConnectivity().catch(() => undefined);
  };
  const goOffline = () => set(false);
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) set(false);
  return () => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  };
}

/** Test helper. */
export function resetConnectivityForTests(): void {
  online = true;
  listeners.clear();
}
