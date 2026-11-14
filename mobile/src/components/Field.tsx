import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, fonts, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { EyeGlyph, EyeOffGlyph } from './icons';
import Txt from './Txt';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  containerStyle?: ViewStyle;
}

export function Field({
  label,
  error,
  containerStyle,
  onFocus,
  onBlur,
  secureTextEntry,
  ...inputProps
}: FieldProps) {
  useTheme();
  const [focused, setFocused] = useState(false);
  // Password fields get a show/hide toggle; the text starts hidden.
  const isPassword = secureTextEntry === true;
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Txt variant="label" style={styles.label}>
        {label}
      </Txt>
      <View style={styles.inputWrap}>
        <TextInput
          style={[
            styles.input,
            isPassword && styles.inputWithToggle,
            focused && styles.inputFocused,
            error ? styles.inputError : null,
          ]}
          placeholderTextColor={colors.inkFaint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...inputProps}
          secureTextEntry={isPassword && !revealed}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={
              revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`
            }
            accessibilityState={{ checked: revealed }}
            hitSlop={4}
            style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
          >
            {revealed ? (
              <EyeOffGlyph size={20} color={colors.inkSoft} />
            ) : (
              <EyeGlyph size={20} color={colors.inkSoft} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Txt variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    label: {
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      color: colors.inkSoft,
    },
    input: {
      minHeight: 52,
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: 14,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.lg,
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.ink,
    },
    inputWrap: {
      position: 'relative',
      justifyContent: 'center',
    },
    inputWithToggle: {
      paddingRight: 48,
    },
    toggle: {
      position: 'absolute',
      right: 2,
      top: 0,
      bottom: 0,
      width: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    togglePressed: {
      opacity: 0.6,
    },
    inputFocused: {
      borderColor: colors.accent,
      backgroundColor: colors.paperAlt,
    },
    inputError: {
      borderColor: colors.danger,
    },
    error: {
      marginTop: spacing.xs + 2,
    },
  }),
);

export default Field;
