// Online/offline status from @react-native-community/netinfo, which works
// on Android and web. A request that fails with a network error also
// marks the app offline straight away (NetInfo can lag a few seconds when
// a train enters a tunnel); NetInfo's next "connected and reachable"
// event brings it back.

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

function set(next: boolean): void {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l(next));
}

/** Connected, and the internet is not known to be unreachable. */
export function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
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

/** Follows NetInfo for the life of the app. Returns the unsubscribe. */
export function watchNetInfo(): () => void {
  return NetInfo.addEventListener((state) => set(isOnlineState(state)));
}

/** Asks NetInfo again (Retry button, app back in the foreground). */
export async function probeConnectivity(): Promise<boolean> {
  try {
    const state = await NetInfo.refresh();
    const next = isOnlineState(state);
    set(next);
    return next;
  } catch {
    return online;
  }
}

/** Test helper. */
export function resetConnectivityForTests(): void {
  online = true;
  listeners.clear();
}
