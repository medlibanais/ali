import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, softShadow, spacing, themed, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { IconProps } from './icons';
import { PressableScale } from './Motion';
import Txt from './Txt';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  /**
   * Trailing icon. While the button is hovered (web) or pressed it loops a
   * slide-through animation: out to the right, back in from the left.
   */
  icon?: (props: IconProps) => React.ReactElement;
  /** Label shown while hovered or pressed: a small "you're winning" beat. */
  winTitle?: string;
}

const useNative = Platform.OS !== 'web';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  icon: Icon,
  winTitle,
}: ButtonProps) {
  useTheme();
  const isDisabled = disabled || loading;
  const [engaged, setEngaged] = useState(false);
  const loop = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(0)).current;

  const textColor =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'secondary'
        ? colors.accent
        : colors.inkSoft;

  useEffect(() => {
    const active = engaged && !isDisabled;
    Animated.timing(swap, {
      toValue: active ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: useNative,
    }).start();
    if (!active || !Icon) {
      loop.stopAnimation();
      loop.setValue(0);
      return undefined;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(loop, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: useNative,
        }),
        Animated.delay(120),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [engaged, isDisabled, Icon, loop, swap]);

  const engage = () => setEngaged(true);
  const release = () => setEngaged(false);

  // Icon leaves to the right, re-enters from the left, settles.
  const iconStyle = {
    opacity: loop.interpolate({ inputRange: [0, 0.4, 0.5, 0.6, 1], outputRange: [1, 0, 0, 0, 1] }),
    transform: [
      {
        translateX: loop.interpolate({
          inputRange: [0, 0.45, 0.4501, 1],
          outputRange: [0, 16, -16, 0],
        }),
      },
      { scale: loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.7, 1] }) },
    ],
  };
  const restStyle = {
    opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
  };
  const winStyle = {
    opacity: swap,
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      onHoverIn={engage}
      onHoverOut={release}
      onPressIn={engage}
      onPressOut={release}
      disabled={isDisabled}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.accent} />
      ) : (
        <View style={styles.content}>
          <View style={styles.labelBox}>
            {/* Invisible copy of the longer label sizes the box, so both
                labels share one centered slot and never overlap the icon. */}
            {winTitle ? (
              <Txt variant="bodySemi" style={[styles.text, styles.sizer]} accessible={false}>
                {winTitle.length > title.length ? winTitle : title}
              </Txt>
            ) : null}
            <Animated.View style={winTitle ? [styles.layer, restStyle] : undefined}>
              <Txt
                variant="bodySemi"
                color={textColor}
                style={variant === 'ghost' ? styles.ghostText : styles.text}
              >
                {title}
              </Txt>
            </Animated.View>
            {winTitle ? (
              <Animated.View style={[styles.layer, winStyle]}>
                <Txt variant="bodySemi" color={textColor} style={styles.text} numberOfLines={1}>
                  {winTitle}
                </Txt>
              </Animated.View>
            ) : null}
          </View>
          {Icon ? (
            <Animated.View style={[styles.icon, iconStyle]}>
              <Icon size={18} color={textColor} />
            </Animated.View>
          ) : null}
        </View>
      )}
    </PressableScale>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    base: {
      minHeight: 52,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    primary: {
      backgroundColor: colors.accent,
      ...softShadow(2),
      shadowColor: colors.accent,
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    },
    secondary: {
      backgroundColor: withAlpha(colors.accent, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, 0.35),
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    disabled: {
      opacity: 0.45,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    labelBox: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    sizer: {
      opacity: 0,
    },
    layer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      fontSize: 16,
    },
    ghostText: {
      fontSize: 15,
    },
    icon: {
      marginLeft: spacing.sm,
    },
  }),
);

export default Button;
