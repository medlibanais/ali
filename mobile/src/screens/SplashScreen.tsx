import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import Hairline from '../components/Hairline';
import Button from '../components/Button';
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

interface ProfileUnavailableProps {
  onRetry: () => void;
  onSignOut: () => void;
}

/**
 * Signed in, but the profile could not be read and this device has no
 * record of a finished onboarding. Retrying is the main path; nothing is
 * lost by waiting, so onboarding is never shown on a guess.
 */
export function ProfileUnavailableScreen({ onRetry, onSignOut }: ProfileUnavailableProps) {
  const { t } = useTranslation();
  useTheme();
  return (
    <Screen>
      <View style={styles.center} accessibilityLiveRegion="polite">
        <Txt variant="display" style={styles.wordmark}>
          GROW
        </Txt>
        <Hairline style={styles.rule} />
        <Txt variant="title" accessibilityRole="header" style={styles.text}>
          {t('splash.profileUnavailable.title')}
        </Txt>
        <Txt variant="body" color={colors.inkSoft} style={[styles.text, styles.body]}>
          {t('splash.profileUnavailable.body')}
        </Txt>
        <Button
          title={t('splash.profileUnavailable.retry')}
          onPress={onRetry}
          style={styles.action}
          testID="profile-unavailable-retry"
        />
        <Button
          title={t('splash.profileUnavailable.signOut')}
          onPress={onSignOut}
          variant="ghost"
          style={styles.action}
        />
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
  text: {
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});

export default SplashScreen;
