import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import type { Rarity } from '../api/types';
import { colors } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface BadgeMedallionProps {
  badgeId: string;
  rarity: Rarity;
  unlocked: boolean;
  size?: number;
}

const STROKE = 1.5;

function BadgeGlyph({ badgeId, color }: { badgeId: string; color: string }) {
  switch (badgeId) {
    case 'first_step':
      return (
        <Path
          d="M7 18h3.5v-4H14v-4h3.5"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'week_warrior':
      return (
        <>
          {[6.4, 8.9, 11.4, 13.9, 16.4].map((x) => (
            <Line key={x} x1={x} y1={8} x2={x} y2={16} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
          ))}
          <Line x1={18.9} y1={8} x2={18.9} y2={13} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
        </>
      );
    case 'perfect_day':
      return (
        <>
          <Circle cx={12} cy={12} r={3.4} stroke={color} strokeWidth={STROKE} fill="none" />
          <Line x1={12} y1={5} x2={12} y2={7} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
          <Line x1={12} y1={17} x2={12} y2={19} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
          <Line x1={5} y1={12} x2={7} y2={12} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
          <Line x1={17} y1={12} x2={19} y2={12} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
        </>
      );
    case 'prayer_master':
      return (
        <Path
          d="M16.6 14.4A5.6 5.6 0 1 1 9.6 7.4a4.6 4.6 0 0 0 7 7z"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'fitness_fanatic':
      return (
        <Polyline
          points="5,12 8.5,12 10.4,8 13.6,16 15.5,12 19,12"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'family_first':
      return (
        <>
          <Circle cx={9.6} cy={12} r={3.6} stroke={color} strokeWidth={STROKE} fill="none" />
          <Circle cx={14.4} cy={12} r={3.6} stroke={color} strokeWidth={STROKE} fill="none" />
        </>
      );
    case 'knowledge_seeker':
      return (
        <Path
          d="M5.5 7.5c2-1.2 4.2-1.2 6.5 0 2.3-1.2 4.5-1.2 6.5 0v9.5c-2-1.2-4.2-1.2-6.5 0-2.3-1.2-4.5-1.2-6.5 0zM12 7.5V17"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'iron_mind':
      return (
        <Path
          d="M12 5.5 18.5 12 12 18.5 5.5 12z"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'legend':
      return (
        <Path
          d="M12 4.8l2.2 4.5 4.9.7-3.6 3.4.9 4.9L12 15.9l-4.4 2.4.9-4.9-3.6-3.4 4.9-.7z"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          fill="none"
        />
      );
    default:
      return (
        <Rect x={8} y={8} width={8} height={8} stroke={color} strokeWidth={STROKE} />
      );
  }
}

export function BadgeMedallion({
  badgeId,
  rarity,
  unlocked,
  size = 56,
}: BadgeMedallionProps) {
  useTheme();
  const ringColor = unlocked ? colors.gold : colors.inkFaint;
  const glyphColor = unlocked ? colors.gold : colors.inkFaint;
  const doubleRing =
    unlocked && (rarity === 'epic' || rarity === 'legendary');

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={12}
        cy={12}
        r={11}
        stroke={ringColor}
        strokeWidth={unlocked ? 1.5 : 1}
        fill={unlocked ? colors.card : 'none'}
      />
      {doubleRing ? (
        <Circle cx={12} cy={12} r={8.6} stroke={ringColor} strokeWidth={0.75} fill="none" />
      ) : null}
      <BadgeGlyph badgeId={badgeId} color={glyphColor} />
    </Svg>
  );
}

export default BadgeMedallion;
