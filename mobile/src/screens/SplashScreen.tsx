import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import Hairline from '../components/Hairline';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export function SplashScreen() {
  const { t } = useTranslation();
  useTheme();
  return (
    <Screen padded={false}>
      <View style={styles.center}>
        <Txt variant="display" style={styles.wordmark}>
          GROW
        </Txt>
        <Hairline style={styles.rule} />
        <Txt variant="caption" color={colors.inkFaint}>
          {t('splash.whoAreYouBecoming')}
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    letterSpacing: -0.8,
  },
  rule: {
    width: 48,
    marginVertical: spacing.md,
  },
});

export default SplashScreen;
