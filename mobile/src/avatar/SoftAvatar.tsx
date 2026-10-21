// SoftAvatar: the friendly "soft 3D" look of the avatar. A chibi figure
// (big round head, small rounded body) shaded with radial gradients so it
// reads like a little animated-film character rather than flat clip art.
// Driven by the same AvatarConfig as the classic layered avatar; options
// that only make sense in the detailed art (nose and face shape) are
// folded into this simpler, rounder style.
//
// Canvas: 200 x 240. Head centered at (100, 92), body from y=150 down to
// y=230, ground shadow at y=232. Head mode crops to the bust.

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
import { bgStyle, hairColor, outfitColor, pantsColor, skinTone } from './palettes';
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
const HEAD = { cx: 100, cy: 92, rx: 56, ry: 54 };
const EYE_Y = 100;
// Head mode viewBox: the bust, square.
const HEAD_VIEW = { x: 14, y: 22, size: 172 };

const WHITE = '#FFFFFF';
const INK = '#2A1E18';
const BLUSH = '#FF8A80';

type HairGroup =
  | 'bald'
  | 'buzz'
  | 'short'
  | 'side'
  | 'fringe'
  | 'messy'
  | 'curly'
  | 'afro'
  | 'long'
  | 'ponytail'
  | 'bun'
  | 'hijab'
  | 'cap'
  | 'beanie'
  | 'turban';

function hairGroup(id: string): HairGroup {
  switch (id) {
    case 'bald':
      return 'bald';
    case 'buzz':
      return 'buzz';
    case 'side-part':
    case 'slick-back':
      return 'side';
    case 'fringe':
      return 'fringe';
    case 'messy':
      return 'messy';
    case 'curly-short':
    case 'coils':
      return 'curly';
    case 'curly-afro':
      return 'afro';
    case 'long-straight':
    case 'waves-medium':
    case 'braids':
    case 'locs':
      return 'long';
    case 'ponytail':
      return 'ponytail';
    case 'bun':
      return 'bun';
    case 'hijab':
      return 'hijab';
    case 'cap':
      return 'cap';
    case 'beanie':
      return 'beanie';
    case 'turban':
      return 'turban';
    default:
      return 'short';
  }
}

const BUILD_SCALE: Record<AvatarConfig['bodyBuild'], number> = {
  slim: 0.9,
  athletic: 1.02,
  average: 1,
  curvy: 1.04,
  broad: 1.1,
};

export function SoftAvatar({
  config,
  size = 120,
  mood = 'neutral',
  animated = true,
  mode = 'head',
}: SoftAvatarProps) {
  // Gradient ids must be unique per instance: on web every <svg> shares
  // one document, so two avatars with the same ids would swap colors.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${name}${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  const skin = skinTone(config.skin);
  const hair = hairColor(config.hairColor);
  const top = outfitColor(config.outfitColor);
  const bottom = pantsColor(config.pantsColor);
  const bg = bgStyle(config.bg);
  const group = hairGroup(config.hair);
  const fullBody = mode === 'full-body';
  const covered = group === 'hijab';

  const float = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
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

  // Eyes live on their own layer so they can blink: the layer is centered
  // on the eye line, so scaleY closes them in place.
  const eyeBand = 28;
  const eyeTop = (EYE_Y - eyeBand / 2 - view.y) * scale;

  const lift = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, fullBody ? -3 * scale : -1.5 * scale],
  });

  const skinLight = mix(skin.base, WHITE, 0.28);
  const hairLight = mix(hair, WHITE, 0.3);
  const topLight = mix(top.value, WHITE, 0.3);
  const bodyScale = BUILD_SCALE[config.bodyBuild] ?? 1;

  const defs = (
    <Defs>
      <RadialGradient id={id('skin')} cx="38%" cy="30%" r="75%">
        <Stop offset="0" stopColor={skinLight} />
        <Stop offset="0.55" stopColor={skin.base} />
        <Stop offset="1" stopColor={skin.shade} />
      </RadialGradient>
      <RadialGradient id={id('hair')} cx="35%" cy="20%" r="85%">
        <Stop offset="0" stopColor={hairLight} />
        <Stop offset="0.6" stopColor={hair} />
        <Stop offset="1" stopColor={mix(hair, INK, 0.35)} />
      </RadialGradient>
      <RadialGradient id={id('top')} cx="35%" cy="15%" r="95%">
        <Stop offset="0" stopColor={topLight} />
        <Stop offset="0.6" stopColor={top.value} />
        <Stop offset="1" stopColor={top.shade} />
      </RadialGradient>
      <LinearGradient id={id('bottom')} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={mix(bottom.value, WHITE, 0.15)} />
        <Stop offset="1" stopColor={bottom.shade} />
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
        <Stop offset="0" stopColor="#FFE7A3" stopOpacity="0.9" />
        <Stop offset="1" stopColor="#FFE7A3" stopOpacity="0" />
      </RadialGradient>
    </Defs>
  );

  const body = (
    <G transform={`translate(${100 * (1 - bodyScale)} 0) scale(${bodyScale} 1)`}>
      {/* legs: two soft capsules peeking under the top */}
      <Rect x={78} y={206} width={19} height={26} rx={9.5} fill={url('bottom')} />
      <Rect x={103} y={206} width={19} height={26} rx={9.5} fill={url('bottom')} />
      {/* shoes */}
      <Ellipse cx={86} cy={231} rx={13} ry={6.5} fill={mix(INK, WHITE, 0.15)} />
      <Ellipse cx={114} cy={231} rx={13} ry={6.5} fill={mix(INK, WHITE, 0.15)} />
      <Ellipse cx={83} cy={228.5} rx={5} ry={1.8} fill={WHITE} opacity={0.25} />
      <Ellipse cx={111} cy={228.5} rx={5} ry={1.8} fill={WHITE} opacity={0.25} />
      {/* torso: a rounded bell */}
      <Path
        d="M60,214 C56,182 68,154 100,154 C132,154 144,182 140,214 C139,222 132,224 124,224 L76,224 C68,224 61,222 60,214 Z"
        fill={url('top')}
      />
      {config.outfit === 'hoodie' ? (
        <>
          <Path d="M74,164 C82,178 118,178 126,164 C118,170 82,170 74,164 Z" fill={top.shade} opacity={0.55} />
          <Path d="M94,176 L92,192 M106,176 L108,192" stroke={mix(top.value, WHITE, 0.6)} strokeWidth={2.2} strokeLinecap="round" />
        </>
      ) : null}
      {config.outfit === 'collar' || config.outfit === 'jacket' ? (
        <Path d="M86,160 L100,176 L114,160 L108,158 L100,168 L92,158 Z" fill={config.outfit === 'jacket' ? mix(top.value, WHITE, 0.75) : WHITE} opacity={0.9} />
      ) : null}
      {config.outfit === 'turtleneck' ? (
        <Rect x={84} y={152} width={32} height={14} rx={7} fill={top.value} />
      ) : null}
      {/* arms */}
      {config.pose === 'arms-crossed' ? (
        <G>
          <Rect x={66} y={186} width={68} height={22} rx={11} fill={top.shade} />
          <Rect x={66} y={184} width={68} height={20} rx={10} fill={url('top')} />
          <Circle cx={72} cy={194} r={8} fill={url('skin')} />
          <Circle cx={128} cy={194} r={8} fill={url('skin')} />
        </G>
      ) : (
        <G>
          <Path
            d="M66,172 C56,182 52,198 54,210"
            stroke={url('top')}
            strokeWidth={17}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={55} cy={213} r={8.5} fill={url('skin')} />
          {config.pose === 'wave' ? (
            <>
              <Path
                d="M134,172 C146,166 152,152 150,136"
                stroke={url('top')}
                strokeWidth={17}
                strokeLinecap="round"
                fill="none"
              />
              <Circle cx={150} cy={130} r={9} fill={url('skin')} />
            </>
          ) : (
            <>
              <Path
                d="M134,172 C144,182 148,198 146,210"
                stroke={url('top')}
                strokeWidth={17}
                strokeLinecap="round"
                fill="none"
              />
              <Circle cx={145} cy={213} r={8.5} fill={url('skin')} />
            </>
          )}
        </G>
      )}
    </G>
  );

  const hairBack = (() => {
    switch (group) {
      case 'long':
        return (
          <Path
            d="M38,98 C34,44 66,24 100,24 C134,24 166,44 162,98 L166,166 C166,178 150,182 140,174 L138,120 L62,120 L60,174 C50,182 34,178 34,166 Z"
            fill={url('hair')}
          />
        );
      case 'ponytail':
        return (
          <Path
            d="M150,70 C176,82 180,128 168,160 C164,170 154,168 154,158 C160,128 156,100 144,86 Z"
            fill={url('hair')}
          />
        );
      case 'afro':
        return (
          <G fill={url('hair')}>
            <Circle cx={100} cy={78} r={72} />
            <Circle cx={40} cy={100} r={26} />
            <Circle cx={160} cy={100} r={26} />
          </G>
        );
      case 'hijab':
        return (
          <Path
            d="M100,26 C148,26 170,60 168,104 C166,136 156,156 150,170 C168,176 172,196 170,206 L30,206 C28,196 32,176 50,170 C44,156 34,136 32,104 C30,60 52,26 100,26 Z"
            fill={url('hair')}
          />
        );
      default:
        return null;
    }
  })();

  const hairFront = (() => {
    switch (group) {
      case 'bald':
        return <Ellipse cx={84} cy={52} rx={16} ry={7} fill={WHITE} opacity={0.22} />;
      case 'buzz':
        return (
          <Path
            d="M46,88 C46,52 70,36 100,36 C130,36 154,52 154,88 C140,68 122,60 100,60 C78,60 60,68 46,88 Z"
            fill={url('hair')}
            opacity={0.85}
          />
        );
      case 'side':
        return (
          <Path
            d="M44,98 C38,50 66,28 102,28 C138,28 162,50 156,98 C152,82 146,72 136,66 C118,60 94,68 74,58 C60,66 50,80 44,98 Z"
            fill={url('hair')}
          />
        );
      case 'fringe':
        return (
          <Path
            d="M44,102 C38,50 66,30 100,30 C134,30 162,50 156,102 C152,86 146,78 140,76 C120,82 80,82 60,76 C54,80 48,90 44,102 Z"
            fill={url('hair')}
          />
        );
      case 'messy':
        return (
          <G fill={url('hair')}>
            <Path d="M44,98 C38,52 64,30 100,30 C136,30 162,52 156,98 C150,80 140,68 128,64 C116,74 92,76 70,66 C58,74 50,84 44,98 Z" />
            <Path d="M70,40 L64,22 L84,34 Z M96,32 L98,14 L110,32 Z M120,36 L134,22 L132,42 Z" />
          </G>
        );
      case 'curly':
        return (
          <G fill={url('hair')}>
            <Path d="M46,92 C42,52 68,32 100,32 C132,32 158,52 154,92 C146,72 126,62 100,62 C74,62 54,72 46,92 Z" />
            {[150, 128, 106, 84, 62, 40].map((deg) => {
              const a = (-deg * Math.PI) / 180;
              return (
                <Circle
                  key={deg}
                  cx={100 + Math.cos(a) * 50}
                  cy={86 + Math.sin(a) * 48}
                  r={15}
                />
              );
            })}
          </G>
        );
      case 'afro':
        return (
          <Path
            d="M46,96 C44,60 70,44 100,44 C130,44 156,60 154,96 C142,76 124,68 100,68 C76,68 58,76 46,96 Z"
            fill={url('hair')}
          />
        );
      case 'long':
        return (
          <Path
            d="M44,104 C38,52 66,28 100,30 C134,28 162,52 156,104 C150,82 130,62 100,58 C70,62 50,82 44,104 Z"
            fill={url('hair')}
          />
        );
      case 'bun':
        return (
          <G fill={url('hair')}>
            <Circle cx={100} cy={30} r={20} />
            <Path d="M44,98 C38,52 66,32 100,32 C134,32 162,52 156,98 C148,78 128,64 100,62 C72,64 52,78 44,98 Z" />
          </G>
        );
      case 'cap':
        return (
          <G>
            <Path d="M44,98 C40,74 50,64 60,62 L140,62 C150,64 160,74 156,98 C150,84 130,76 100,76 C70,76 50,84 44,98 Z" fill={url('hair')} />
            <Path d="M46,74 C46,40 70,26 100,26 C130,26 154,40 154,74 Z" fill={url('top')} />
            <Path d="M40,76 Q100,58 160,76 Q100,94 40,76 Z" fill={top.shade} />
            <Circle cx={100} cy={28} r={4} fill={top.shade} />
          </G>
        );
      case 'beanie':
        return (
          <G>
            <Path d="M46,78 C46,42 70,28 100,28 C130,28 154,42 154,78 Z" fill={url('top')} />
            <Rect x={42} y={66} width={116} height={20} rx={10} fill={top.shade} />
            <Circle cx={100} cy={24} r={11} fill={mix(top.value, WHITE, 0.7)} />
          </G>
        );
      case 'turban':
        return (
          <G>
            <Path d="M42,86 C38,44 66,22 100,22 C134,22 162,44 158,86 C140,70 120,64 100,64 C80,64 60,70 42,86 Z" fill={url('top')} />
            <Path d="M52,70 C70,40 120,34 150,64 M60,52 C84,34 122,34 142,50" stroke={top.shade} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.6} />
          </G>
        );
      case 'hijab':
        // Soft band framing the face, drawn over the forehead edge.
        return (
          <Path
            d="M48,100 C46,58 72,40 100,40 C128,40 154,58 152,100 C148,74 128,58 100,58 C72,58 52,74 48,100 Z"
            fill={url('hair')}
          />
        );
      default:
        return (
          <Path
            d="M44,98 C38,52 66,30 100,30 C134,30 162,52 156,98 C150,78 140,66 128,62 C116,72 92,74 70,66 C58,72 50,82 44,98 Z"
            fill={url('hair')}
          />
        );
    }
  })();

  const headwear = (() => {
    switch (config.headwear) {
      case 'kufi':
        return <Path d="M62,52 C66,30 134,30 138,52 Z" fill={WHITE} opacity={0.95} />;
      case 'headband':
        return <Path d="M46,72 C70,56 130,56 154,72 L152,82 C128,68 72,68 48,82 Z" fill={top.value} />;
      case 'crown':
        return (
          <Path d="M72,40 L76,18 L88,32 L100,12 L112,32 L124,18 L128,40 Z" fill="#F2C14E" stroke="#C9952B" strokeWidth={1.5} strokeLinejoin="round" />
        );
      default:
        return null;
    }
  })();

  const facialHair = (() => {
    const color = mix(hair, skin.base, 0.15);
    switch (config.facialHair) {
      case 'stubble':
        return <Path d="M58,118 C64,142 82,148 100,148 C118,148 136,142 142,118 C134,134 118,140 100,140 C82,140 66,134 58,118 Z" fill={hair} opacity={0.12} />;
      case 'mustache':
        return <Path d="M86,124 C92,119 98,121 100,123 C102,121 108,119 114,124 C108,127 104,126 100,125 C96,126 92,127 86,124 Z" fill={color} />;
      case 'goatee':
        return <Path d="M90,136 C92,146 108,146 110,136 C106,140 94,140 90,136 Z" fill={color} />;
      case 'beard':
        return <Path d="M50,104 C52,140 76,152 100,152 C124,152 148,140 150,104 C144,124 130,134 116,134 C110,128 90,128 84,134 C70,134 56,124 50,104 Z" fill={color} />;
      default:
        return null;
    }
  })();

  const mouth = (() => {
    switch (mood) {
      case 'tired':
        return <Path d="M92,130 Q100,128 108,130" stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />;
      case 'neutral':
        return <Path d="M90,127 Q100,134 110,127" stroke={INK} strokeWidth={2.8} strokeLinecap="round" fill="none" />;
      case 'happy':
        return (
          <G>
            <Path d="M86,124 Q100,140 114,124 Q100,130 86,124 Z" fill={INK} />
            <Path d="M93,130 Q100,134 107,130 Q100,136 93,130 Z" fill="#FF8C8C" />
          </G>
        );
      default:
        return (
          <G>
            <Path d="M84,122 Q100,146 116,122 Q100,128 84,122 Z" fill={INK} />
            <Path d="M88,124 Q100,127 112,124 L111,126 Q100,129 89,126 Z" fill={WHITE} />
            <Path d="M92,132 Q100,138 108,132 Q100,140 92,132 Z" fill="#FF8C8C" />
          </G>
        );
    }
  })();

  // Brows: soft rounded strokes; a touch higher when the day goes well.
  const browLift = mood === 'glowing' ? -2 : mood === 'tired' ? 2 : 0;
  const browWidth = config.brows === 'thick' || config.brows === 'bushy' ? 4.6 : config.brows === 'thin' ? 2.4 : 3.4;

  const eyes = (
    <G>
      {[78, 122].map((x) => (
        <G key={x}>
          <Ellipse cx={x} cy={EYE_Y} rx={10.5} ry={12} fill={WHITE} />
          <Circle cx={x} cy={EYE_Y + 1.5} r={8.4} fill={url('iris')} />
          <Circle cx={x} cy={EYE_Y + 2} r={4.2} fill="#140C08" />
          <Circle cx={x - 3} cy={EYE_Y - 2.4} r={3} fill={WHITE} />
          <Circle cx={x + 3} cy={EYE_Y + 4} r={1.3} fill={WHITE} opacity={0.85} />
          <Path
            d={`M${x - 11},${EYE_Y - 3} Q${x},${EYE_Y - 15.5} ${x + 11},${EYE_Y - 3}`}
            stroke={INK}
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
          />
          {mood === 'tired' ? (
            <Path
              d={`M${x - 11},${EYE_Y - 12} L${x + 11},${EYE_Y - 12} L${x + 11},${EYE_Y - 1} Q${x},${EYE_Y + 2} ${x - 11},${EYE_Y - 1} Z`}
              fill={skin.base}
            />
          ) : null}
        </G>
      ))}
    </G>
  );

  const glasses =
    config.glasses === 'none' ? null : (
      <G stroke={config.glasses === 'aviator' ? '#B08A3E' : INK} strokeWidth={2.6} fill={WHITE} fillOpacity={0.12}>
        {config.glasses === 'square' ? (
          <>
            <Rect x={63} y={88} width={30} height={24} rx={7} />
            <Rect x={107} y={88} width={30} height={24} rx={7} />
          </>
        ) : (
          <>
            <Circle cx={78} cy={EYE_Y} r={15} />
            <Circle cx={122} cy={EYE_Y} r={15} />
          </>
        )}
        <Path d="M93,99 Q100,95 107,99" fill="none" />
      </G>
    );

  const head = (
    <G>
      {covered ? null : (
        <>
          <Ellipse cx={45} cy={100} rx={10} ry={13} fill={url('skin')} />
          <Ellipse cx={155} cy={100} rx={10} ry={13} fill={url('skin')} />
          <Ellipse cx={46} cy={101} rx={4.5} ry={6.5} fill={skin.shade} opacity={0.5} />
          <Ellipse cx={154} cy={101} rx={4.5} ry={6.5} fill={skin.shade} opacity={0.5} />
        </>
      )}
      <Ellipse
        cx={HEAD.cx}
        cy={HEAD.cy}
        rx={covered ? 50 : HEAD.rx}
        ry={covered ? 52 : HEAD.ry}
        fill={url('skin')}
      />
      <Ellipse cx={100} cy={52} rx={30} ry={10} fill={WHITE} opacity={0.18} />
      {/* cheeks and nose: blush + a soft highlight */}
      <Ellipse cx={66} cy={120} rx={10} ry={6.5} fill={BLUSH} opacity={mood === 'tired' ? 0.12 : 0.28} />
      <Ellipse cx={134} cy={120} rx={10} ry={6.5} fill={BLUSH} opacity={mood === 'tired' ? 0.12 : 0.28} />
      <Ellipse cx={100} cy={114} rx={5} ry={3.8} fill={skin.shade} opacity={0.55} />
      <Ellipse cx={99} cy={112.5} rx={2} ry={1.2} fill={WHITE} opacity={0.5} />
      {facialHair}
      {mouth}
      {/* brows */}
      <Path
        d={`M68,${84 + browLift} Q78,${78 + browLift} 88,${83 + browLift}`}
        stroke={mix(hair, INK, 0.2)}
        strokeWidth={browWidth}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M112,${83 + browLift} Q122,${78 + browLift} 132,${84 + browLift}`}
        stroke={mix(hair, INK, 0.2)}
        strokeWidth={browWidth}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );

  return (
    <View style={[fullBody ? null : styles.round, { width, height }]} accessibilityLabel="Your avatar">
      {fullBody ? null : (
        <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
          {defs}
          <Rect x={view.x} y={view.y} width={view.w} height={view.h} fill={url('bg')} />
        </Svg>
      )}
      {fullBody ? (
        <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
          <Ellipse cx={100} cy={234} rx={50} ry={6} fill={INK} opacity={0.12} />
        </Svg>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
        <Svg width={width} height={height} viewBox={viewBox}>
          {defs}
          {mood === 'glowing' ? <Circle cx={100} cy={110} r={98} fill={url('glow')} /> : null}
          {covered ? null : hairBack}
          <Rect x={87} y={136} width={26} height={22} rx={11} fill={skin.shade} />
          {body}
          {/* a hijab drapes over the shoulders, so it sits above the body */}
          {covered ? hairBack : null}
          {head}
          {hairFront}
          {headwear}
        </Svg>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.eyeLayer,
            { top: eyeTop, height: eyeBand * scale, transform: [{ scaleY: blink }] },
          ]}
        >
          <Svg width={width} height={eyeBand * scale} viewBox={`${view.x} ${EYE_Y - eyeBand / 2} ${view.w} ${eyeBand}`}>
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

export default SoftAvatar;
