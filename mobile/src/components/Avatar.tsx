import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Txt from './Txt';
import { borderWidth, colors, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface AvatarProps {
  uri?: string | null;
  size?: number;
  ringColor?: string;
  /** Used for the initials placeholder when there is no image. */
  name?: string | null;
}

/**
 * Circular avatar with a thin ring. Circles are geometric shapes (like the
 * ScoreRing), so the avatar ring is intentionally not part of the
 * rectilinear corner radius scale.
 */
export function Avatar({ uri, size = 120, ringColor = colors.line, name }: AvatarProps) {
  useTheme();
  const ring = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: ringColor,
  };
  const image = {
    width: size - 8,
    height: size - 8,
    borderRadius: (size - 8) / 2,
  };
  const initial = name?.trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      style={[styles.ring, ring]}
      accessibilityLabel={name ? `Avatar of ${name}` : 'Avatar'}
    >
      {uri ? (
        <Image source={{ uri }} style={image} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholder, image]}>
          <Txt
            variant="display"
            color={colors.accent}
            style={{ fontSize: size * 0.38, lineHeight: size * 0.42 }}
          >
            {initial}
          </Txt>
        </View>
      )}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    ring: {
      borderWidth: borderWidth.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    placeholder: {
      backgroundColor: colors.paperAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);

export default Avatar;
