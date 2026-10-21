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
      <Path
        d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FamilyGlyph({ size = 20, color = colors.pillar.family }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M4.5 11 12 4.8l7.5 6.2M6.5 9.5v9.2h11V9.5M10 18.7v-4.6h4v4.6"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
      <Circle cx={12} cy={12} r={8.2} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M8.6 13.6c.8 1.4 2 2.1 3.4 2.1s2.6-.7 3.4-2.1"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Circle cx={9.3} cy={10} r={0.9} fill={color} />
      <Circle cx={14.7} cy={10} r={0.9} fill={color} />
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

export function BellGlyph({ size = 22, color = colors.inkSoft }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5ZM10 20.5a2 2 0 0 0 4 0"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Filled star used on XP pills and the level badge. */
export function StarGlyph({ size = 14, color = colors.gold }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="m12 3.2 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7L12 3.2Z"
        fill={color}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Profile glyphs (lucide-style outlines, Figma "Profile" frame)

function Outline({ size, color, d }: { size: number; color: string; d: string }) {
  return (
    <Svg {...baseProps(size)}>
      <Path d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function UserGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M19 21v-1.5A4.5 4.5 0 0 0 14.5 15h-5A4.5 4.5 0 0 0 5 19.5V21M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />;
}

export function SettingsGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Path
        d="M12.2 2.5h-.4a1.8 1.8 0 0 0-1.8 1.8v.2a1.8 1.8 0 0 1-.9 1.5l-.4.2a1.8 1.8 0 0 1-1.8 0l-.1-.1a1.8 1.8 0 0 0-2.5.7l-.2.3a1.8 1.8 0 0 0 .7 2.5l.1.1a1.8 1.8 0 0 1 .9 1.5v.5a1.8 1.8 0 0 1-.9 1.6l-.1.1a1.8 1.8 0 0 0-.7 2.4l.2.4a1.8 1.8 0 0 0 2.5.6l.1-.1a1.8 1.8 0 0 1 1.8 0l.4.3a1.8 1.8 0 0 1 .9 1.5v.2a1.8 1.8 0 0 0 1.8 1.8h.4a1.8 1.8 0 0 0 1.8-1.8v-.2a1.8 1.8 0 0 1 .9-1.5l.4-.3a1.8 1.8 0 0 1 1.8 0l.1.1a1.8 1.8 0 0 0 2.5-.6l.2-.4a1.8 1.8 0 0 0-.7-2.4l-.1-.1a1.8 1.8 0 0 1-.9-1.6v-.5a1.8 1.8 0 0 1 .9-1.5l.1-.1a1.8 1.8 0 0 0 .7-2.5l-.2-.3a1.8 1.8 0 0 0-2.5-.7l-.1.1a1.8 1.8 0 0 1-1.8 0l-.4-.2a1.8 1.8 0 0 1-.9-1.5v-.2a1.8 1.8 0 0 0-1.8-1.8Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function ShieldCheckGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M12 21.5s7.5-3.4 7.5-9.4V5.6L12 2.8 4.5 5.6v6.5c0 6 7.5 9.4 7.5 9.4ZM9 12l2 2 4-4" />;
}

export function HelpGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.3-2.4 2.3M12 16.6h.01" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SparklesGlyph({ size = 16, color = colors.accent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M10 3.5 11.6 8a2 2 0 0 0 1.3 1.3l4.6 1.6-4.6 1.6a2 2 0 0 0-1.3 1.3L10 18.4l-1.6-4.6A2 2 0 0 0 7.1 12.5L2.5 10.9l4.6-1.6A2 2 0 0 0 8.4 8L10 3.5ZM18.5 3v4M20.5 5h-4M19 16.5v3M20.5 18h-3" />;
}

export function PencilGlyph({ size = 16, color = colors.accent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5ZM14.5 5.5l3 3" />;
}

export function FlameGlyph({ size = 22, color = colors.accent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.6 1.5 1.8 2.8 2.5 2.8Z" />;
}

/** Square with a pen: "new chat" in the Coach header (Figma Coach frame). */
export function ComposeGlyph({ size = 22, color = colors.accent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7l-7.6 7.6-3.5.8.8-3.5 7.6-7.6Z" />;
}

/** Upward arrow on the chat send button. */
export function ArrowUpGlyph({ size = 20, color = colors.onAccent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M12 19.5v-15M5.5 11 12 4.5l6.5 6.5" />;
}

// Avatar editor and profile sharing

export function CloseGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M6 6l12 12M18 6 6 18" />;
}

export function UndoGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />;
}

export function RedoGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />;
}

export function DiceGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      <Rect x={3.5} y={3.5} width={17} height={17} rx={4} stroke={color} strokeWidth={1.8} />
      {[[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]].map(([x, y]) => (
        <Circle key={`${x}${y}`} cx={x} cy={y} r={1.3} fill={color} />
      ))}
    </Svg>
  );
}

export function BodyToggleGlyph({ size = 20, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10.5l6 1 6-1M12 11.5V16M12 16l-3 5.5M12 16l3 5.5" />;
}

export function FaceGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M12 3c4.4 0 7 3.4 7 8 0 5-3.2 10-7 10s-7-5-7-10c0-4.6 2.6-8 7-8ZM9.5 11h.01M14.5 11h.01M9.5 15.5c1.4 1.2 3.6 1.2 5 0" />;
}

export function HairGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M5.2 14C4 7.5 7.4 3 12 3s8 4.5 6.8 11M5.2 14c2.4-1.2 3.8-3.6 4.3-6.4 2.2 2.6 5.6 4 9.3 6.4M7 14c.2 4.2 2.4 7 5 7s4.8-2.8 5-7" />;
}

export function EyeGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />;
}

export function LipsGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M2.5 12c2.6-3.2 5.2-4.6 7.3-3.6l2.2 1 2.2-1c2.1-1 4.7.4 7.3 3.6-2.6 3.6-5.7 5.2-9.5 5.2S5.1 15.6 2.5 12ZM2.5 12h19" />;
}

export function BeardGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M5 5v5c0 6 3 10 7 10s7-4 7-10V5M8.5 13.5c1.2-1.2 2.4-1.2 3.5-.3 1.1-.9 2.3-.9 3.5.3M10 16.5h4" />;
}

export function GlassesGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M2 10h2M20 10h2M4 11a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0ZM13 11a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0ZM11 10.5c.7-.6 1.3-.6 2 0" />;
}

export function ShirtGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M8 3.5 3 6.5 5 11l2-1v10.5h10V10l2 1 2-4.5-5-3c-.5 1.5-2 2.5-4 2.5s-3.5-1-4-2.5Z" />;
}

export function PantsGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M6 3h12l1 18h-5l-2-11-2 11H5L6 3ZM6 6.5h12" />;
}

export function ShoeGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M3 17V8.5l4 .5c1 2 3 3.2 5.5 3.6L19 14c1.6.5 2.5 1.6 2.5 3v1H3v-1ZM3 15.5h18.5M10 11.5 11.5 10M13 12.5 14.5 11" />;
}

export function PersonGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 10.5l7 1 7-1M12 11.5V16M12 16l-3 5.5M12 16l3 5.5" />;
}

export function BackdropGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 16l5-5 4 4 2.5-2.5L20 17M15.5 8.5h.01" />;
}

export function LockGlyph({ size = 14, color = colors.inkSoft }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M6.5 11h11v9h-11v-9ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />;
}

export function ShareGlyph({ size = 20, color = colors.accent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M12 3.5v11M8 7.5l4-4 4 4M5.5 12v7.5h13V12" />;
}

export function LinkGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />;
}

/** Chat bubble with a handset: stands for WhatsApp. */
export function ChatPhoneGlyph({ size = 22, color = colors.onAccent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M4 20l1.3-3.9A8.5 8.5 0 1 1 8 18.8L4 20ZM9.2 8.4c.3-.4.8-.4 1 0l.7 1.4c.1.3 0 .6-.2.8l-.5.5c.5 1 1.3 1.8 2.3 2.3l.5-.5c.2-.2.5-.3.8-.2l1.4.7c.4.2.4.7 0 1-.8.8-2 1-3 .4a8 8 0 0 1-3.4-3.4c-.6-1-.4-2.2.4-3Z" />;
}

/** Rounded camera: stands for Instagram. */
export function CameraGlyph({ size = 22, color = colors.onAccent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 7h.01" />;
}

/** Ring with a plus: a story. */
export function StoryGlyph({ size = 22, color = colors.onAccent }: IconProps) {
  useTheme();
  return <Outline size={size} color={color} d="M12 3.5a8.5 8.5 0 1 1-6 2.5M3.9 9.2a8.5 8.5 0 0 1 1.2-2.4M12 8.5v7M8.5 12h7" />;
}

export function MoreGlyph({ size = 22, color = colors.ink }: IconProps) {
  useTheme();
  return (
    <Svg {...baseProps(size)}>
      {[6, 12, 18].map((x) => (
        <Circle key={x} cx={x} cy={12} r={1.6} fill={color} />
      ))}
    </Svg>
  );
}
