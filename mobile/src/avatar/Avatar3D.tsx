// The realistic 3D avatar. One hidden WebView (Avatar3DHost, mounted once
// at the app root) runs the three.js viewer (assets/avatar3d/viewer.html)
// and renders every avatar the app asks for into a PNG, one at a time.
// Avatar3D shows that image; until it is ready it shows a quiet
// placeholder. Images are cached by everything that changes them, so
// each look renders once per session.
//
// To feel alive, the image breathes (a UI-thread scale anchored at the
// bottom, paced by the life score, see alive.ts) and blinks: each look is
// also rendered once with the eyes shut, and that image is shown for the
// ~0.2 s of a blink. Both are View transforms/opacity, cheap on Android.
//
// Startup and memory: the Today and Profile pictures are also saved to
// disk (renderCache.ts), so a normal launch shows the avatar straight from
// the cache and never starts the WebView. The WebView (three.js plus the
// 46 MB model, the heaviest thing in the app) is only mounted when a look
// is missing, after the first screen has settled, and it is unmounted
// again after a quiet spell so its memory goes back to the system.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Skeleton from '../components/Skeleton';
import { runAfterInteractionsOrTimeout } from '../lib/afterInteractions';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useAliveMotion } from './alive';
import { Asset } from 'expo-asset';
import { bgStyle } from './palettes';
import { loadCachedRender, saveCachedRender, setCacheVersion } from './renderCache';
import { irisFor, partsFor, skinFor, targetsFor } from './shape';
import type { AvatarConfig, Mood } from './types';
import { MODEL_PARTS_VERSION, PACK_ASSETS, PART_PACKS } from './modelParts';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const VIEWER = require('../../assets/avatar3d/viewer.html');
// The human every avatar is shaped from (built by tools/human/build.py and
// split by scripts/split-human.mjs): a core every render needs, plus one
// pack per hair, outfit, shoes, glasses and skin, loaded only when worn.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MODEL: number = require('../../assets/avatar3d/models/core.bin');
// A new viewer or model changes these hashes, so old disk pictures miss.
setCacheVersion(`${Asset.fromModule(VIEWER).hash ?? ''}:${Asset.fromModule(MODEL).hash ?? ''}:${MODEL_PARTS_VERSION}`);

/** 'head-thumb' and 'body-thumb' are the small pictures on the editor's choices. */
export type Mode = 'head' | 'full-body' | 'head-thumb' | 'body-thumb' | 'head-hd' | 'body-hd';

/** Pixel size each mode is rendered at (the image is scaled to fit). */
export const RENDER_SIZE: Record<Mode, { w: number; h: number }> = {
  head: { w: 384, h: 384 },
  'full-body': { w: 300, h: 660 },
  'head-thumb': { w: 144, h: 144 },
  'body-thumb': { w: 110, h: 242 },
  // Sent to the photo maker, so they are rendered large.
  'head-hd': { w: 768, h: 768 },
  'body-hd': { w: 576, h: 1264 },
};

export interface RenderRequest {
  key: string;
  mode: Mode;
  command: Record<string, unknown>;
  /**
   * Requests in the same channel replace each other while they wait: a
   * live preview only ever wants the newest. The 'editor' channel also
   * jumps the queue.
   */
  channel?: string;
  /** Save the picture to disk and look there first (everyday looks only). */
  persist?: boolean;
}

// ---------------------------------------------------------------- store

const images = new Map<string, string>();
const queue: RenderRequest[] = [];
// Dragging a slider asks for many looks: keep the newest images only.
const MAX_IMAGES = 140;
function remember(key: string, data: string) {
  images.delete(key);
  images.set(key, data);
  while (images.size > MAX_IMAGES) {
    const oldest = images.keys().next().value;
    if (oldest === undefined) break;
    images.delete(oldest);
  }
}
const listeners = new Set<() => void>();
let pump: (() => void) | null = null;
/** Keys being looked up on disk, so a look is not queued twice meanwhile. */
const lookingUp = new Set<string>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ------------------------------------------------- host lifecycle state

/** True while the hidden renderer should be mounted. */
let hostWanted = false;
/** Avatar3D views with a live preview (the editor) keep the host warm. */
let liveUsers = 0;
const hostListeners = new Set<() => void>();
function setHostWanted(v: boolean) {
  if (hostWanted === v) return;
  hostWanted = v;
  hostListeners.forEach((l) => l());
}
function subscribeHost(l: () => void) {
  hostListeners.add(l);
  return () => hostListeners.delete(l);
}
const getHostWanted = () => hostWanted;

function enqueue(req: RenderRequest) {
  if (images.has(req.key)) return;
  if (req.channel) {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].channel === req.channel) queue.splice(i, 1);
    // The editor's main preview goes first; its small pictures wait their turn.
    if (req.channel === 'editor') queue.unshift(req);
    else queue.push(req);
  } else {
    if (queue.some((q) => q.key === req.key)) return;
    queue.push(req);
  }
  setHostWanted(true);
  pump?.();
}

export function requestRender(req: RenderRequest) {
  if (images.has(req.key) || lookingUp.has(req.key)) return;
  if (!req.persist) {
    enqueue(req);
    return;
  }
  lookingUp.add(req.key);
  loadCachedRender(req.key).then((uri) => {
    lookingUp.delete(req.key);
    if (uri) {
      remember(req.key, uri);
      emit();
    } else {
      enqueue(req);
    }
  });
}

/** Test hook: the renderer's mounted state and in-memory pictures. */
export const __avatar3dInternals = {
  isHostWanted: getHostWanted,
  imageCount: () => images.size,
  reset() {
    images.clear();
    queue.length = 0;
    lookingUp.clear();
    liveUsers = 0;
    setHostWanted(false);
  },
};

/** Where the camera stands: the usual 3/4 view unless the editor turns it. */
export interface Camera {
  /** Turn around the avatar, in radians. */
  yaw?: number;
  /** Head mode: 1 the bust, up to about 2 for a close-up of the face. */
  zoom?: number;
}

function commandFor(config: AvatarConfig, mood: Mood, mode: Mode, bare: boolean, camera: Camera, eyesClosed = false) {
  const bg = bgStyle(config.bg);
  const head = mode === 'head' || mode === 'head-thumb' || mode === 'head-hd';
  return {
    type: 'render',
    targets: targetsFor(config, mood, eyesClosed),
    skin: skinFor(config),
    parts: partsFor(config),
    eyeColor: irisFor(config),
    pose: config.pose,
    colors: { bgFrom: bg.from, bgTo: bg.to },
    yaw: camera.yaw ?? (head ? 0.22 : 0.3),
    zoom: camera.zoom ?? 1,
    mode: head ? 'head' : 'full-body',
    bare,
    snapshot: true,
  };
}

/** Everything that changes the picture, so each look renders once. */
export function renderKey(config: AvatarConfig, mood: Mood, mode: Mode, bare: boolean, camera: Camera = {}): string {
  return JSON.stringify([mode, commandFor(config, mood, mode, bare, camera)]);
}

/** Cache a neutral portrait when someone explicitly saves a look in the editor. */
export function cacheAvatarPortrait(config: AvatarConfig): void {
  const key = renderKey(config, 'neutral', 'head', false);
  const ready = images.get(key);
  if (ready) {
    void saveCachedRender(key, ready);
    return;
  }
  requestRender({ key, mode: 'head', command: commandFor(config, 'neutral', 'head', false, {}), persist: true });
}

/** Read-only snapshot for Today. A cache miss never starts the 3D renderer. */
export function useAvatarPortrait(config: AvatarConfig, mood: Mood, enabled: boolean): string | null {
  const key = enabled ? renderKey(config, mood, 'head', false) : '';
  const neutral = enabled && mood !== 'neutral' ? renderKey(config, 'neutral', 'head', false) : key;
  const version = `${key}:${neutral}`;
  const [disk, setDisk] = useState<{ version: string; uri: string | null } | null>(null);
  const readMemory = () => enabled ? images.get(key) || images.get(neutral) : null;
  const memory = useSyncExternalStore(subscribe, readMemory, () => null);
  useEffect(() => {
    if (!enabled || memory) return;
    let active = true;
    void (async () => {
      const uri = await loadCachedRender(key) ?? (key === neutral ? null : await loadCachedRender(neutral));
      if (active) setDisk({ version, uri });
    })();
    return () => { active = false; };
  }, [enabled, key, memory, neutral, version]);
  return enabled ? memory || (disk?.version === version ? disk.uri : null) : null;
}

/**
 * One finished picture of this look, as a data URL, for sending to the
 * photo maker. Rejects if the renderer cannot draw it.
 */
export function renderOnce(config: AvatarConfig, mood: Mood, mode: Mode, camera: Camera = {}): Promise<string> {
  const key = renderKey(config, mood, mode, true, camera);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(i18n.t('avatar3d.tooSlow')));
    }, 60_000);
    const check = () => {
      const data = images.get(key);
      if (data === undefined) return;
      clearTimeout(timer);
      unsubscribe();
      if (data) resolve(data);
      else reject(new Error(i18n.t('avatar3d.drawFailed')));
    };
    const unsubscribe = subscribe(check);
    requestRender({ key, mode, command: commandFor(config, mood, mode, true, camera), channel: 'editor' });
    check();
  });
}

// ---------------------------------------------------------------- host

async function assetUri(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  if (Platform.OS !== 'web') await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

/** Model packs a render command needs (see modelParts.ts). */
export function packsFor(command: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const parts = (command.parts as { id: string }[] | undefined) ?? [];
  for (const part of parts) for (const name of PART_PACKS[part.id] ?? []) names.add(name);
  const skin = (command.skin as { id?: string } | undefined)?.id;
  if (skin) for (const name of PART_PACKS[`skin:${skin}`] ?? []) names.add(name);
  return [...names].sort();
}

const packUris = new Map<string, Promise<string>>();

/** URL (web) or local file (Android) of each pack, resolved once. */
export function packUrls(names: string[]): Promise<Record<string, string>> {
  return Promise.all(
    names.map((name) => {
      let p = packUris.get(name);
      if (!p) {
        const module = PACK_ASSETS[name];
        p = module === undefined ? Promise.reject(new Error(`unknown pack ${name}`)) : assetUri(module);
        packUris.set(name, p);
        p.catch(() => packUris.delete(name));
      }
      return p.then((uri) => [name, uri] as const);
    }),
  ).then((pairs) => Object.fromEntries(pairs));
}

/**
 * Mount once, near the app root. Hidden; it only renders avatars into
 * images for Avatar3D.
 */
/** How long the renderer may sit idle before it is unmounted. */
const HOST_IDLE_MS = 20_000;

export function Avatar3DHost() {
  const wanted = useSyncExternalStore(subscribeHost, getHostWanted, getHostWanted);
  // Start the renderer only once the first screen has finished drawing,
  // so the WebView's start-up does not compete with it.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const task = runAfterInteractionsOrTimeout(() => setSettled(true));
    return () => task.cancel();
  }, [wanted]);
  if (!wanted || !settled) return null;
  return <RendererHost />;
}

function RendererHost() {
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('head');
  const ready = useRef(false);
  const busy = useRef<RenderRequest | null>(null);
  const send = useRef<(json: string) => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    Promise.all([assetUri(VIEWER), assetUri(MODEL)])
      .then(([v, m]) => {
        if (!alive) return;
        setViewerUri(v);
        setModelUri(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      pump = null;
    },
    [],
  );

  const next = () => {
    if (!ready.current || busy.current || !modelUri) return;
    const req = queue.shift();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (!req) {
      // Nothing to draw: let the WebView go after a quiet spell, unless
      // the editor is open and will want it again any second.
      idleTimer.current = setTimeout(() => {
        if (queue.length === 0 && !busy.current && liveUsers === 0) setHostWanted(false);
      }, HOST_IDLE_MS);
      return;
    }
    busy.current = req;
    setMode(req.mode);
    // Resolve only the packs this look wears, then give the view a frame
    // to take the mode's size before rendering.
    packUrls(packsFor(req.command))
      .then((packs) => {
        setTimeout(() => send.current(JSON.stringify({ ...req.command, model: modelUri, packs })), 60);
      })
      .catch(() => onMessage(JSON.stringify({ type: 'error' })));
  };
  pump = next;

  const onMessage = (data: string) => {
    let msg: { type?: string; data?: string } = {};
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready.current = true;
      next();
    } else if (msg.type === 'snapshot' && busy.current && msg.data) {
      if (busy.current.persist) void saveCachedRender(busy.current.key, msg.data);
      remember(busy.current.key, msg.data);
      busy.current = null;
      emit();
      next();
    } else if (msg.type === 'error' && busy.current) {
      remember(busy.current.key, '');
      busy.current = null;
      emit();
      next();
    }
  };

  if (!viewerUri || !modelUri) return null;
  const size = RENDER_SIZE[mode];
  const style = [styles.host, { width: size.w, height: size.h }];

  if (Platform.OS === 'web') {
    return (
      <WebFrame
        uri={viewerUri}
        style={StyleSheet.flatten(style)}
        onMessage={onMessage}
        bindSend={(fn) => {
          send.current = fn;
        }}
      />
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WebView } = require('react-native-webview');
  return (
    <View style={style} pointerEvents="none">
      <WebView
        ref={(r: { injectJavaScript: (js: string) => void } | null) => {
          if (r) send.current = (json: string) => r.injectJavaScript(`window.avatarCommand(${JSON.stringify(json)});true;`);
        }}
        source={{ uri: viewerUri }}
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowingReadAccessToURL={viewerUri.replace(/[^/]*$/, '')}
        javaScriptEnabled
        style={styles.transparent}
        containerStyle={styles.transparent}
        onMessage={(e: { nativeEvent: { data: string } }) => onMessage(e.nativeEvent.data)}
      />
    </View>
  );
}

function WebFrame({
  uri,
  style,
  onMessage,
  bindSend,
}: {
  uri: string;
  style: object;
  onMessage: (data: string) => void;
  bindSend: (fn: (json: string) => void) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (ref.current && e.source === ref.current.contentWindow && typeof e.data === 'string') onMessage(e.data);
    };
    window.addEventListener('message', handler);
    bindSend((json) => ref.current?.contentWindow?.postMessage(json, '*'));
    return () => window.removeEventListener('message', handler);
  });
  return React.createElement('iframe', {
    ref,
    src: uri,
    title: 'avatar renderer',
    style: { ...style, border: 0, background: 'transparent' },
  });
}

// ---------------------------------------------------------------- view

export interface Avatar3DProps {
  config: AvatarConfig;
  size?: number;
  mood?: Mood;
  mode?: Mode;
  bare?: boolean;
  animated?: boolean;
  /** Life score for the breathing pace (see AvatarView). */
  score?: number | SharedValue<number>;
  /** Editor only: turn and zoom the camera. */
  camera?: Camera;
  /** Editor only: a live preview that drops looks it no longer needs. */
  live?: string;
}

const NO_CAMERA: Camera = {};

/** Breath scale of the whole image, anchored at its bottom edge. */
const BREATH_SCALE: Record<Mode, number> = { head: 0.012, 'full-body': 0.008, 'head-thumb': 0, 'body-thumb': 0, 'head-hd': 0, 'body-hd': 0 };

export function Avatar3D({ config, size = 120, mood = 'neutral', mode = 'head', bare = false, animated = true, score, camera = NO_CAMERA, live }: Avatar3DProps) {
  const { t } = useTranslation();
  const key = renderKey(config, mood, mode, bare, camera);
  const blinkKey = `${key}:blink`;
  // The eyes-shut frame, only when it belongs to the image on screen.
  const blinkUri = useSyncExternalStore(
    subscribe,
    () => images.get(blinkKey),
    () => images.get(blinkKey),
  );
  const { breath, eyes } = useAliveMotion(score, animated);
  // Subscribe to this avatar's own image only: other avatars finishing
  // their renders must not re-render this one.
  const ready = useSyncExternalStore(
    subscribe,
    () => images.get(key),
    () => images.get(key),
  );
  // While a new look renders (e.g. the mood changed after a quest), keep
  // showing the previous image instead of dropping back to the 2D avatar.
  const lastShown = useRef<{ uri: string; mode: Mode } | null>(null);
  if (ready) lastShown.current = { uri: ready, mode };
  const uri =
    ready || (lastShown.current?.mode === mode ? lastShown.current.uri : undefined);
  // The everyday looks (Today, Profile) are kept on disk across launches.
  const persist = !live && (mode === 'head' || mode === 'full-body');
  useEffect(() => {
    if (!live) return;
    liveUsers += 1;
    return () => {
      liveUsers -= 1;
    };
  }, [live]);
  useEffect(() => {
    requestRender({ key, mode, command: commandFor(config, mood, mode, bare, camera), channel: live, persist });
    // Queued after the open-eyes image, so the avatar shows up first.
    if (animated) requestRender({ key: blinkKey, mode, command: commandFor(config, mood, mode, bare, camera, true), persist });
    // config fields are all in the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, animated]);

  const box = RENDER_SIZE[mode];
  const height = size;
  const width = Math.round((size * box.w) / box.h);
  const amp = BREATH_SCALE[mode];
  const breathStyle = useAnimatedStyle(() => {
    const s = 1 + amp * breath.value;
    // Scale about the bottom edge: the shoulders rise, nothing slides.
    return { transform: [{ translateY: (height / 2) * (1 - s) }, { scale: s }] };
  });
  const shutStyle = useAnimatedStyle(() => ({ opacity: eyes.value < 0.5 ? 1 : 0 }));
  const head = mode === 'head' || mode === 'head-thumb';
  if (!uri) {
    // Still rendering, or the renderer failed.
    return (
      <View style={[styles.waiting, head && !bare ? styles.round : null, bare ? null : styles.waitingFill, { width, height }]} accessibilityLabel={t('avatar3d.yourAvatarIsLoading')}>
        {size >= 64 && ready !== '' ? (
          <Skeleton
            width={width}
            height={height}
            borderRadius={head && !bare ? width / 2 : 0}
            style={styles.waitingShimmer}
          />
        ) : null}
      </View>
    );
  }
  return (
    <View style={[head && !bare ? styles.round : null, { width, height }]} accessibilityLabel={t('avatar3d.yourAvatar')}>
      <Animated.View style={[{ width, height }, animated ? breathStyle : null]}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
        {animated && blinkUri && ready ? (
          <Animated.View style={[StyleSheet.absoluteFill, shutStyle]} pointerEvents="none">
            <Image source={{ uri: blinkUri }} style={{ width, height }} resizeMode="contain" />
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  waitingShimmer: { position: 'absolute', left: 0, top: 0, backgroundColor: 'transparent' },
  host: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0.01,
    zIndex: -1,
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  round: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  waiting: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingFill: {
    backgroundColor: 'rgba(140,146,156,0.18)',
  },
});

export default Avatar3D;
