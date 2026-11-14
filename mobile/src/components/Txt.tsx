import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';
import { colors, fonts, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export type TxtVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodySemi'
  | 'label'
  | 'caption';

export interface TxtProps extends TextProps {
  variant?: TxtVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  children: React.ReactNode;
}

const variantStyles = themed((): Record<TxtVariant, TextStyle> => ({
  display: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  title: {
    fontFamily: fonts.title,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  // Section headings use Inter Bold: Anton is reserved for the one
  // uppercase screen title, so each screen has a single loud voice.
  heading: {
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  bodySemi: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  caption: {
    fontFamily: fonts.caption,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
}));

export function Txt({
  variant = 'body',
  color,
  align,
  style,
  children,
  ...rest
}: TxtProps) {
  useTheme();
  return (
    <Text
      style={[
        variantStyles[variant],
        color ? { color } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export default Txt;
