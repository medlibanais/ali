// ToonAvatar: the default look of the avatar. A cartoon person with
// natural proportions (about five and a half heads tall), lidded eyes, a
// shaded nose and real lips, in the spirit of personal emoji avatars.
// Driven by the same AvatarConfig as the other looks; every field changes
// the drawing (see toonParts.tsx, which borrows the hair art from
// softParts.tsx).
//
// Canvas: 200 x 440, feet on the ground line at y=420. Head mode crops to
// the head and shoulders.

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
import { HairBack, HairFront, Headwear, headPath, INK, WHITE } from './softParts';
import {
  Blush,
  Body,
  BodyBack,
  Brows,
  CANVAS_EYE_Y,
  CANVAS_H,
  CANVAS_W,
  Ears,
  Eyes,
  FaceShading,
  FacialHair,
  figureShift,
  Glasses,
  hairSqueeze,
  headTransform,
  Mouth,
  Nose,
  toonFace,
  type ToonKit,
} from './toonParts';
import type { AvatarConfig, Mood } from './types';

export interface ToonAvatarProps {
  config: AvatarConfig;
  size?: number;
  mood?: Mood;
  animated?: boolean;
  mode?: 'head' | 'full-body';
  /** No background and no round crop: the avatar sits on whatever is behind it. */
  bare?: boolean;
}

// Head mode: a square around the head and the top of the shoulders.
const HEAD_VIEW = { x: 42, y: 28, size: 116 };
// Height of the blinking eye band, in canvas units.
const EYE_BAND = 18;

function colorKey(parts: string[]): string {
  let h = 0;
  for (const ch of parts.join('')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

export function ToonAvatar({
  config,
  size = 120,
  mood = 'neutral',
  animated = true,
  mode = 'head',
  bare = false,
}: ToonAvatarProps) {
  const skin = skinTone(config.skin);
  const hair = hairColor(config.hairColor);
  const top = outfitColor(config.outfitColor);
  const bottom = pantsColor(config.pantsColor);
  const shoes = shoesColor(config.shoesColor).value;
  const bg = bgStyle(config.bg);
  const face = toonFace(config.face);
  const fullBody = mode === 'full-body';
  const covered = config.hair === 'hijab';

  // Ids are unique per instance (web shares one document between every
  // <svg>) and change with their colors (native caches gradients by id).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const key = colorKey([skin.base, hair, top.value, bottom.value, shoes, bg.from, bg.to]);
  const id = (name: string) => `${name}${uid}${key}`;
  const url = (name: string) => `url(#${id(name)})`;
  const kit: ToonKit = { url, id, skin, hair, top, shoes, mood };

  const float = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(float, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.1, duration: 80, useNativeDriver: useNative }),
        Animated.timing(blink, { toValue: 1, duration: 130, useNativeDriver: useNative }),
      ]).start();
    }, 4300);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [animated, float, blink]);

  const view = fullBody
    ? { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }
    : { x: HEAD_VIEW.x, y: HEAD_VIEW.y, w: HEAD_VIEW.size, h: HEAD_VIEW.size };
  const height = size;
  const width = Math.round((size * view.w) / view.h);
  const scale = height / view.h;
  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

  const shift = fullBody ? figureShift(config.height) : 0;
  const figure = `translate(0 ${shift})`;
  const head = headTransform();
  const squeeze = hairSqueeze(face);

  const eyeCenter = CANVAS_EYE_Y + shift;
  const eyeTop = (eyeCenter - EYE_BAND / 2 - view.y) * scale;

  const lift = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, fullBody ? -2.5 * scale : -1.2 * scale],
  });

  const defs = (
    <Defs>
      <RadialGradient id={id('skin')} cx="38%" cy="30%" r="78%">
        <Stop offset="0" stopColor={mix(skin.base, WHITE, 0.18)} />
        <Stop offset="0.6" stopColor={skin.base} />
        <Stop offset="1" stopColor={skin.shade} />
      </RadialGradient>
      <RadialGradient id={id('hair')} cx="35%" cy="20%" r="85%">
        <Stop offset="0" stopColor={mix(hair, WHITE, 0.22)} />
        <Stop offset="0.6" stopColor={hair} />
        <Stop offset="1" stopColor={mix(hair, INK, 0.3)} />
      </RadialGradient>
      <LinearGradient id={id('top')} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={mix(top.value, WHITE, 0.16)} />
        <Stop offset="0.65" stopColor={top.value} />
        <Stop offset="1" stopColor={top.shade} />
      </LinearGradient>
      <LinearGradient id={id('bottom')} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={mix(bottom.value, WHITE, 0.12)} />
        <Stop offset="1" stopColor={bottom.shade} />
      </LinearGradient>
      <LinearGradient id={id('shoes')} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={mix(shoes, WHITE, 0.22)} />
        <Stop offset="1" stopColor={mix(shoes, INK, 0.2)} />
      </LinearGradient>
      <RadialGradient id={id('iris')} cx="50%" cy="35%" r="65%">
        <Stop offset="0" stopColor="#8A5A3C" />
        <Stop offset="1" stopColor="#2B1A12" />
      </RadialGradient>
      <LinearGradient id={id('bg')} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={bg.from} />
        <Stop offset="1" stopColor={bg.to} />
      </LinearGradient>
      <RadialGradient id={id('glow')} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FFE7A3" stopOpacity="0.85" />
        <Stop offset="1" stopColor="#FFE7A3" stopOpacity="0" />
      </RadialGradient>
    </Defs>
  );

  const eyes = (
    <G transform={figure}>
      <G transform={head}>
        <Eyes style={config.eyes} kit={kit} />
      </G>
    </G>
  );
  const glasses = (
    <G transform={figure}>
      <G transform={head}>
        <Glasses style={config.glasses} eyes={config.eyes} face={face} />
      </G>
    </G>
  );

  const figureArt = (
    <G transform={figure}>
      {mood === 'glowing' ? <Circle cx={100} cy={fullBody ? 200 : 96} r={fullBody ? 120 : 70} fill={url('glow')} /> : null}
      <BodyBack config={config} kit={kit} />
      <Body config={config} kit={kit} />
      <G transform={head}>
        {covered ? null : (
          <G transform={squeeze}>
            <HairBack style={config.hair} kit={kit} />
          </G>
        )}
        {covered ? null : <Ears face={face} kit={kit} />}
        {covered ? (
          <G transform={squeeze}>
            <HairBack style={config.hair} kit={kit} />
          </G>
        ) : null}
        {/* head outline, slightly smaller under a hijab so the band frames it */}
        <Path d={headPath(face, covered ? 4 : 0)} fill={url('skin')} />
        <FaceShading face={face} kit={kit} />
        <Blush face={face} kit={kit} />
        <Nose style={config.nose} kit={kit} />
        <FacialHair style={config.facialHair} face={face} kit={kit} />
        <Mouth style={config.mouth} kit={kit} />
        <Brows style={config.brows} eyes={config.eyes} kit={kit} />
        {animated ? null : <Eyes style={config.eyes} kit={kit} />}
        <G transform={squeeze}>
          <HairFront style={config.hair} kit={kit} />
          <Headwear style={config.headwear} kit={kit} />
        </G>
        {animated ? null : <Glasses style={config.glasses} eyes={config.eyes} face={face} />}
      </G>
    </G>
  );

  const backdrop = bare ? null : fullBody ? (
    <>
      <Circle cx={100} cy={150 + shift} r={86} fill={url('bg')} opacity={0.5} />
      <Ellipse cx={100} cy={420} rx={46} ry={6} fill={INK} opacity={0.12} />
    </>
  ) : (
    <Rect x={view.x} y={view.y} width={view.w} height={view.h} fill={url('bg')} />
  );

  if (!animated) {
    return (
      <View style={[fullBody || bare ? null : styles.round, { width, height }]} accessibilityLabel="Your avatar">
        <Svg width={width} height={height} viewBox={viewBox}>
          {defs}
          {backdrop}
          {figureArt}
        </Svg>
      </View>
    );
  }

  return (
    <View style={[fullBody || bare ? null : styles.round, { width, height }]} accessibilityLabel="Your avatar">
      <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        {defs}
        {backdrop}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
        <Svg width={width} height={height} viewBox={viewBox}>
          {defs}
          {figureArt}
        </Svg>
        {/* Eyes on their own layer, centered on the eye line, so scaleY blinks them in place. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.eyeLayer, { top: eyeTop, height: EYE_BAND * scale, transform: [{ scaleY: blink }] }]}
        >
          <Svg
            width={width}
            height={EYE_BAND * scale}
            viewBox={`${view.x} ${eyeCenter - EYE_BAND / 2} ${view.w} ${EYE_BAND}`}
          >
            {defs}
            {eyes}
          </Svg>
        </Animated.View>
        <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill} pointerEvents="none">
          {glasses}
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

export default ToonAvatar;
