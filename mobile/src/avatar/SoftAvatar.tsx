// SoftAvatar: the friendly "soft 3D" look of the avatar. A chibi figure
// (big round head, small rounded body) shaded with radial gradients so it
// reads like a little animated-film character rather than flat clip art.
// Driven by the same AvatarConfig as the classic layered avatar; every
// field changes the drawing (see softParts.tsx).
//
// Canvas: 200 x 240. Head centered at (100, 92), feet at y=232. Head mode
// crops to the bust on a background disc.

import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { mix } from '../theme/tokens';
import { useNative } from '../components/Motion';
import {
  bgStyle,
  hairColor,
  outfitColor,
  pantsColor,
  shoesColor,
  skinTone,
} from './palettes';
import {
  Blush,
  Body,
  Brows,
  EYE_Y,
  Eyes,
  FacialHair,
  faceShape,
  Glasses,
  HairBack,
  HairFront,
  Headwear,
  headPath,
  INK,
  LEG_LENGTH,
  Mouth,
  Nose,
  type PartKit,
  WHITE,
} from './softParts';
import type { AvatarConfig, Mood } from './types';

export interface SoftAvatarProps {
  config: AvatarConfig;
  size?: number;
  mood?: Mood;
  animated?: boolean;
  mode?: 'head' | 'full-body';
}

const W = 200;
const H = 240;
// Head mode viewBox: the bust, square.
const HEAD_VIEW = { x: 14, y: 22, size: 172 };
const EYE_BAND = 40;

/** Short, stable hash so gradient ids change whenever their colors do. */
function colorKey(parts: string[]): string {
  let h = 0;
  for (const ch of parts.join('')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

export function SoftAvatar({
  config,
  size = 120,
  mood = 'neutral',
  animated = true,
  mode = 'head',
}: SoftAvatarProps) {
  const skin = skinTone(config.skin);
  const hair = hairColor(config.hairColor);
  const top = outfitColor(config.outfitColor);
  const bottom = pantsColor(config.pantsColor);
  const shoes = shoesColor(config.shoesColor).value;
  const bg = bgStyle(config.bg);
  const face = faceShape(config.face);
  const fullBody = mode === 'full-body';
  const covered = config.hair === 'hijab';

  // Gradient ids must be unique per instance (on web every <svg> shares one
  // document) and must change when their colors change: native
  // react-native-svg caches a gradient by id, so reusing an id after a
  // color pick would keep painting the old color.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const key = colorKey([skin.base, hair, top.value, bottom.value, shoes, bg.from, bg.to]);
  const id = (name: string) => `${name}${uid}${key}`;
  const url = (name: string) => `url(#${id(name)})`;

  const kit: PartKit = { url, skin, hair, top, shoes, mood };

  const float = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.1, duration: 80, useNativeDriver: useNative }),
        Animated.timing(blink, { toValue: 1, duration: 130, useNativeDriver: useNative }),
      ]).start();
    }, 4200);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [animated, float, blink]);

  const view = fullBody
    ? { x: 0, y: 0, w: W, h: H }
    : { x: HEAD_VIEW.x, y: HEAD_VIEW.y, w: HEAD_VIEW.size, h: HEAD_VIEW.size };
  const height = size;
  const width = Math.round((size * view.w) / view.h);
  const scale = height / view.h;
  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

  // Taller figures stand on the same ground line, so the head moves up.
  // Head mode keeps the head in place.
  const rise = fullBody ? (LEG_LENGTH[config.height] ?? LEG_LENGTH.medium) - LEG_LENGTH.medium : 0;
  const figure = `translate(0 ${-rise})`;

  // Eyes live on their own layer so they can blink: the layer is centered
  // on the eye line, so scaleY closes them in place.
  const eyeCenter = EYE_Y - rise;
  const eyeTop = (eyeCenter - EYE_BAND / 2 - view.y) * scale;

  const lift = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, fullBody ? -3 * scale : -1.5 * scale],
  });

  const defs = (
    <Defs>
      <RadialGradient id={id('skin')} cx="38%" cy="30%" r="75%">
        <Stop offset="0" stopColor={mix(skin.base, WHITE, 0.28)} />
        <Stop offset="0.55" stopColor={skin.base} />
        <Stop offset="1" stopColor={skin.shade} />
      </RadialGradient>
      <RadialGradient id={id('hair')} cx="35%" cy="20%" r="85%">
        <Stop offset="0" stopColor={mix(hair, WHITE, 0.3)} />
        <Stop offset="0.6" stopColor={hair} />
        <Stop offset="1" stopColor={mix(hair, INK, 0.35)} />
      </RadialGradient>
      <RadialGradient id={id('top')} cx="35%" cy="15%" r="95%">
        <Stop offset="0" stopColor={mix(top.value, WHITE, 0.3)} />
        <Stop offset="0.6" stopColor={top.value} />
        <Stop offset="1" stopColor={top.shade} />
      </RadialGradient>
      <LinearGradient id={id('bottom')} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={mix(bottom.value, WHITE, 0.15)} />
        <Stop offset="1" stopColor={bottom.shade} />
      </LinearGradient>
      <RadialGradient id={id('shoes')} cx="40%" cy="30%" r="80%">
        <Stop offset="0" stopColor={mix(shoes, WHITE, 0.3)} />
        <Stop offset="1" stopColor={mix(shoes, INK, 0.25)} />
      </RadialGradient>
      <RadialGradient id={id('iris')} cx="50%" cy="35%" r="65%">
        <Stop offset="0" stopColor="#8A5A3C" />
        <Stop offset="1" stopColor="#2B1A12" />
      </RadialGradient>
      <LinearGradient id={id('bg')} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={bg.from} />
        <Stop offset="1" stopColor={bg.to} />
      </LinearGradient>
      <RadialGradient id={id('glow')} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FFE7A3" stopOpacity="0.9" />
        <Stop offset="1" stopColor="#FFE7A3" stopOpacity="0" />
      </RadialGradient>
    </Defs>
  );

  return (
    <View
      style={[fullBody ? null : styles.round, { width, height }]}
      accessibilityLabel="Your avatar"
    >
      <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        {defs}
        {fullBody ? (
          <>
            <Circle cx={100} cy={124} r={92} fill={url('bg')} opacity={0.55} />
            <Ellipse cx={100} cy={234} rx={50} ry={6} fill={INK} opacity={0.12} />
          </>
        ) : (
          <Rect x={view.x} y={view.y} width={view.w} height={view.h} fill={url('bg')} />
        )}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
        <Svg width={width} height={height} viewBox={viewBox}>
          {defs}
          <G transform={figure}>
            {mood === 'glowing' ? <Circle cx={100} cy={110} r={98} fill={url('glow')} /> : null}
            {covered ? null : <HairBack style={config.hair} kit={kit} />}
            <Rect x={87} y={136} width={26} height={22} rx={11} fill={skin.shade} />
            <Body config={config} kit={kit} />
            {/* a hijab drapes over the shoulders, so it sits above the body */}
            {covered ? <HairBack style={config.hair} kit={kit} /> : null}
            {covered ? null : (
              <>
                <Ellipse cx={100 - face.rx - 1} cy={100} rx={10} ry={13} fill={url('skin')} />
                <Ellipse cx={100 + face.rx + 1} cy={100} rx={10} ry={13} fill={url('skin')} />
                <Ellipse cx={100 - face.rx} cy={101} rx={4.5} ry={6.5} fill={skin.shade} opacity={0.5} />
                <Ellipse cx={100 + face.rx} cy={101} rx={4.5} ry={6.5} fill={skin.shade} opacity={0.5} />
              </>
            )}
            <Path d={headPath(face, covered ? 5 : 0)} fill={url('skin')} />
            <Ellipse cx={100} cy={52} rx={30} ry={10} fill={WHITE} opacity={0.16} />
            <Blush face={face} kit={kit} />
            <Nose style={config.nose} kit={kit} />
            <FacialHair style={config.facialHair} face={face} kit={kit} />
            <Mouth style={config.mouth} kit={kit} />
            <Brows style={config.brows} eyes={config.eyes} kit={kit} />
            <HairFront style={config.hair} kit={kit} />
            <Headwear style={config.headwear} kit={kit} />
          </G>
        </Svg>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.eyeLayer,
            { top: eyeTop, height: EYE_BAND * scale, transform: [{ scaleY: blink }] },
          ]}
        >
          <Svg
            width={width}
            height={EYE_BAND * scale}
            viewBox={`${view.x} ${eyeCenter - EYE_BAND / 2} ${view.w} ${EYE_BAND}`}
          >
            {defs}
            <G transform={figure}>
              <Eyes style={config.eyes} kit={kit} />
            </G>
          </Svg>
        </Animated.View>
        <Svg
          width={width}
          height={height}
          viewBox={viewBox}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <G transform={figure}>
            <Glasses style={config.glasses} eyes={config.eyes} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  eyeLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});

export default SoftAvatar;
