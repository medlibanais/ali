// Face-layer avatar parts. ViewBox space: 200x200, face centered ~(100, 96).
// Original hand-drawn geometry — no third-party avatar assets.

import React from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { Mood } from './types';

export const FACE_SHAPES = [
  { id: 'oval', label: 'Oval' },
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' },
  { id: 'heart', label: 'Heart' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'oblong', label: 'Oblong' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'wide', label: 'Wide' },
];

const FACE_PATHS: Record<string, string> = {
  oval: 'M100,34 C130,34 148,62 148,96 C148,134 128,158 100,158 C72,158 52,134 52,96 C52,62 70,34 100,34 Z',
  round: 'M100,38 C134,38 152,66 152,98 C152,134 130,154 100,154 C70,154 48,134 48,98 C48,66 66,38 100,38 Z',
  square: 'M100,36 C132,36 150,60 150,92 C150,112 146,134 138,150 C128,158 72,158 62,150 C54,134 50,112 50,92 C50,60 68,36 100,36 Z',
  heart: 'M100,36 C132,36 150,62 150,94 C150,126 124,152 100,160 C76,152 50,126 50,94 C50,62 68,36 100,36 Z',
  diamond: 'M100,32 C118,32 144,62 146,94 C148,124 122,156 100,162 C78,156 52,124 54,94 C56,62 82,32 100,32 Z',
  oblong: 'M100,30 C126,30 142,60 142,98 C142,138 124,166 100,166 C76,166 58,138 58,98 C58,60 74,30 100,30 Z',
  triangle: 'M100,36 C126,36 142,60 146,88 C150,122 128,156 100,160 C72,156 50,122 54,88 C58,60 74,36 100,36 Z',
  wide: 'M100,40 C138,40 156,68 156,98 C156,132 132,152 100,152 C68,152 44,132 44,98 C44,68 62,40 100,40 Z',
};

export function FaceShape({ id, fill }: { id: string; fill: string }) {
  return <Path d={FACE_PATHS[id] ?? FACE_PATHS.oval} fill={fill} />;
}

export function Ears({ faceId, fill, shade }: { faceId: string; fill: string; shade: string }) {
  const wide = faceId === 'wide' || faceId === 'round';
  const x = wide ? 46 : 50;
  return (
    <G>
      <Ellipse cx={x} cy={102} rx={7} ry={11} fill={fill} />
      <Ellipse cx={200 - x} cy={102} rx={7} ry={11} fill={fill} />
      <Ellipse cx={x + 1} cy={103} rx={3} ry={6} fill={shade} />
      <Ellipse cx={199 - x} cy={103} rx={3} ry={6} fill={shade} />
    </G>
  );
}

export function Neck({ fill, shade }: { fill: string; shade: string }) {
  return (
    <G>
      <Path d="M84,146 L116,146 L118,176 L82,176 Z" fill={fill} />
      <Path d="M84,146 L116,146 L116,158 C108,166 92,166 84,158 Z" fill={shade} opacity={0.55} />
    </G>
  );
}

export const EYE_STYLES = [
  { id: 'almond', label: 'Almond' },
  { id: 'round', label: 'Round' },
  { id: 'upturned', label: 'Upturned' },
  { id: 'downturned', label: 'Soft' },
  { id: 'narrow', label: 'Narrow' },
  { id: 'wide', label: 'Wide set' },
  { id: 'close', label: 'Close set' },
  { id: 'deep', label: 'Deep set' },
  { id: 'monolid', label: 'Monolid' },
  { id: 'hooded', label: 'Hooded' },
];

function eyeOffset(style: string): number {
  if (style === 'wide') return 19;
  if (style === 'close') return 13;
  return 16;
}

export function Eyes({ style, mood }: { style: string; mood: Mood }) {
  const dx = eyeOffset(style);
  const sleepy = mood === 'tired';
  const joyful = mood === 'glowing' || mood === 'happy';

  if (joyful && (style === 'round' || style === 'almond' || style === 'wide')) {
    // happy arc eyes
    return (
      <G stroke="#2B2018" strokeWidth={3.4} fill="none" strokeLinecap="round">
        <Path d={`M${100 - dx - 7},91 Q${100 - dx},84 ${100 - dx + 7},91`} />
        <Path d={`M${100 + dx - 7},91 Q${100 + dx},84 ${100 + dx + 7},91`} />
      </G>
    );
  }

  const ry = style === 'narrow' ? 3.2 : style === 'round' ? 6 : 4.6;
  const rx = style === 'narrow' ? 6.4 : 6.2;
  const tilt =
    style === 'upturned' ? -3 : style === 'downturned' ? 3 : 0;

  return (
    <G>
      {(['left', 'right'] as const).map((side) => {
        const cx = side === 'left' ? 100 - dx : 100 + dx;
        return (
          <G key={side} rotation={tilt} origin={`${cx},90`}>
            {style === 'monolid' ? (
              <Path
                d={`M${cx - 7},91 Q${cx},85 ${cx + 7},91 Q${cx},94 ${cx - 7},91 Z`}
                fill="#FDFBF6"
                stroke="#2B2018"
                strokeWidth={1.4}
              />
            ) : (
              <Ellipse cx={cx} cy={90} rx={rx} ry={ry} fill="#FDFBF6" stroke="#2B2018" strokeWidth={1.2} />
            )}
            {style === 'hooded' || sleepy ? (
              <Path
                d={`M${cx - rx},${90 - ry + 1} Q${cx},${90 - ry - 3} ${cx + rx},${90 - ry + 1} L${cx + rx},${90 - ry - 5} L${cx - rx},${90 - ry - 5} Z`}
                fill="#00000022"
              />
            ) : null}
            <Circle cx={cx} cy={90.6} r={style === 'narrow' ? 2 : 2.6} fill="#241A12" />
            <Circle cx={cx + 1} cy={89.4} r={0.8} fill="#FFFFFF" />
            {sleepy ? (
              <Path
                d={`M${cx - rx},92.5 Q${cx},95 ${cx + rx},92.5`}
                stroke="#2B2018"
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
              />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

export const BROW_STYLES = [
  { id: 'natural', label: 'Natural' },
  { id: 'thick', label: 'Thick' },
  { id: 'thin', label: 'Thin' },
  { id: 'arched', label: 'Arched' },
  { id: 'straight', label: 'Straight' },
  { id: 'angled', label: 'Angled' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'bushy', label: 'Bushy' },
];

export function Brows({ style, color }: { style: string; color: string }) {
  const thickness = style === 'thick' || style === 'bushy' ? 4.4 : style === 'thin' ? 1.8 : 3;
  const leftBase = 'M76,79 ';
  const rightBase = 'M124,79 ';
  let leftPath: string;
  let rightPath: string;
  switch (style) {
    case 'arched':
      leftPath = `${leftBase}Q84,71 93,77`;
      rightPath = `${rightBase}Q116,71 107,77`;
      break;
    case 'straight':
      leftPath = `${leftBase}L93,78`;
      rightPath = `${rightBase}L107,78`;
      break;
    case 'angled':
      leftPath = `${leftBase}L85,73 L93,78`;
      rightPath = `${rightBase}L115,73 L107,78`;
      break;
    case 'rounded':
      leftPath = `${leftBase}Q84,75 93,79`;
      rightPath = `${rightBase}Q116,75 107,79`;
      break;
    default:
      leftPath = `${leftBase}Q84,74 93,78`;
      rightPath = `${rightBase}Q116,74 107,78`;
  }
  return (
    <G stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round">
      <Path d={leftPath} />
      <Path d={rightPath} />
      {style === 'bushy' ? (
        <G strokeWidth={1.4}>
          <Path d="M78,76 L82,80" />
          <Path d="M84,74 L88,79" />
          <Path d="M122,76 L118,80" />
          <Path d="M116,74 L112,79" />
        </G>
      ) : null}
    </G>
  );
}

export const NOSE_STYLES = [
  { id: 'straight', label: 'Straight' },
  { id: 'button', label: 'Button' },
  { id: 'wide', label: 'Wide' },
  { id: 'pointed', label: 'Pointed' },
  { id: 'roman', label: 'Strong' },
  { id: 'snub', label: 'Snub' },
];

export function Nose({ style, shade }: { style: string; shade: string }) {
  switch (style) {
    case 'button':
      return (
        <G>
          <Circle cx={100} cy={106} r={4.4} fill={shade} opacity={0.7} />
          <Circle cx={95.6} cy={109} r={1.2} fill="#00000030" />
          <Circle cx={104.4} cy={109} r={1.2} fill="#00000030" />
        </G>
      );
    case 'wide':
      return (
        <Path
          d="M94,98 L96,108 Q92,112 96,113 Q100,115 104,113 Q108,112 104,108 L106,98"
          fill="none"
          stroke={shade}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      );
    case 'pointed':
      return (
        <Path
          d="M98,96 L100,110 L104,112 L100,114 L96,112 Z"
          fill={shade}
          opacity={0.75}
        />
      );
    case 'roman':
      return (
        <Path
          d="M99,94 L102,104 L103,110 Q100,113 97,112"
          fill="none"
          stroke={shade}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      );
    case 'snub':
      return (
        <Path
          d="M97,102 L98,108 Q100,112 103,110"
          fill="none"
          stroke={shade}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      );
    default:
      return (
        <Path
          d="M98,96 L97,108 Q96,112 100,113 Q104,112 103,108 L102,96"
          fill="none"
          stroke={shade}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      );
  }
}

export const MOUTH_STYLES = [
  { id: 'soft-smile', label: 'Soft smile' },
  { id: 'big-smile', label: 'Big smile' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'smirk', label: 'Smirk' },
  { id: 'open', label: 'Open smile' },
  { id: 'small', label: 'Small' },
  { id: 'full', label: 'Full lips' },
  { id: 'calm', label: 'Calm' },
];

export function Mouth({ style, mood }: { style: string; mood: Mood }) {
  const lipColor = '#A6574B';
  const effective: string =
    mood === 'glowing'
      ? 'open'
      : mood === 'tired'
        ? 'neutral'
        : mood === 'happy' && style === 'neutral'
          ? 'soft-smile'
          : style;

  switch (effective) {
    case 'big-smile':
      return (
        <Path
          d="M86,124 Q100,138 114,124"
          fill="none"
          stroke={lipColor}
          strokeWidth={3.4}
          strokeLinecap="round"
        />
      );
    case 'open':
      return (
        <G>
          <Path d="M85,123 Q100,142 115,123 Q100,130 85,123 Z" fill="#7C3A34" />
          <Path d="M90,126 Q100,133 110,126 Q100,129.5 90,126 Z" fill="#FDFBF6" />
        </G>
      );
    case 'smirk':
      return (
        <Path
          d="M88,126 Q102,131 113,122"
          fill="none"
          stroke={lipColor}
          strokeWidth={3}
          strokeLinecap="round"
        />
      );
    case 'small':
      return (
        <Path
          d="M93,126 Q100,131 107,126"
          fill="none"
          stroke={lipColor}
          strokeWidth={3}
          strokeLinecap="round"
        />
      );
    case 'full':
      return (
        <G fill={lipColor}>
          <Path d="M88,124 Q100,120 112,124 Q100,127 88,124 Z" opacity={0.85} />
          <Path d="M88,124 Q100,134 112,124 Q100,128 88,124 Z" />
        </G>
      );
    case 'calm':
      return (
        <Path
          d="M90,125 L110,125"
          stroke={lipColor}
          strokeWidth={3}
          strokeLinecap="round"
        />
      );
    case 'neutral':
      return (
        <Path
          d="M90,126 L110,126"
          stroke={lipColor}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      );
    default:
      return (
        <Path
          d="M88,124 Q100,133 112,124"
          fill="none"
          stroke={lipColor}
          strokeWidth={3.2}
          strokeLinecap="round"
        />
      );
  }
}

export const FACIAL_HAIR_STYLES = [
  { id: 'none', label: 'None' },
  { id: 'stubble', label: 'Stubble' },
  { id: 'mustache', label: 'Mustache' },
  { id: 'goatee', label: 'Goatee' },
  { id: 'beard', label: 'Full beard' },
];

export function FacialHair({ style, color }: { style: string; color: string }) {
  switch (style) {
    case 'stubble':
      return (
        <Path
          d="M72,118 C76,142 88,152 100,152 C112,152 124,142 128,118 C124,132 112,140 100,140 C88,140 76,132 72,118 Z"
          fill={color}
          opacity={0.22}
        />
      );
    case 'mustache':
      return (
        <Path
          d="M88,118 Q100,113 112,118 Q112,122 106,122 Q100,124 94,122 Q88,122 88,118 Z"
          fill={color}
        />
      );
    case 'goatee':
      return (
        <G fill={color}>
          <Path d="M88,118 Q100,113 112,118 Q112,122 106,122 Q100,124 94,122 Q88,122 88,118 Z" />
          <Path d="M92,134 Q100,150 108,134 Q100,141 92,134 Z" />
        </G>
      );
    case 'beard':
      return (
        <Path
          d="M68,108 C70,138 82,156 100,156 C118,156 130,138 132,108 C130,126 122,132 122,132 C122,144 112,150 100,150 C88,150 78,144 78,132 C78,132 70,126 68,108 Z"
          fill={color}
          opacity={0.92}
        />
      );
    default:
      return null;
  }
}

export const GLASSES_STYLES = [
  { id: 'none', label: 'None' },
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' },
  { id: 'aviator', label: 'Aviator' },
  { id: 'reading', label: 'Reading' },
];

export function Glasses({ style }: { style: string }) {
  const frame = '#2A2A2E';
  if (style === 'round') {
    return (
      <G stroke={frame} strokeWidth={2.4} fill="#FFFFFF" fillOpacity={0.12}>
        <Circle cx={84} cy={90} r={10} />
        <Circle cx={116} cy={90} r={10} />
        <Path d="M94,90 L106,90" fill="none" />
        <Path d="M74,90 L66,86 M126,90 L134,86" fill="none" />
      </G>
    );
  }
  if (style === 'square') {
    return (
      <G stroke={frame} strokeWidth={2.4} fill="#FFFFFF" fillOpacity={0.12}>
        <Rect x={73} y={82} width={22} height={16} rx={3} />
        <Rect x={105} y={82} width={22} height={16} rx={3} />
        <Path d="M95,88 L105,88" fill="none" />
        <Path d="M73,86 L65,83 M127,86 L135,83" fill="none" />
      </G>
    );
  }
  if (style === 'aviator') {
    return (
      <G stroke={frame} strokeWidth={2.2} fill="#5B87A8" fillOpacity={0.35}>
        <Path d="M74,84 Q84,80 94,84 Q94,98 84,98 Q74,98 74,84 Z" />
        <Path d="M106,84 Q116,80 126,84 Q126,98 116,98 Q106,98 106,84 Z" />
        <Path d="M94,86 L106,86" fill="none" />
      </G>
    );
  }
  if (style === 'reading') {
    return (
      <G stroke={frame} strokeWidth={2} fill="#FFFFFF" fillOpacity={0.12}>
        <Rect x={76} y={90} width={18} height={12} rx={6} />
        <Rect x={106} y={90} width={18} height={12} rx={6} />
        <Path d="M94,95 L106,95" fill="none" />
      </G>
    );
  }
  return null;
}
