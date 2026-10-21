// Backdrop: soft, blurred-looking color halos behind the top of a screen
// (Figma: tinted blobs with a heavy blur). Radial gradients fade each blob
// to nothing, so no blur library is needed. Place it as the first child of
// a padded Screen; it spans the full window width behind the content.

import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

export interface Blob {
  /** Horizontal center as a share of the window width (0..1). */
  x: number;
  /** Vertical center in px from the top of the content. */
  y: number;
  r: number;
  color: string;
  /** Peak opacity at the center. */
  strength?: number;
}

const MAX_COLUMN = 720;

export function Backdrop({ blobs, height = 820 }: { blobs: Blob[]; height?: number }) {
  const { width } = useWindowDimensions();
  // Screen centers its column at up to 720px; reach back to the window edge.
  const left = -(width - Math.min(width, MAX_COLUMN)) / 2;
  return (
    <View style={[styles.wrap, { width, height, left }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {blobs.map((blob, i) => (
            // The id carries the color: native svg caches gradients by id,
            // so a theme change must produce a new id to repaint.
            <RadialGradient key={i} id={`blob${i}${blob.color.slice(1)}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={blob.color} stopOpacity={blob.strength ?? 0.16} />
              <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((blob, i) => (
          <Circle
            key={i}
            cx={blob.x * width}
            cy={blob.y}
            r={blob.r}
            fill={`url(#blob${i}${blob.color.slice(1)})`}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -40,
  },
});

export default Backdrop;
