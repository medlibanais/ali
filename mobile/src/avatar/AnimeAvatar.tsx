// AnimeAvatar: the avatar drawn as a moody seinen anime character. Sharp
// ink outlines, hard cel shadows, intense eyes and spiky hair, in one of
// four styles (animeStyles.ts). Driven by the same AvatarConfig as the
// other looks, so every option in the editor still changes the drawing:
// the body, outfits and hair silhouettes come from the toon and soft
// parts, recolored through the style's grade and outlined in ink.
//
// Canvas: 200 x 440 like the toon avatar. Head mode crops to the head.

import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
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
import { bgStyle, hairColor, outfitColor, pantsColor, shoesColor, skinTone } from './palettes';
import { HairBack, HairFront, Headwear, HEAD_CX, HEAD_CY } from './softParts';
import {
  Body,
  BodyBack,
  CANVAS_H,
  CANVAS_W,
  figureShift,
  Glasses,
  toonFace,
  type ToonKit,
} from './toonParts';
import {
  AnimeBrows,
  AnimeEars,
  AnimeEyes,
  AnimeFacialHair,
  AnimeMouth,
  AnimeNose,
  animeHeadPath,
  CrownSpikes,
  FaceShadow,
  Fringe,
  FringeLines,
  hairSqueezeFor,
  HairShine,
  RuggedLines,
  type AnimeKit,
} from './animeParts';
import { animeStyle, grade, shade, type AnimeStyleId } from './animeStyles';
import type { AvatarConfig, Mood } from './types';

export interface AnimeAvatarProps {
  config: AvatarConfig;
  size?: number;
  mood?: Mood;
  animated?: boolean;
  mode?: 'head' | 'full-body';
  bare?: boolean;
  styleId?: AnimeStyleId;
}

// A slimmer, taller figure than the toon: smaller head on the same body.
const HEAD_Y = 74;
const HEAD_SCALE = 0.6;
const HEAD_VIEW = { x: 44, y: 26, size: 112 };

/** Eight directions for the ink outline copies. */
const RING: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7],
];

function colorKey(parts: string[]): string {
  let h = 0;
  for (const ch of parts.join('')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Draws `render` once per ring offset in solid ink, then once in color on
 * top: an outline around the silhouette only, never across inner seams.
 */
function Inked({
  width,
  ink,
  render,
}: {
  width: number;
  ink: ToonKit;
  render: (kit: ToonKit | null) => React.ReactNode;
}) {
  return (
    <G>
      {RING.map(([dx, dy], i) => (
        <G key={i} transform={`translate(${(dx * width).toFixed(2)} ${(dy * width).toFixed(2)})`}>
          {render(ink)}
        </G>
      ))}
      {render(null)}
    </G>
  );
}

// Neck in canvas units: starts behind the jaw, narrows a little, then
// flares into the shoulders under the collar.
const NECK = 'M86.5,84 C86.5,96 88.5,108 85,124 Q82,131 76,134 L124,134 Q118,131 115,124 C111.5,108 113.5,96 113.5,84 Z';

/**
 * A real anime neck (after merill's reference): ink sides, the jaw's hard
 * shadow cast down onto it, the far side in shade, and the two neck
 * muscles meeting at the collarbone.
 */
function AnimeNeck({
  face,
  head,
  skin,
  kit,
}: {
  face: ReturnType<typeof toonFace>;
  head: string;
  skin: { base: string; shade: string };
  kit: AnimeKit;
}) {
  const clip = kit.id('neckClip');
  const line = kit.style.line * 0.5;
  return (
    <G>
      <Defs>
        <ClipPath id={clip}>
          <Path d={NECK} />
        </ClipPath>
      </Defs>
      <Path d={NECK} fill={skin.base} />
      <G clipPath={`url(#${clip})`}>
        {/* far side in shade */}
        <Path d="M106,84 C105,100 107,114 104,136 L130,136 L130,84 Z" fill={skin.shade} />
        {/* the jaw's shadow, dropped onto the neck */}
        <G transform={`translate(2 15) ${head}`}>
          <Path d={animeHeadPath(face)} fill={mix(skin.shade, kit.ink, 0.22)} />
        </G>
        {kit.style.rim ? (
          <Path d="M112.6,96 C112,108 113,116 115.5,124" stroke={kit.style.rim} strokeWidth={1.1} fill="none" opacity={0.8} />
        ) : null}
      </G>
      {/* neck muscles, adam's apple and the dip between the collarbones */}
      <Path
        d="M90,104 Q93,116 98.5,127 M110.5,104 Q107.5,116 101.5,127 M99,113 Q100.5,114.5 101.5,113 M97,129 Q100,131 103,129"
        stroke={kit.ink}
        strokeWidth={line * 0.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.55}
      />
      {/* ink along both sides */}
      <Path
        d="M86.5,90 C86.5,98 88.5,108 85,124 Q82,131 76,134 M113.5,90 C113.5,98 111.5,108 115,124 Q118,131 124,134"
        stroke={kit.ink}
        strokeWidth={line * 1.6}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
}

export function AnimeAvatar({
  config,
  size = 120,
  mood = 'neutral',
  animated = true,
  mode = 'head',
  bare = false,
  styleId,
}: AnimeAvatarProps) {
  const style = animeStyle(styleId);
  const ink = style.ink;
  const g = (hex: string) => grade(style, hex);

  const rawSkin = skinTone(config.skin);
  const skinBase = g(rawSkin.base);
  const skin = { base: skinBase, shade: shade(style, mix(skinBase, rawSkin.shade, 0.5)) };
  const hair = g(hairColor(config.hairColor));
  const hairDark = shade(style, hair);
  const topRaw = outfitColor(config.outfitColor);
  const top = { value: g(topRaw.value), shade: shade(style, g(topRaw.value)) };
  const bottomRaw = pantsColor(config.pantsColor);
  const bottom = { value: g(bottomRaw.value), shade: shade(style, g(bottomRaw.value)) };
  const shoes = g(shoesColor(config.shoesColor).value);
  const bg = bgStyle(config.bg);
  const bgCenter = mix(g(bg.to), style.bgGlow, 0.6);
  const bgEdge = mix(g(bg.from), style.bgDark, 0.82);
  const face = toonFace(config.face);
  const fullBody = mode === 'full-body';
  const covered = config.hair === 'hijab';

  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const key = colorKey([style.id, skin.base, hair, top.value, bottom.value, shoes, bgCenter, bgEdge]);
  const id = (name: string) => `${name}${uid}${key}`;
  const url = (name: string) => `url(#${id(name)})`;

  const kit: ToonKit = { url, id, skin, hair, top, shoes, mood };
  const inkKit: ToonKit = {
    url: () => ink,
    id,
    skin: { base: ink, shade: ink },
    hair: ink,
    top: { value: ink, shade: ink },
    shoes: ink,
    mood,
  };
  const akit: AnimeKit = { style, ink, skin, hair, hairShade: hairDark, mood, id };

  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animated) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(float, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, float]);

  const view = fullBody
    ? { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }
    : { x: HEAD_VIEW.x, y: HEAD_VIEW.y, w: HEAD_VIEW.size, h: HEAD_VIEW.size };
  const height = size;
  const width = Math.round((size * view.w) / view.h);
  const scale = height / view.h;
  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

  const shift = fullBody ? figureShift(config.height) : 0;
  const head = `translate(100 ${HEAD_Y}) scale(${HEAD_SCALE}) translate(-${HEAD_CX} -${HEAD_CY})`;
  const squeeze = hairSqueezeFor(face);
  // Outline width in canvas units, and the same width inside the head.
  const lw = style.line * 0.5;
  const lwHead = lw / HEAD_SCALE;

  const cel = (name: string, base: string, dark: string, angle: 'side' | 'diag' = 'side') => (
    <LinearGradient id={id(name)} x1="0.15" y1="0" x2={angle === 'side' ? '1' : '0.9'} y2={angle === 'side' ? '0.25' : '1'}>
      <Stop offset="0" stopColor={base} />
      <Stop offset="0.58" stopColor={base} />
      <Stop offset="0.58" stopColor={dark} />
      <Stop offset="1" stopColor={dark} />
    </LinearGradient>
  );

  const defs = (
    <Defs>
      {cel('skin', skin.base, skin.shade)}
      {cel('hair', hair, hairDark, 'diag')}
      {cel('top', top.value, top.shade)}
      {cel('bottom', bottom.value, bottom.shade)}
      {cel('shoes', shoes, shade(style, shoes))}
      <RadialGradient id={id('iris')} cx="50%" cy="35%" r="65%">
        <Stop offset="0" stopColor={style.iris ?? '#6A4A34'} />
        <Stop offset="1" stopColor={ink} />
      </RadialGradient>
      <RadialGradient id={id('bg')} cx="55%" cy="42%" r="75%">
        <Stop offset="0" stopColor={bgCenter} />
        <Stop offset="0.55" stopColor={mix(bgCenter, bgEdge, 0.55)} />
        <Stop offset="1" stopColor={bgEdge} />
      </RadialGradient>
      <RadialGradient id={id('aura')} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={style.iris ?? style.bgGlow} stopOpacity="0.55" />
        <Stop offset="1" stopColor={style.iris ?? style.bgGlow} stopOpacity="0" />
      </RadialGradient>
    </Defs>
  );

  const hairBackLayer = (k: ToonKit | null) => {
    const kk = k ?? kit;
    const fill = k ? ink : url('hair');
    return (
      <G transform={squeeze}>
        <CrownSpikes hair={config.hair} fill={fill} />
        <HairBack style={config.hair} kit={kk} />
      </G>
    );
  };
  const hairFrontLayer = (k: ToonKit | null) => {
    const kk = k ?? kit;
    const fill = k ? ink : url('hair');
    return (
      <G transform={squeeze}>
        <HairFront style={config.hair} kit={kk} />
        <Fringe hair={config.hair} fill={fill} />
      </G>
    );
  };
  const headLayer = (k: ToonKit | null) => (
    <G>
      {covered ? null : <AnimeEars face={face} kit={k ? { ...akit, skin: { base: ink, shade: ink } } : akit} />}
      <Path d={animeHeadPath(face)} fill={k ? ink : skin.base} />
    </G>
  );
  const bodyLayer = (k: ToonKit | null) => (
    <G>
      <BodyBack config={config} kit={k ?? kit} />
      <Body config={config} kit={k ?? kit} neck={false} />
    </G>
  );

  const figureArt = (
    <G transform={`translate(0 ${shift})`}>
      {mood === 'glowing' ? <Circle cx={100} cy={fullBody ? 160 : 80} r={fullBody ? 110 : 64} fill={url('aura')} /> : null}
      {covered ? null : (
        <G transform={head}>
          <Inked width={lwHead} ink={inkKit} render={hairBackLayer} />
        </G>
      )}
      <AnimeNeck face={face} head={head} skin={skin} kit={akit} />
      <Inked width={lw} ink={inkKit} render={bodyLayer} />
      <G transform={head}>
        {covered ? <Inked width={lwHead} ink={inkKit} render={hairBackLayer} /> : null}
        <Inked width={lwHead} ink={inkKit} render={headLayer} />
        <FaceShadow face={face} hair={config.hair} kit={akit} />
        <RuggedLines face={face} kit={akit} />
        <AnimeNose style={config.nose} kit={akit} />
        <AnimeFacialHair style={config.facialHair} face={face} kit={akit} />
        <AnimeMouth style={config.mouth} kit={akit} />
        <AnimeEyes style={config.eyes} kit={akit} />
        <AnimeBrows style={config.brows} eyes={config.eyes} kit={akit} />
        <Inked width={lwHead} ink={inkKit} render={hairFrontLayer} />
        <G transform={squeeze}>
          <HairShine hair={config.hair} kit={akit} />
          <FringeLines hair={config.hair} kit={akit} />
          <Headwear style={config.headwear} kit={kit} />
        </G>
        <Glasses style={config.glasses} eyes={config.eyes} face={face} />
      </G>
    </G>
  );

  const rain = style.rain ? (
    <Path
      d={Array.from({ length: 34 }, (_, i) => {
        const x = view.x + ((i * 37) % 100) / 100 * view.w;
        const y = view.y + ((i * 61) % 100) / 100 * view.h;
        const len = view.h * 0.08;
        return `M${x.toFixed(1)},${y.toFixed(1)} l${(-len * 0.12).toFixed(1)},${len.toFixed(1)}`;
      }).join(' ')}
      stroke="#DDE6EE"
      strokeWidth={view.w / 260}
      strokeLinecap="round"
      opacity={0.55}
    />
  ) : null;

  const backdrop = bare ? null : fullBody ? (
    <>
      <Circle cx={100} cy={150 + shift} r={88} fill={url('bg')} />
      <Ellipse cx={100} cy={420} rx={46} ry={6} fill={ink} opacity={0.25} />
    </>
  ) : (
    <Rect x={view.x} y={view.y} width={view.w} height={view.h} fill={url('bg')} />
  );

  const wrapStyle = [fullBody || bare ? null : styles.round, { width, height }];

  if (!animated) {
    return (
      <View style={wrapStyle} accessibilityLabel="Your avatar">
        <Svg width={width} height={height} viewBox={viewBox}>
          {defs}
          {backdrop}
          {figureArt}
          {bare ? null : rain}
        </Svg>
      </View>
    );
  }

  const lift = float.interpolate({ inputRange: [0, 1], outputRange: [0, fullBody ? -2.5 * scale : -1.2 * scale] });
  return (
    <View style={wrapStyle} accessibilityLabel="Your avatar">
      <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        {defs}
        {backdrop}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
        <Svg width={width} height={height} viewBox={viewBox}>
          {defs}
          {figureArt}
        </Svg>
      </Animated.View>
      {bare || !rain ? null : (
        <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill} pointerEvents="none">
          {rain}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    borderRadius: 999,
    overflow: 'hidden',
  },
});

export default AnimeAvatar;
