// Custom minimal line icons drawn with react-native-svg.
// All icons are stroke-based, 1.5 stroke width, geometric, muted.
// No icon fonts, no emoji, no third-party icon sets.

import React from 'react';
import Svg, {
  Circle,
  Line,
  Path,
  Polyline,
  Rect,
} from 'react-native-svg';
import { colors, Pillar } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface IconProps {
  size?: number;
  color?: string;
}

const STROKE = 1.5;

function baseProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
  };
}

// Tab bar icons

export function TodayIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M4 11.2 12 4l8 7.2M6.2 9.4V19a1 1 0 0 0 1 1h9.6a1 1 0 0 0 1-1V9.4"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function QuestsIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Rect x={4} y={5.2} width={2.6} height={2.6} stroke={color} strokeWidth={STROKE} />
      <Rect x={4} y={10.7} width={2.6} height={2.6} stroke={color} strokeWidth={STROKE} />
      <Rect x={4} y={16.2} width={2.6} height={2.6} stroke={color} strokeWidth={STROKE} />
      <Line x1={9.5} y1={6.5} x2={20} y2={6.5} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={9.5} y1={12} x2={20} y2={12} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={9.5} y1={17.5} x2={20} y2={17.5} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function CoachIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M6 5h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9.5L5 20.5V7a2 2 0 0 1 1-2z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function InsightsIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M4 4v15a1 1 0 0 0 1 1h15"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Rect x={7.5} y={12.5} width={2.6} height={5} stroke={color} strokeWidth={STROKE} />
      <Rect x={11.7} y={8.5} width={2.6} height={9} stroke={color} strokeWidth={STROKE} />
      <Rect x={15.9} y={14.5} width={2.6} height={3} stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function ProfileIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Circle cx={12} cy={8.4} r={3.4} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M5.6 19.6a6.4 6.4 0 0 1 12.8 0"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Pillar glyphs

export function HealthGlyph({ size = 20, color = colors.pillar.health }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Polyline
        points="3,12 7.5,12 10,6 14,18 16.5,12 21,12"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function FamilyGlyph({ size = 20, color = colors.pillar.family }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Circle cx={9.2} cy={12} r={5.2} stroke={color} strokeWidth={STROKE} />
      <Circle cx={14.8} cy={12} r={5.2} stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function WorkGlyph({ size = 20, color = colors.pillar.work }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Rect x={4} y={8} width={16} height={11} rx={1.5} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M9.2 8V6.4A1.4 1.4 0 0 1 10.6 5h2.8a1.4 1.4 0 0 1 1.4 1.4V8M4 13.2h16"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FunGlyph({ size = 20, color = colors.pillar.fun }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M12 3.5 18.8 10 12 20.5 5.2 10z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M5.2 10h13.6M12 3.5v17"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SpiritualityGlyph({
  size = 20,
  color = colors.pillar.spirituality,
}: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M20 13.6A8.4 8.4 0 1 1 10.4 4a6.9 6.9 0 0 0 9.6 9.6z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PillarGlyph({ pillar, size = 20, color }: { pillar: Pillar; size?: number; color?: string }) {
  useTheme();
  const resolved = color ?? colors.pillar[pillar];
  switch (pillar) {
    case 'health':
      return <HealthGlyph size={size} color={resolved} />;
    case 'family':
      return <FamilyGlyph size={size} color={resolved} />;
    case 'work':
      return <WorkGlyph size={size} color={resolved} />;
    case 'fun':
      return <FunGlyph size={size} color={resolved} />;
    case 'spirituality':
      return <SpiritualityGlyph size={size} color={resolved} />;
  }
}

// Utility glyphs

export function CheckGlyph({ size = 14, color = colors.onAccent }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)} viewBox="0 0 16 16">
      <Polyline
        points="3,8.5 6.5,12 13,4.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function SendGlyph({ size = 20, color = colors.onAccent }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M4 12h15M13.5 5.5 20 12l-6.5 6.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MinusGlyph({ size = 16, color = colors.inkSoft }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Line x1={6} y1={12} x2={18} y2={12} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function PlusGlyph({ size = 16, color = colors.inkSoft }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Line x1={6} y1={12} x2={18} y2={12} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={12} y1={6} x2={12} y2={18} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronGlyph({ size = 16, color = colors.inkFaint }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Polyline
        points="9,5.5 15.5,12 9,18.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
