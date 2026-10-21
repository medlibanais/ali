import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet } from 'react-native';
import { colors } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface ConfettiLiteProps {
  visible: boolean;
  /** Pillar color for the bulk of the pieces; gold accents are mixed in. */
  accentColor?: string;
  onDone?: () => void;
}

const PIECE_COUNT = 14;
const DURATION_MS = 2500;

interface Piece {
  left: number;
  delay: number;
  drift: number;
  rotate: string;
  color: string;
}

/**
 * A restrained celebration: a few small 4x8 rectangles falling over ~2.5s.
 * No emoji, no bursts, no loops.
 */
export function ConfettiLite({
  visible,
  accentColor = colors.accent,
  onDone,
}: ConfettiLiteProps) {
  const theme = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const screenHeight = Dimensions.get('window').height;

  const pieces = useMemo<Piece[]>(() => {
    const rand = (min: number, max: number) =>
      min + Math.random() * (max - min);
    return Array.from({ length: PIECE_COUNT }, (_, i) => ({
      left: rand(6, 94),
      delay: rand(0, 350),
      drift: rand(-36, 36),
      rotate: `${rand(-70, 70)}deg`,
      color: i % 3 === 0 ? colors.gold : accentColor,
    }));
  }, [accentColor, visible, theme]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        onDone?.();
      }
    });
    return () => animation.stop();
  }, [visible, progress, onDone]);

  if (!visible) {
    return null;
  }

  return (
    <>
      {pieces.map((piece, index) => {
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-24, screenHeight * 0.65],
        });
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.drift],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.75, 1],
          outputRange: [1, 1, 0],
        });
        return (
          <Animated.View
            key={index}
            pointerEvents="none"
            style={[
              styles.piece,
              {
                left: `${piece.left}%`,
                backgroundColor: piece.color,
                opacity,
                transform: [
                  { translateY },
                  { translateX },
                  { rotate: piece.rotate },
                ],
              },
            ]}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    width: 4,
    height: 8,
  },
});

export default ConfettiLite;
