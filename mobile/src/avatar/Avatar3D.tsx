// 3D anime avatar. One hidden WebView (Avatar3DHost, mounted once at the
// app root) runs the three.js + VRM viewer (assets/avatar3d/viewer.html)
// and renders every avatar the app asks for into a PNG, one at a time.
// Avatar3D shows that image; until it is ready it shows the 2D anime
// avatar, so something is always on screen. Images are cached by
// everything that changes them, so each look renders once per session.
//
// To feel alive, the image breathes (a UI-thread scale anchored at the
// bottom, paced by the life score, see alive.ts) and blinks: each look is
// also rendered once with the eyes shut, and that image is shown for the
// ~0.2 s of a blink. Both are View transforms/opacity, cheap on Android.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useAliveMotion } from './alive';
import { Asset } from 'expo-asset';
import AnimeAvatar from './AnimeAvatar';
import { bgStyle, hairColor, outfitColor, pantsColor, shoesColor, skinTone } from './palettes';
import type { AvatarConfig, Mood } from './types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const VIEWER = require('../../assets/avatar3d/viewer.html');
// The base model every avatar uses until more VRoid models are added.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MODELS: Record<string, number> = { 'base-f1': require('../../assets/avatar3d/models/base-f1.vrm') };
export const DEFAULT_MODEL = 'base-f1';

type Mode = 'head' | 'full-body';

/** Pixel size each mode is rendered at (the image is scaled to fit). */
export const RENDER_SIZE: Record<Mode, { w: number; h: number }> = {
  head: { w: 384, h: 384 },
  'full-body': { w: 300, h: 660 },
};

export interface RenderRequest {
  key: string;
  mode: Mode;
  command: Record<string, unknown>;
}

// ---------------------------------------------------------------- store

const images = new Map<string, string>();
const queue: RenderRequest[] = [];
const listeners = new Set<() => void>();
let pump: (() => void) | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function requestRender(req: RenderRequest) {
  if (images.has(req.key) || queue.some((q) => q.key === req.key)) return;
  queue.push(req);
  pump?.();
}

function commandFor(config: AvatarConfig, mood: Mood, mode: Mode, bare: boolean, eyesClosed = false) {
  const bg = bgStyle(config.bg);
  return {
    type: 'render',
    colors: {
      skin: skinTone(config.skin).base,
      hair: hairColor(config.hairColor),
      top: outfitColor(config.outfitColor).value,
      bottom: pantsColor(config.pantsColor).value,
      shoes: shoesColor(config.shoesColor).value,
      bgFrom: bg.from,
      bgTo: bg.to,
    },
    pose: config.pose,
    build: config.bodyBuild,
    height: config.height,
    mood,
    mode,
    bare,
    animated: false,
    snapshot: true,
    eyes: eyesClosed ? 'closed' : 'open',
  };
}

export function renderKey(config: AvatarConfig, mood: Mood, mode: Mode, bare: boolean): string {
  return JSON.stringify([
    DEFAULT_MODEL, config.skin, config.hairColor, config.outfitColor, config.pantsColor,
    config.shoesColor, config.bg, config.pose, config.bodyBuild, config.height, mood, mode, bare,
  ]);
}

// ---------------------------------------------------------------- host

async function assetUri(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  if (Platform.OS !== 'web') await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

/**
 * Mount once, near the app root. Hidden; it only renders avatars into
 * images for Avatar3D.
 */
export function Avatar3DHost() {
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('head');
  const ready = useRef(false);
  const busy = useRef<RenderRequest | null>(null);
  const send = useRef<(json: string) => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    Promise.all([assetUri(VIEWER), assetUri(MODELS[DEFAULT_MODEL])])
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

  const next = () => {
    if (!ready.current || busy.current || !modelUri) return;
    const req = queue.shift();
    if (!req) return;
    busy.current = req;
    setMode(req.mode);
    // Give the view a frame to take the mode's size before rendering.
    setTimeout(() => send.current(JSON.stringify({ ...req.command, model: modelUri })), 60);
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
      images.set(busy.current.key, msg.data);
      busy.current = null;
      emit();
      next();
    } else if (msg.type === 'error' && busy.current) {
      images.set(busy.current.key, '');
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
}

/** Breath scale of the whole image, anchored at its bottom edge. */
const BREATH_SCALE: Record<Mode, number> = { head: 0.022, 'full-body': 0.012 };

export function Avatar3D({ config, size = 120, mood = 'neutral', mode = 'head', bare = false, animated = true, score }: Avatar3DProps) {
  const key = renderKey(config, mood, mode, bare);
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
  useEffect(() => {
    requestRender({ key, mode, command: commandFor(config, mood, mode, bare) });
    // Queued after the open-eyes image, so the avatar shows up first.
    if (animated) requestRender({ key: blinkKey, mode, command: commandFor(config, mood, mode, bare, true) });
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
  if (!uri) {
    // Still rendering (or the renderer failed): the 2D anime avatar.
    return <AnimeAvatar config={config} size={size} mood={mood} mode={mode} bare={bare} animated={animated} />;
  }
  return (
    <View style={[mode === 'head' && !bare ? styles.round : null, { width, height }]} accessibilityLabel="Your avatar">
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
});

export default Avatar3D;
