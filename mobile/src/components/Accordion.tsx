// Accordion: a frosted card whose body folds away. Use it for detail that
// supports the main story of a screen but is not needed at first glance.

import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View, ViewStyle } from 'react-native';
import { colors, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Card from './Card';
import { ChevronGlyph } from './icons';
import Txt from './Txt';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface AccordionProps {
  title: string;
  /** One line shown under the title while folded, e.g. a key number. */
  summary?: string;
  defaultOpen?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function Accordion({ title, summary, defaultOpen = false, style, children }: AccordionProps) {
  useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  return (
    <Card style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerText}>
          <Txt variant="heading">{title}</Txt>
          {summary && !open ? (
            <Txt variant="caption" color={colors.inkSoft} style={styles.summary} numberOfLines={1}>
              {summary}
            </Txt>
          ) : null}
        </View>
        <View style={open ? styles.chevronOpen : styles.chevronClosed}>
          <ChevronGlyph size={18} color={colors.inkSoft} />
        </View>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
    },
    headerText: {
      flex: 1,
    },
    summary: {
      marginTop: 2,
    },
    chevronClosed: {
      transform: [{ rotate: '90deg' }],
    },
    chevronOpen: {
      transform: [{ rotate: '-90deg' }],
    },
    pressed: {
      opacity: 0.75,
    },
    body: {
      marginTop: spacing.md,
    },
  }),
);

export default Accordion;
