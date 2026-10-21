// Outfit + background avatar parts. Same 200x200 space.

import React from 'react';
import {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

export const OUTFIT_STYLES = [
  { id: 'crewneck', label: 'Crewneck' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'collar', label: 'Collar shirt' },
  { id: 'thobe', label: 'Thobe' },
  { id: 'turtleneck', label: 'Turtleneck' },
  { id: 'jacket', label: 'Jacket' },
];

export function Outfit({
  style,
  value,
  shade,
}: {
  style: string;
  value: string;
  shade: string;
}) {
  const shoulders =
    'M40,200 C42,168 62,158 100,158 C138,158 158,168 160,200 Z';
  switch (style) {
    case 'hoodie':
      return (
        <G>
          <Path d={shoulders} fill={value} />
          <Path
            d="M78,162 C80,176 88,184 100,184 C112,184 120,176 122,162 C116,170 108,172 100,172 C92,172 84,170 78,162 Z"
            fill={shade}
          />
          <Path d="M92,178 L92,190 M108,178 L108,190" stroke={shade} strokeWidth={2.4} strokeLinecap="round" />
        </G>
      );
    case 'collar':
      return (
        <G>
          <Path d={shoulders} fill={value} />
          <Path d="M88,160 L100,172 L112,160 L106,158 L100,164 L94,158 Z" fill="#F4EFE2" />
          <Path d="M100,172 L100,200" stroke={shade} strokeWidth={2} />
          <Circle cx={100} cy={180} r={1.6} fill={shade} />
          <Circle cx={100} cy={190} r={1.6} fill={shade} />
        </G>
      );
    case 'thobe':
      return (
        <G>
          <Path d={shoulders} fill="#F4EFE2" />
          <Path d="M92,158 L92,200 M108,158 L108,200" stroke="#D8CFAF" strokeWidth={1.6} />
          <Path d="M96,158 L100,166 L104,158" fill="none" stroke="#D8CFAF" strokeWidth={2} />
        </G>
      );
    case 'turtleneck':
      return (
        <G>
          <Path d={shoulders} fill={value} />
          <Rect x={86} y={152} width={28} height={14} rx={6} fill={shade} />
        </G>
      );
    case 'jacket':
      return (
        <G>
          <Path d={shoulders} fill={value} />
          <Path d="M86,158 L100,176 L114,158 L120,160 L108,182 L108,200 L92,200 L92,182 L80,160 Z" fill={shade} />
          <Path d="M94,176 L94,182 L106,182 L106,176 L100,172 Z" fill="#F4EFE2" />
        </G>
      );
    default:
      return (
        <G>
          <Path d={shoulders} fill={value} />
          <Path
            d="M84,160 C86,168 92,172 100,172 C108,172 114,168 116,160"
            fill="none"
            stroke={shade}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </G>
      );
  }
}

export function AvatarBackground({ from, to }: { from: string; to: string }) {
  return (
    <G>
      <Defs>
        <SvgLinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={200} height={200} fill="url(#bgGrad)" />
      <Circle cx={160} cy={34} r={14} fill="#FFFFFF" opacity={0.25} />
      <Circle cx={30} cy={52} r={8} fill="#FFFFFF" opacity={0.18} />
    </G>
  );
}

/** Golden aura for the glowing mood (Daily Life Score >= 80). */
export function AuraRing() {
  return (
    <G>
      <Defs>
        <SvgLinearGradient id="auraGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F2D38A" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#D8A945" stopOpacity={0.6} />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={100} cy={100} r={94} fill="none" stroke="url(#auraGrad)" strokeWidth={4} />
      <Circle cx={100} cy={100} r={86} fill="#F2D38A" opacity={0.08} />
      <Circle cx={34} cy={60} r={3} fill="#F2D38A" />
      <Circle cx={168} cy={72} r={2.4} fill="#F2D38A" />
      <Circle cx={152} cy={164} r={2.8} fill="#F2D38A" />
      <Circle cx={46} cy={158} r={2.2} fill="#F2D38A" />
    </G>
  );
}
