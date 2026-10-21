// Hair + headwear avatar parts. Same 200x200 space; long styles draw a
// back layer behind the face and a front layer on top.

import React from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

export const HAIR_STYLES = [
  { id: 'bald', label: 'Bald' },
  { id: 'buzz', label: 'Buzz cut' },
  { id: 'short-wave', label: 'Short waves' },
  { id: 'side-part', label: 'Side part' },
  { id: 'curly-short', label: 'Short curls' },
  { id: 'curly-afro', label: 'Afro' },
  { id: 'coils', label: 'Coils' },
  { id: 'waves-medium', label: 'Medium waves' },
  { id: 'long-straight', label: 'Long straight' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'bun', label: 'Top bun' },
  { id: 'braids', label: 'Braids' },
  { id: 'locs', label: 'Locs' },
  { id: 'messy', label: 'Messy' },
  { id: 'fringe', label: 'Fringe' },
  { id: 'slick-back', label: 'Slick back' },
  { id: 'hijab', label: 'Hijab' },
  { id: 'cap', label: 'Cap' },
  { id: 'beanie', label: 'Beanie' },
  { id: 'turban', label: 'Turban' },
];

/** Long styles that need a layer behind the face. */
export function HairBack({ style, color }: { style: string; color: string }) {
  switch (style) {
    case 'long-straight':
      return (
        <Path
          d="M52,88 C46,150 56,178 64,190 L78,190 C72,160 70,120 72,96 L128,96 C130,120 128,160 122,190 L136,190 C144,178 154,150 148,88 C144,46 124,30 100,30 C76,30 56,46 52,88 Z"
          fill={color}
        />
      );
    case 'ponytail':
      return (
        <G fill={color}>
          <Path d="M130,60 C152,66 158,96 154,128 C152,150 146,168 138,176 C146,146 144,108 136,84 Z" />
          <Ellipse cx={136} cy={66} rx={10} ry={8} />
        </G>
      );
    case 'braids':
    case 'locs':
      return (
        <G stroke={color} strokeWidth={7} strokeLinecap="round">
          <Path d="M60,80 C56,120 58,160 62,186" />
          <Path d="M72,88 C70,124 72,164 76,190" />
          <Path d="M140,80 C144,120 142,160 138,186" />
          <Path d="M128,88 C130,124 128,164 124,190" />
        </G>
      );
    default:
      return null;
  }
}

export function HairFront({
  style,
  color,
  skinShade,
}: {
  style: string;
  color: string;
  skinShade: string;
}) {
  switch (style) {
    case 'bald':
      return null;
    case 'buzz':
      return (
        <Path
          d="M56,86 C56,50 74,34 100,34 C126,34 144,50 144,86 C144,80 132,58 100,58 C68,58 56,80 56,86 Z"
          fill={color}
          opacity={0.9}
        />
      );
    case 'short-wave':
      return (
        <Path
          d="M54,88 C52,48 72,30 100,30 C128,30 148,48 146,88 C142,70 138,60 132,58 C134,68 130,74 126,70 C122,66 124,58 118,56 C112,54 108,60 100,58 C92,56 88,54 82,58 C76,62 76,70 70,72 C64,74 60,66 62,60 C56,62 54,74 54,88 Z"
          fill={color}
        />
      );
    case 'side-part':
      return (
        <Path
          d="M54,88 C52,48 72,30 100,30 C128,30 148,48 146,88 C143,72 140,62 134,60 C120,52 96,50 82,58 C74,62 74,74 66,76 C60,78 56,68 58,60 C54,66 54,78 54,88 Z"
          fill={color}
        />
      );
    case 'curly-short':
      return (
        <G fill={color}>
          <Circle cx={72} cy={56} r={14} />
          <Circle cx={92} cy={46} r={15} />
          <Circle cx={112} cy={48} r={14} />
          <Circle cx={128} cy={60} r={12} />
          <Circle cx={62} cy={72} r={11} />
          <Circle cx={138} cy={74} r={10} />
        </G>
      );
    case 'curly-afro':
      return (
        <G fill={color}>
          <Circle cx={100} cy={48} r={34} />
          <Circle cx={70} cy={58} r={22} />
          <Circle cx={130} cy={58} r={22} />
          <Circle cx={58} cy={80} r={14} />
          <Circle cx={142} cy={80} r={14} />
        </G>
      );
    case 'coils':
      return (
        <G stroke={color} strokeWidth={5.4} fill="none" strokeLinecap="round">
          <Path d="M64,72 q4,-10 12,-6 q8,4 2,12" />
          <Path d="M82,58 q6,-10 14,-5 q7,5 0,12" />
          <Path d="M104,56 q6,-10 14,-5 q7,5 0,12" />
          <Path d="M124,62 q6,-8 12,-4 q6,5 0,12" />
        </G>
      );
    case 'waves-medium':
      return (
        <Path
          d="M52,92 C48,50 70,28 100,28 C130,28 152,50 148,92 C146,74 142,66 138,66 C140,84 136,98 130,96 C126,94 130,80 126,68 C118,56 110,60 100,58 C90,56 82,54 74,64 C70,70 74,88 68,92 C62,96 58,80 60,68 C56,70 52,80 52,92 Z"
          fill={color}
        />
      );
    case 'long-straight':
      return (
        <Path
          d="M52,92 C50,48 72,28 100,28 C128,28 150,48 148,92 C144,66 138,56 130,54 C118,48 108,54 100,52 C92,50 80,48 70,56 C62,62 56,66 52,92 Z"
          fill={color}
        />
      );
    case 'ponytail':
      return (
        <Path
          d="M54,88 C52,48 72,30 100,30 C128,30 148,48 146,88 C142,68 136,58 128,56 C116,50 84,50 72,58 C64,64 58,70 54,88 Z"
          fill={color}
        />
      );
    case 'bun':
      return (
        <G fill={color}>
          <Path d="M54,88 C52,48 72,32 100,32 C128,32 148,48 146,88 C142,68 136,58 128,56 C116,50 84,50 72,58 C64,64 58,70 54,88 Z" />
          <Circle cx={100} cy={32} r={14} />
        </G>
      );
    case 'braids':
      return (
        <G stroke={color} strokeWidth={7} strokeLinecap="round">
          <Path d="M58,84 C56,54 74,34 100,34 C126,34 144,54 142,84" />
          <Path d="M76,60 C74,68 74,74 76,80" />
          <Path d="M124,60 C126,68 126,74 124,80" />
        </G>
      );
    case 'locs':
      return (
        <G stroke={color} strokeWidth={6.4} strokeLinecap="round">
          <Path d="M58,82 C58,52 76,34 100,34 C124,34 142,52 142,82" />
          <Path d="M66,66 C64,76 64,84 66,92" />
          <Path d="M134,66 C136,76 136,84 134,92" />
        </G>
      );
    case 'messy':
      return (
        <G fill={color}>
          <Path d="M54,88 C52,48 72,30 100,30 C128,30 148,48 146,88 C142,70 136,62 130,60 C126,68 118,58 110,60 C104,62 106,68 98,64 C90,60 86,56 78,62 C72,66 74,76 66,76 C60,76 58,68 60,62 C56,66 54,76 54,88 Z" />
          <Path d="M70,44 L62,32 L74,38 Z" />
          <Path d="M124,40 L134,30 L130,44 Z" />
        </G>
      );
    case 'fringe':
      return (
        <Path
          d="M54,88 C52,48 72,30 100,30 C128,30 148,48 146,88 C144,74 140,64 136,62 L64,62 C60,64 56,74 54,88 Z M64,62 C64,74 70,82 76,80 C82,78 80,68 84,64 C88,74 96,80 102,78 C108,76 106,66 112,64 C118,68 122,76 128,74 C134,72 134,64 136,62 Z"
          fill={color}
          fillRule="evenodd"
        />
      );
    case 'slick-back':
      return (
        <Path
          d="M54,88 C52,46 74,28 100,28 C126,28 148,46 146,88 C142,64 134,54 122,52 C108,50 92,50 78,54 C66,58 58,66 54,88 Z"
          fill={color}
        />
      );
    case 'hijab':
      return (
        <G>
          <Path
            d="M48,98 C44,44 70,24 100,24 C130,24 156,44 152,98 C152,140 142,168 132,182 L118,182 C128,160 132,140 132,118 C126,140 116,148 100,148 C84,148 74,140 68,118 C68,140 72,160 82,182 L68,182 C58,168 48,140 48,98 Z"
            fill={color}
          />
          <Path
            d="M68,96 C68,60 82,44 100,44 C118,44 132,60 132,96 C132,124 118,142 100,142 C82,142 68,124 68,96 Z"
            fill={skinShade}
          />
        </G>
      );
    case 'cap':
      return (
        <G>
          <Path
            d="M56,80 C56,46 76,32 100,32 C124,32 144,46 144,80 L136,80 C136,56 120,44 100,44 C80,44 64,56 64,80 Z"
            fill={color}
          />
          <Path d="M52,78 L148,78 L148,88 L52,88 Z" fill={color} />
          <Path d="M96,82 L148,82 C156,82 162,88 160,92 L96,92 Z" fill={color} opacity={0.85} />
        </G>
      );
    case 'beanie':
      return (
        <G>
          <Path
            d="M56,84 C56,44 76,28 100,28 C124,28 144,44 144,84 L56,84 Z"
            fill={color}
          />
          <Rect x={54} y={78} width={92} height={14} rx={7} fill={color} opacity={0.85} />
          <Circle cx={100} cy={26} r={7} fill={color} />
        </G>
      );
    case 'turban':
      return (
        <G fill={color}>
          <Ellipse cx={100} cy={58} rx={48} ry={34} />
          <Path d="M52,62 C52,34 74,22 100,22 C126,22 148,34 148,62 C136,48 118,42 100,42 C82,42 64,48 52,62 Z" opacity={0.8} />
          <Circle cx={100} cy={30} r={6} opacity={0.9} />
        </G>
      );
    default:
      return null;
  }
}

export const HEADWEAR_STYLES = [
  { id: 'none', label: 'None' },
  { id: 'kufi', label: 'Kufi' },
  { id: 'headband', label: 'Headband' },
  { id: 'crown', label: 'Crown' },
];

export function Headwear({ style, color }: { style: string; color: string }) {
  switch (style) {
    case 'kufi':
      return (
        <Path
          d="M66,60 C66,40 82,30 100,30 C118,30 134,40 134,60 L66,60 Z"
          fill="#F4EFE2"
          stroke="#D8CFAF"
          strokeWidth={2}
        />
      );
    case 'headband':
      return (
        <Path
          d="M58,68 C60,50 76,40 100,40 C124,40 140,50 142,68 L134,68 C132,56 120,48 100,48 C80,48 68,56 66,68 Z"
          fill={color}
        />
      );
    case 'crown':
      return (
        <G>
          <Path
            d="M72,44 L80,26 L92,40 L100,22 L108,40 L120,26 L128,44 Z"
            fill="#D8A945"
            stroke="#B9892E"
            strokeWidth={2}
          />
          <Circle cx={100} cy={34} r={3} fill="#8E3449" />
        </G>
      );
    default:
      return null;
  }
}
