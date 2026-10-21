import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { borderWidth, colors, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export function Hairline({ style }: { style?: ViewStyle }) {
  useTheme();
  return <View style={[styles.line, style]} />;
}

const styles = themed(() =>
  StyleSheet.create({
    line: {
      height: borderWidth.hairline,
      backgroundColor: colors.line,
    },
  }),
);

export default Hairline;
