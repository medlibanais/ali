import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { borderWidth, colors, fonts, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
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
  ...inputProps
}: FieldProps) {
  useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Txt variant="label" style={styles.label}>
        {label}
      </Txt>
      <TextInput
        style={[
          styles.input,
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
      />
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
    },
    input: {
      minHeight: 48,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.ink,
    },
    inputFocused: {
      borderColor: colors.accent,
    },
    inputError: {
      borderColor: colors.danger,
    },
    error: {
      marginTop: spacing.xs,
    },
  }),
);

export default Field;
