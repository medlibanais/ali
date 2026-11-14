// Ambient: a few large, very soft color glows fixed behind every screen.
// They give the frosted panels (Glass, Card, tab bar) something to blur,
// so the glass reads as glass instead of a grey box.

import React, { useId } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors, isDarkPalette } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export function Ambient() {
  useTheme();
  const { width, height } = useWindowDimensions();
  const k = isDarkPalette() ? 1 : 0.6;
  // Every mounted screen paints its own glow; ids must be unique per
  // instance or web resolves url(#id) to a hidden tab's gradient.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const glows = [
    { x: width * 0.92, y: height * 0.06, r: width * 0.75, color: colors.accent, a: 0.16 * k },
    { x: width * 0.02, y: height * 0.48, r: width * 0.7, color: colors.pillar.work, a: 0.13 * k },
    { x: width * 0.95, y: height * 0.92, r: width * 0.7, color: colors.pillar.health, a: 0.11 * k },
  ];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {glows.map((g, i) => (
            <RadialGradient key={i} id={`amb${uid}${i}${g.color.slice(1)}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={g.color} stopOpacity={g.a} />
              <Stop offset="1" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {glows.map((g, i) => (
          <Circle key={i} cx={g.x} cy={g.y} r={g.r} fill={`url(#amb${uid}${i}${g.color.slice(1)})`} />
        ))}
      </Svg>
    </View>
  );
}

export default Ambient;
