// "Who are you becoming?" card: Current You next to Future You. Until a
// Future You exists it invites making one.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import AvatarView from '../avatar/AvatarView';
import { VALID_OPTION_IDS } from '../avatar/options';
import { readAvatarDoc } from '../avatar/types';
import { colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Card from './Card';
import { ArrowRightGlyph } from './icons';
import { PressableScale } from './Motion';
import Txt from './Txt';

export interface BecomingCardProps {
  avatarConfig: Record<string, unknown> | null | undefined;
  /** Open the avatar editor on Current You or Future You. */
  onEdit: (who: 'current' | 'future') => void;
}

const FIGURE = 190;

export function BecomingCard({ avatarConfig, onEdit }: BecomingCardProps) {
  useTheme();
  const { t } = useTranslation();
  const doc = useMemo(() => readAvatarDoc(avatarConfig, VALID_OPTION_IDS), [avatarConfig]);
  return (
    <Card style={styles.card}>
      <Txt variant="label" color={colors.inkSoft}>{t('becoming.question')}</Txt>
      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('becoming.currentA11y')}
          onPress={() => onEdit('current')}
          style={styles.figure}
        >
          <AvatarView config={doc.current} size={FIGURE} mood="neutral" mode="full-body" bare animated={false} />
          <Txt variant="bodySemi">{t('becoming.current')}</Txt>
          <Txt variant="caption" color={colors.inkSoft}>{t('becoming.today')}</Txt>
        </PressableScale>
        <View style={styles.arrow}>
          <ArrowRightGlyph color={colors.accent} />
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={doc.future ? t('becoming.futureA11y') : t('becoming.createFutureA11y')}
          onPress={() => onEdit('future')}
          style={styles.figure}
        >
          {doc.future ? (
            <AvatarView config={doc.future} size={FIGURE} mood="happy" mode="full-body" bare animated={false} />
          ) : (
            <View style={styles.empty}>
              <Txt variant="title" color={colors.accent}>+</Txt>
              <Txt variant="caption" color={colors.inkSoft} style={styles.center}>{t('becoming.createFuture')}</Txt>
            </View>
          )}
          <Txt variant="bodySemi">{t('becoming.future')}</Txt>
          <Txt variant="caption" color={colors.inkSoft}>{t('becoming.becoming')}</Txt>
        </PressableScale>
      </View>
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
    },
    figure: {
      alignItems: 'center',
      minWidth: 110,
      minHeight: 44,
    },
    arrow: {
      width: 32,
      alignItems: 'center',
    },
    empty: {
      width: 100,
      height: FIGURE,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.sm,
      gap: spacing.xs,
    },
    center: {
      textAlign: 'center',
    },
  }),
);

export default BecomingCard;
