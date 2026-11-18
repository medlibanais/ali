// A small on-disk cache for the 3D avatar's rendered pictures.
//
// Rendering an avatar means booting a WebView, loading three.js and the
// 46 MB human model, then drawing. That used to happen on every launch
// before the Today avatar could appear. With this cache the pictures the
// app shows every day (the Today and Profile avatars, open-eyed and
// blinking) are read back from disk at startup, so the avatar shows at
// once and the WebView is not started at all while nothing new is needed.
//
// Android: one PNG file per picture in the app's cache folder, shown by
// file URI (the image bytes stay out of the JS heap).
// Web: localStorage, a few entries only, because its quota is small.
//
// The cache key includes the content hashes of viewer.html and the model,
// so rebuilding either one makes old pictures miss instead of showing a
// stale look.

import { Platform } from 'react-native';

/** Most pictures kept. Each is about 50-150 KB. */
const MAX_NATIVE = 48;
const MAX_WEB = 10;
const WEB_PREFIX = 'grow.avatar3d.';
const WEB_INDEX = 'grow.avatar3d.index';

/** cyrb53: a fast 53-bit string hash, plenty to name cache files. */
export function hashKey(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

let version = '';
/** Set once from the viewer and model asset hashes. */
export function setCacheVersion(v: string) {
  version = v;
}

function fileName(key: string): string {
  return `${hashKey(`${version}|${key}`)}.png`;
}

// ------------------------------------------------------------- native

type FS = typeof import('expo-file-system');
let fsModule: FS | null = null;
function fs(): FS {
  // Loaded lazily so the web bundle never touches the native module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (!fsModule) fsModule = require('expo-file-system') as FS;
  return fsModule;
}

function nativeDir(): string | null {
  const base = fs().cacheDirectory;
  return base ? `${base}avatar3d/` : null;
}

let dirReady: Promise<void> | null = null;
function ensureDir(dir: string): Promise<void> {
  if (!dirReady) {
    dirReady = fs()
      .makeDirectoryAsync(dir, { intermediates: true })
      .catch(() => undefined);
  }
  return dirReady;
}

async function nativeLoad(key: string): Promise<string | null> {
  const dir = nativeDir();
  if (!dir) return null;
  const path = dir + fileName(key);
  const info = await fs().getInfoAsync(path);
  return info.exists && !info.isDirectory ? path : null;
}

async function nativeSave(key: string, dataUrl: string): Promise<void> {
  const dir = nativeDir();
  const comma = dataUrl.indexOf(',');
  if (!dir || comma < 0) return;
  await ensureDir(dir);
  await fs().writeAsStringAsync(dir + fileName(key), dataUrl.slice(comma + 1), {
    encoding: fs().EncodingType.Base64,
  });
  await nativePrune(dir);
}

async function nativePrune(dir: string): Promise<void> {
  const names = await fs().readDirectoryAsync(dir);
  if (names.length <= MAX_NATIVE) return;
  const stats = await Promise.all(
    names.map(async (name) => {
      const info = await fs().getInfoAsync(dir + name);
      return { name, time: info.exists ? info.modificationTime ?? 0 : 0 };
    }),
  );
  stats.sort((a, b) => a.time - b.time);
  await Promise.all(
    stats
      .slice(0, stats.length - MAX_NATIVE)
      .map((s) => fs().deleteAsync(dir + s.name, { idempotent: true })),
  );
}

// ---------------------------------------------------------------- web

function webStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function webIndex(store: Storage): string[] {
  try {
    const raw = store.getItem(WEB_INDEX);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function webLoad(key: string): string | null {
  const store = webStore();
  if (!store) return null;
  try {
    return store.getItem(WEB_PREFIX + fileName(key));
  } catch {
    return null;
  }
}

function webSave(key: string, dataUrl: string): void {
  const store = webStore();
  if (!store) return;
  const name = fileName(key);
  const index = webIndex(store).filter((n) => n !== name);
  index.push(name);
  // Oldest out first; also make room if the quota is hit.
  while (index.length > MAX_WEB) store.removeItem(WEB_PREFIX + index.shift());
  for (;;) {
    try {
      store.setItem(WEB_PREFIX + name, dataUrl);
      store.setItem(WEB_INDEX, JSON.stringify(index));
      return;
    } catch {
      const oldest = index.length > 1 ? index.shift() : undefined;
      if (!oldest) return;
      store.removeItem(WEB_PREFIX + oldest);
    }
  }
}

// ---------------------------------------------------------------- API

/** A URI for the cached picture, or null if it was never saved. */
export async function loadCachedRender(key: string): Promise<string | null> {
  try {
    return Platform.OS === 'web' ? webLoad(key) : await nativeLoad(key);
  } catch {
    return null;
  }
}

/** Saves a freshly drawn picture (a PNG data URL). Never throws. */
export async function saveCachedRender(key: string, dataUrl: string): Promise<void> {
  if (!dataUrl.startsWith('data:image/')) return;
  try {
    if (Platform.OS === 'web') webSave(key, dataUrl);
    else await nativeSave(key, dataUrl);
  } catch {
    // A full disk only costs a re-render next launch.
  }
}
