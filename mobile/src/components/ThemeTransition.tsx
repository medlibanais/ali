import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { getColors } from '../theme/tokens';
import { registerThemeTransition } from '../theme/transition';
import { useTheme } from '../theme/useTheme';

const FADE_MS = 360;

interface Snapshot {
  /** Picture of the old theme (Android). Null on web: a solid veil instead. */
  uri: string | null;
  /** Old canvas color, shown under the picture and as the web veil. */
  color: string;
}

interface ThemeTransitionProps {
  children: ReactNode;
}

/**
 * Cross-fades the whole app from the old theme to the new one.
 *
 * Android: a screenshot of the app in the old theme is laid on top, the new
 * theme renders underneath in the same frame, and the screenshot fades out.
 * Web: a veil in the old canvas color fades out instead (screenshots of the
 * DOM are too slow to feel instant). Skipped when the user asked the system
 * to reduce motion.
 */
export default function ThemeTransition({ children }: ThemeTransitionProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<View>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const opacity = useSharedValue(0);
  const imageLoaded = useRef<(() => void) | null>(null);
  const lastThemeId = useRef(theme.id);

  const clear = useCallback(() => {
    setSnapshot((current) => {
      if (current?.uri && Platform.OS !== 'web') {
        try {
          releaseCapture(current.uri);
        } catch {
          // Temporary file cleanup is best-effort.
        }
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      registerThemeTransition(null);
      return undefined;
    }
    registerThemeTransition(async () => {
      const color = getColors().paper;
      let uri: string | null = null;
      if (Platform.OS !== 'web' && rootRef.current) {
        uri = await captureRef(rootRef, { format: 'jpg', quality: 0.9, result: 'tmpfile' });
      }
      opacity.value = 1;
      if (uri) {
        // Wait until the picture is actually on screen before the store
        // swaps palettes, or the old theme would blink away.
        await new Promise<void>((resolve) => {
          imageLoaded.current = resolve;
          setSnapshot({ uri, color });
        });
      } else {
        setSnapshot({ uri: null, color });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    return () => registerThemeTransition(null);
  }, [opacity, reduceMotion]);

  // The new theme has rendered underneath: fade the old one away.
  useEffect(() => {
    if (lastThemeId.current === theme.id) return;
    lastThemeId.current = theme.id;
    if (!snapshot) return;
    opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
      if (finished) runOnJS(clear)();
    });
  }, [theme.id, snapshot, opacity, clear]);

  // Never leave a frozen frame on screen if the theme did not change.
  useEffect(() => {
    if (!snapshot) return undefined;
    const timer = setTimeout(clear, 1500);
    return () => clearTimeout(timer);
  }, [snapshot, clear]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.root}>
      <View ref={rootRef} collapsable={false} style={styles.root}>
        {children}
      </View>
      {snapshot ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: snapshot.color }, overlayStyle]}
        >
          {snapshot.uri ? (
            <Image
              source={{ uri: snapshot.uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              fadeDuration={0}
              onLoadEnd={() => {
                imageLoaded.current?.();
                imageLoaded.current = null;
              }}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
