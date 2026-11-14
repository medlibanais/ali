// AvatarView: renders an AvatarConfig at any size, with mood-aware
// expression and an idle animation that makes it feel alive: the torso
// breathes (faster when the day's life score is low, slower and deeper
// when it is high) and the eyes blink. See alive.ts.
// mode 'head' renders the classic 200x200 bust; 'full-body' renders the
// same head stack on top of the 200x420 full-body canvas.

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { G } from 'react-native-svg';
import type { AvatarConfig, Mood } from './types';
import { bgStyle, hairColor, outfitColor, skinTone } from './palettes';
import {
  Brows,
  Ears,
  Eyes,
  FaceShape,
  FacialHair,
  Glasses,
  Mouth,
  Neck,
  Nose,
} from './parts-face';
import { HairBack, HairFront, Headwear } from './parts-hair';
import { AuraRing, AvatarBackground, Outfit } from './parts-outfit';
import { BODY_HIP_Y, BODY_SHOULDER_Y, BodyLower, BodyUpper } from './parts-body';
import { useAliveMotion } from './alive';
import SoftAvatar from './SoftAvatar';
import ToonAvatar from './ToonAvatar';
import AnimeAvatar from './AnimeAvatar';
import Avatar3D from './Avatar3D';
import { DEFAULT_ANIME_STYLE } from './animeStyles';

export interface AvatarViewProps {
  config: AvatarConfig;
  size?: number;
  mood?: Mood;
  animated?: boolean;
  mode?: 'head' | 'full-body';
  /**
   * '3d' (default) is the toon-shaded 3D anime model (Avatar3D.tsx),
   * 'anime' the 2D seinen anime drawing in the Ronin style, 'toon' the cartoon person with natural proportions, 'soft' the
   * rounded chibi character, 'classic' the detailed flat art.
   */
  look?: '3d' | 'anime' | 'toon' | 'soft' | 'classic';
  /** Anime and toon looks: no background and no round crop. */
  bare?: boolean;
  /**
   * The day's life score (0-100) that sets the breathing pace: low is
   * fast and shallow, high slow and calm. Pass a SharedValue
   * (useLifeScoreValue) where the score changes while the avatar is on
   * screen, so the pace follows it without re-rendering the avatar.
   */
  score?: number | SharedValue<number>;
}

const HEAD_BOX = 200;
// Full-body canvas: head stack y∈[0,200], body y∈[200,400], shoes end
// by y≈434, leaving >20 units of bottom padding.
const BODY_BOX_H = 460;
// Eye line in the 200-unit head stack: blinks close toward it.
const EYE_Y = 90;
// Head mode: the bust's shoulders start about here and the torso is
// anchored at the bottom edge.
const BUST_SHOULDER_Y = 160;

// How far one full breath moves things, as a fraction (scale) of the
// torso. Full-body: the chest rises ~2 units and widens ~1%.
const BREATH = {
  'full-body': { rise: 0.024, widen: 0.012 },
  head: { rise: 0.035, widen: 0.015 },
} as const;

/** translateY that makes a scaleY of `s` pivot on `anchorPx` of a box of height `boxPx`. */
function pivotY(anchorPx: number, boxPx: number, s: number): number {
  'worklet';
  return (anchorPx - boxPx / 2) * (1 - s);
}

function AvatarViewBase({ look = '3d', bare, ...props }: AvatarViewProps) {
  if (look === '3d') return <Avatar3D {...props} bare={bare} />;
  if (look === 'anime') {
    return <AnimeAvatar {...props} bare={bare} styleId={DEFAULT_ANIME_STYLE} />;
  }
  if (look === 'toon') return <ToonAvatar {...props} bare={bare} />;
  if (look === 'soft') return <SoftAvatar {...props} />;
  return <ClassicAvatarView {...props} />;
}

/**
 * Memoized so a parent re-render (a quest completed, a toast tick) does not
 * redraw the avatar. Pass a stable config object (useMemo) to benefit.
 */
export const AvatarView = memo(AvatarViewBase);

function ClassicAvatarView({
  config,
  size = 120,
  mood = 'neutral',
  animated = true,
  mode = 'head',
  score,
}: Omit<AvatarViewProps, 'look'>) {
  const fullBody = mode === 'full-body';
  const { breath, eyes } = useAliveMotion(score, animated);

  const height = size;
  const width = fullBody ? Math.round((size * HEAD_BOX) / BODY_BOX_H) : size;
  const canvasH = fullBody ? BODY_BOX_H : HEAD_BOX;
  const k = height / canvasH; // px per canvas unit
  const headPx = Math.round(HEAD_BOX * (width / HEAD_BOX)); // the 200x200 head box, in px
  const anchorY = fullBody ? BODY_HIP_Y : HEAD_BOX;
  const shoulderY = fullBody ? BODY_SHOULDER_Y : BUST_SHOULDER_Y;
  const amp = BREATH[fullBody ? 'full-body' : 'head'];

  // All motion is View transforms on whole SVG layers, run on the UI
  // thread: the SVG paths themselves never change after the first render.
  const torsoStyle = useAnimatedStyle(() => {
    const sy = 1 + amp.rise * breath.value;
    const sx = 1 + amp.widen * breath.value;
    return {
      transform: [{ translateY: pivotY(anchorY * k, height, sy) }, { scaleX: sx }, { scaleY: sy }],
    };
  });
  // The head rides on the shoulders: it rises as far as they do.
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -(anchorY - shoulderY) * k * amp.rise * breath.value }],
  }));
  const eyeStyle = useAnimatedStyle(() => {
    const sy = Math.max(0.08, eyes.value);
    const rise = -(anchorY - shoulderY) * k * amp.rise * breath.value;
    return {
      transform: [{ translateY: rise + pivotY(EYE_Y * (headPx / HEAD_BOX), headPx, sy) }, { scaleY: sy }],
    };
  });

  const viewBox = fullBody ? `0 0 ${HEAD_BOX} ${BODY_BOX_H}` : `0 0 ${HEAD_BOX} ${HEAD_BOX}`;

  // The SVG layers depend only on the look, not on the animation, so a
  // re-render (e.g. a new score number) reuses them untouched.
  const layers = useMemo(() => {
    const skin = skinTone(config.skin);
    const hair = hairColor(config.hairColor);
    const outfit = outfitColor(config.outfitColor);
    const bg = bgStyle(config.bg);
    const svg = (children: React.ReactNode) => (
      <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        {children}
      </Svg>
    );
    return {
      // Never moves: the bust background, or the legs and shoes.
      ground: svg(
        fullBody ? (
          <BodyLower config={config} />
        ) : (
          <>
            <AvatarBackground from={bg.from} to={bg.to} />
            {mood === 'glowing' ? <AuraRing /> : null}
          </>
        ),
      ),
      // Behind the torso: long hair and the neck.
      headBack: svg(
        <>
          <HairBack style={config.hair} color={hair} />
          <Neck fill={skin.base} shade={skin.shade} />
        </>,
      ),
      // Breathes: collar/outfit, and the full-body torso and arms.
      torso: svg(
        <>
          <Outfit style={config.outfit} value={outfit.value} shade={outfit.shade} />
          {fullBody ? <BodyUpper config={config} /> : null}
        </>,
      ),
      face: svg(
        <>
          <Ears faceId={config.face} fill={skin.base} shade={skin.shade} />
          <FaceShape id={config.face} fill={skin.base} />
          <Nose style={config.nose} shade={skin.shade} />
          <Mouth style={config.mouth} mood={mood} />
          <FacialHair style={config.facialHair} color={hair} />
          <Brows style={config.brows} color={hair} />
        </>,
      ),
      // The eyes only, on a head-box layer so scaleY blinks them in place.
      eyes: (
        <Svg width={headPx} height={headPx} viewBox={`0 0 ${HEAD_BOX} ${HEAD_BOX}`}>
          <G y={0.5}>
            <Eyes style={config.eyes} mood={mood} />
          </G>
        </Svg>
      ),
      top: svg(
        <>
          <HairFront style={config.hair} color={hair} skinShade={skin.base} />
          <Glasses style={config.glasses} />
          <Headwear style={config.headwear} color={hair} />
        </>,
      ),
    };
  }, [config, mood, fullBody, width, height, viewBox, headPx]);

  return (
    <View
      style={[styles.wrap, fullBody ? styles.wrapBody : styles.wrapHead, { width, height }]}
      accessibilityLabel="Your avatar"
    >
      {layers.ground}
      <Animated.View style={[StyleSheet.absoluteFill, headStyle]} pointerEvents="none">
        {layers.headBack}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, torsoStyle]} pointerEvents="none">
        {layers.torso}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, headStyle]} pointerEvents="none">
        {layers.face}
      </Animated.View>
      <Animated.View
        style={[styles.eyeLayer, { width: headPx, height: headPx }, eyeStyle]}
        pointerEvents="none"
        collapsable={false}
      >
        {layers.eyes}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, headStyle]} pointerEvents="none">
        {layers.top}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  wrapHead: {
    borderRadius: 999,
  },
  wrapBody: {
    // No bounding box: the figure blends into the screen behind it.
    borderRadius: 0,
    overflow: 'visible',
  },
  eyeLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export default AvatarView;
