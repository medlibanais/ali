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
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  title: {
    fontFamily: fonts.title,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  heading: {
    fontFamily: fonts.title,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
  },
  bodySemi: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.8,
    color: colors.inkSoft,
  },
  caption: {
    fontFamily: fonts.body,
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
