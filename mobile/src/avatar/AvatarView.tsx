// AvatarView: renders an AvatarConfig at any size, with mood-aware
// expression and a gentle idle animation (breathing + blink).
// mode 'head' renders the classic 200x200 bust; 'full-body' renders the
// same head stack on top of the 200x420 full-body canvas.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
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
import { Body } from './parts-body';
import SoftAvatar from './SoftAvatar';
import ToonAvatar from './ToonAvatar';

export interface AvatarViewProps {
  config: AvatarConfig;
  size?: number;
  mood?: Mood;
  animated?: boolean;
  mode?: 'head' | 'full-body';
  /**
   * 'toon' (default) is the cartoon person with natural proportions,
   * 'soft' the rounded chibi character, 'classic' the detailed flat art.
   */
  look?: 'toon' | 'soft' | 'classic';
  /** Toon look only: no background and no round crop. */
  bare?: boolean;
}

const HEAD_BOX = 200;
// Full-body canvas: head stack y∈[0,200], body y∈[200,400], shoes end
// by y≈434, leaving >20 units of bottom padding.
const BODY_BOX_H = 460;

export function AvatarView({ look = 'toon', bare, ...props }: AvatarViewProps) {
  if (look === 'toon') return <ToonAvatar {...props} bare={bare} />;
  if (look === 'soft') return <SoftAvatar {...props} />;
  return <ClassicAvatarView {...props} />;
}

function ClassicAvatarView({
  config,
  size = 120,
  mood = 'neutral',
  animated = true,
  mode = 'head',
}: Omit<AvatarViewProps, 'look'>) {
  const skin = skinTone(config.skin);
  const hair = hairColor(config.hairColor);
  const outfit = outfitColor(config.outfitColor);
  const bg = bgStyle(config.bg);
  const fullBody = mode === 'full-body';

  const breath = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breathLoop.start();

    const blinkTimer = setInterval(() => {
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.08,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }, 3800);

    return () => {
      breathLoop.stop();
      clearInterval(blinkTimer);
    };
  }, [animated, breath, blink]);

  const height = size;
  const width = fullBody ? Math.round((size * HEAD_BOX) / BODY_BOX_H) : size;

  // Head mode: gentle vertical bob. Full-body: subtle whole-body scale.
  const breathTransform = fullBody
    ? [
        {
          scale: breath.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.012],
          }),
        },
      ]
    : [{ translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, 1.6] }) }];

  const viewBox = fullBody
    ? `0 0 ${HEAD_BOX} ${BODY_BOX_H}`
    : `0 0 ${HEAD_BOX} ${HEAD_BOX}`;

  const headStack = (
    <>
      {fullBody ? null : (
        <>
          <AvatarBackground from={bg.from} to={bg.to} />
          {mood === 'glowing' ? <AuraRing /> : null}
        </>
      )}
      <HairBack style={config.hair} color={hair} />
      <Neck fill={skin.base} shade={skin.shade} />
      <Outfit style={config.outfit} value={outfit.value} shade={outfit.shade} />
      {fullBody ? <Body config={config} /> : null}
      <Ears faceId={config.face} fill={skin.base} shade={skin.shade} />
      <FaceShape id={config.face} fill={skin.base} />
      <Nose style={config.nose} shade={skin.shade} />
      <Mouth style={config.mouth} mood={mood} />
      <FacialHair style={config.facialHair} color={hair} />
      <Brows style={config.brows} color={hair} />
    </>
  );

  const topLayers = (
    <>
      <HairFront style={config.hair} color={hair} skinShade={skin.base} />
      <Glasses style={config.glasses} />
      <Headwear style={config.headwear} color={hair} />
    </>
  );

  // Blink overlay only covers the head region (the eyes live at y~90 of
  // the 200-unit head stack in BOTH viewBox modes).
  const blinkOverlayHeight = fullBody
    ? Math.round((size * HEAD_BOX) / BODY_BOX_H)
    : size;

  return (
    <View
      style={[
        styles.wrap,
        fullBody ? styles.wrapBody : styles.wrapHead,
        { width, height },
      ]}
      accessibilityLabel="Your avatar"
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: breathTransform }]}
      >
        <Svg width={width} height={height} viewBox={viewBox}>
          {headStack}
        </Svg>
        <Animated.View
          style={[
            styles.blinkLayer,
            { height: blinkOverlayHeight, transform: [{ scaleY: blink }] },
          ]}
          collapsable={false}
        >
          <Svg
            width={width}
            height={blinkOverlayHeight}
            viewBox={`0 0 ${HEAD_BOX} ${HEAD_BOX}`}
          >
            <G y={0.5}>
              <Eyes style={config.eyes} mood={mood} />
            </G>
          </Svg>
        </Animated.View>
        <Svg
          width={width}
          height={height}
          viewBox={viewBox}
          style={StyleSheet.absoluteFill}
        >
          {topLayers}
        </Svg>
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
  blinkLayer: {
    ...StyleSheet.absoluteFillObject,
    bottom: undefined,
    overflow: 'hidden',
  },
});

export default AvatarView;
