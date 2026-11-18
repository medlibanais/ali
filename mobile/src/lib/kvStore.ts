// Small synchronous key-value store for offline data.
//   Android: react-native-mmkv (memory-mapped file, survives restarts and
//            process kills, much faster than AsyncStorage).
//   Web:     window.localStorage (MMKV is native-only).
// If neither is available (very old WebView, private mode), an in-memory
// map keeps the app working for the session instead of crashing.

import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';

export interface KvStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

function memoryStore(): KvStore {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v);
    },
    delete: (k) => {
      map.delete(k);
    },
  };
}

function webStore(): KvStore {
  if (typeof window === 'undefined' || !window.localStorage) return memoryStore();
  const ls = window.localStorage;
  return {
    getString: (k) => ls.getItem(k) ?? undefined,
    set: (k, v) => ls.setItem(k, v),
    delete: (k) => ls.removeItem(k),
  };
}

function nativeStore(): KvStore {
  try {
    const mmkv = new MMKV({ id: 'prayerlock-offline' });
    return {
      getString: (k) => mmkv.getString(k),
      set: (k, v) => mmkv.set(k, v),
      delete: (k) => mmkv.delete(k),
    };
  } catch {
    // Expo Go or a dev build made before MMKV was added.
    return memoryStore();
  }
}

export const kvStore: KvStore = Platform.OS === 'web' ? webStore() : nativeStore();

export function readJson<T>(key: string): T | null {
  try {
    const raw = kvStore.getString(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    kvStore.set(key, JSON.stringify(value));
  } catch {
    // storage full: offline data is best-effort beyond this point
  }
}
