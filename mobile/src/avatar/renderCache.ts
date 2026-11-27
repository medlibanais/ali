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
//
// Portraits: the person's own everyday avatar also has a named slot
// ('<user id>:today|head|0') that points at its newest picture. After an
// app update (new model, so every key misses) or an edit on another phone,
// the slot's old picture is shown at once while the new one renders, and
// the eviction below never deletes a picture a slot points at. Slots are
// cleared on sign-out.

import { Platform } from 'react-native';

/** Most pictures kept. Each is about 50-150 KB. */
const MAX_NATIVE = 48;
// Measured: a head picture is about 185 KB, a full body about 250 KB, so
// 48 entries could reach about 12 MB. Keep the folder under 8 MB as well.
export const MAX_NATIVE_BYTES = 8 * 1024 * 1024;
const MAX_WEB = 10;
const WEB_PREFIX = 'grow.avatar3d.';
const WEB_INDEX = 'grow.avatar3d.index';
const WEB_PORTRAITS = 'grow.avatar3d.portraits';
const PORTRAITS_FILE = 'portraits.json';
/** Slot -> picture file name. */
type Portraits = Record<string, string>;
const MAX_PORTRAITS = 8;

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
  const keep = new Set(Object.values(await nativePortraits(dir)));
  const names = (await fs().readDirectoryAsync(dir)).filter((n) => n.endsWith('.png'));
  const stats = await Promise.all(
    names.map(async (name) => {
      const info = await fs().getInfoAsync(dir + name);
      return info.exists
        ? { name, time: info.modificationTime ?? 0, size: info.size ?? 0 }
        : { name, time: 0, size: 0 };
    }),
  );
  const doomed = pickEvictions(stats, MAX_NATIVE, MAX_NATIVE_BYTES, keep);
  await Promise.all(doomed.map((name) => fs().deleteAsync(dir + name, { idempotent: true })));
}

/** Oldest files to delete so at most `maxCount` files and `maxBytes` remain. */
export function pickEvictions(
  files: { name: string; time: number; size: number }[],
  maxCount: number,
  maxBytes: number,
  keep: ReadonlySet<string> = new Set(),
): string[] {
  const byAge = [...files].sort((a, b) => a.time - b.time);
  let count = byAge.length;
  let bytes = byAge.reduce((sum, f) => sum + f.size, 0);
  const out: string[] = [];
  // Never delete the newest file (the picture just saved), nor a portrait.
  for (const f of byAge.slice(0, -1)) {
    if (count <= maxCount && bytes <= maxBytes) break;
    if (keep.has(f.name)) continue;
    out.push(f.name);
    count -= 1;
    bytes -= f.size;
  }
  return out;
}

async function nativePortraits(dir: string): Promise<Portraits> {
  try {
    const info = await fs().getInfoAsync(dir + PORTRAITS_FILE);
    if (!info.exists) return {};
    return parsePortraits(await fs().readAsStringAsync(dir + PORTRAITS_FILE));
  } catch {
    return {};
  }
}

async function nativeSetPortrait(slot: string, name: string): Promise<void> {
  const dir = nativeDir();
  if (!dir) return;
  await ensureDir(dir);
  const next = withPortrait(await nativePortraits(dir), slot, name);
  await fs().writeAsStringAsync(dir + PORTRAITS_FILE, JSON.stringify(next));
}

async function nativeLoadPortrait(slot: string): Promise<string | null> {
  const dir = nativeDir();
  if (!dir) return null;
  const name = (await nativePortraits(dir))[slot];
  if (!name) return null;
  const info = await fs().getInfoAsync(dir + name);
  return info.exists && !info.isDirectory ? dir + name : null;
}

/** Reads a slot index, dropping anything that is not slot -> file name. */
export function parsePortraits(raw: string | null): Portraits {
  try {
    const obj: unknown = raw ? JSON.parse(raw) : {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: Portraits = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string' && /^[a-z0-9]+\.png$/.test(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** The index with this slot pointed at `name`, newest last, capped. */
export function withPortrait(index: Portraits, slot: string, name: string): Portraits {
  const entries = Object.entries(index).filter(([k]) => k !== slot);
  entries.push([slot, name]);
  return Object.fromEntries(entries.slice(-MAX_PORTRAITS));
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

function webPortraits(store: Storage): Portraits {
  try {
    return parsePortraits(store.getItem(WEB_PORTRAITS));
  } catch {
    return {};
  }
}

function webSave(key: string, dataUrl: string): void {
  const store = webStore();
  if (!store) return;
  const name = fileName(key);
  const keep = new Set(Object.values(webPortraits(store)));
  const index = webIndex(store).filter((n) => n !== name);
  index.push(name);
  // Oldest out first (portraits stay); also make room if the quota is hit.
  const evictOne = (): boolean => {
    const at = index.findIndex((n, i) => i < index.length - 1 && !keep.has(n));
    if (at < 0) return false;
    store.removeItem(WEB_PREFIX + index[at]);
    index.splice(at, 1);
    return true;
  };
  while (index.length > MAX_WEB && evictOne());
  for (;;) {
    try {
      store.setItem(WEB_PREFIX + name, dataUrl);
      store.setItem(WEB_INDEX, JSON.stringify(index));
      return;
    } catch {
      if (!evictOne()) return;
    }
  }
}

function webSetPortrait(slot: string, name: string): void {
  const store = webStore();
  if (!store) return;
  try {
    store.setItem(WEB_PORTRAITS, JSON.stringify(withPortrait(webPortraits(store), slot, name)));
  } catch {
    // quota: the slot just keeps its older picture
  }
}

function webLoadPortrait(slot: string): string | null {
  const store = webStore();
  if (!store) return null;
  const name = webPortraits(store)[slot];
  if (!name) return null;
  try {
    return store.getItem(WEB_PREFIX + name);
  } catch {
    return null;
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

/**
 * Saves a freshly drawn picture (a PNG data URL), and points the portrait
 * slot at it when one is given. Never throws.
 */
export async function saveCachedRender(key: string, dataUrl: string, portrait?: string): Promise<void> {
  if (!dataUrl.startsWith('data:image/')) return;
  try {
    if (Platform.OS === 'web') webSave(key, dataUrl);
    else await nativeSave(key, dataUrl);
    if (portrait) await pointPortrait(portrait, key);
  } catch {
    // A full disk only costs a re-render next launch.
  }
}

/** Points a portrait slot at the saved picture of `key`. Never throws. */
export async function pointPortrait(slot: string, key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') webSetPortrait(slot, fileName(key));
    else await nativeSetPortrait(slot, fileName(key));
  } catch {
    // keeps the older picture
  }
}

/** The newest picture of a portrait slot from any app version, or null. */
export async function loadPortrait(slot: string): Promise<string | null> {
  try {
    return Platform.OS === 'web' ? webLoadPortrait(slot) : await nativeLoadPortrait(slot);
  } catch {
    return null;
  }
}

/** Forgets every portrait slot (sign-out). The pictures age out as usual. */
export async function clearPortraits(): Promise<void> {
  try {
    if (Platform.OS === 'web') webStore()?.removeItem(WEB_PORTRAITS);
    else {
      const dir = nativeDir();
      if (dir) await fs().deleteAsync(dir + PORTRAITS_FILE, { idempotent: true });
    }
  } catch {
    // nothing to clear
  }
}
