import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AuthHeader from '../components/AuthHeader';
import Button from '../components/Button';
import Card from '../components/Card';
import { ArrowRightGlyph } from '../components/icons';
import Field from '../components/Field';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { passwordRulesMet } from '../lib/password';
import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  clearAuthError,
  register,
  setPendingInviteCode,
} from '../store/slices/authSlice';
import { colors, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function RegisterScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  const { busy, error } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(
    route.params?.showInvite ?? false,
  );
  const [inviteCode, setInviteCode] = useState('');

  const allRulesMet = passwordRulesMet(password);

  const submit = async () => {
    dispatch(clearAuthError());
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t('register.enterAValidEmail'));
      return;
    }
    setEmailError(null);
    setPasswordTouched(true);
    if (!allRulesMet) {
      return;
    }
    const result = await dispatch(
      register({ email: email.trim(), password }),
    );
    if (register.fulfilled.match(result)) {
      const code = inviteCode.trim().toUpperCase();
      if (code.length >= 4) {
        dispatch(setPendingInviteCode(code));
      }
      navigation.navigate('VerifyEmail', { email: email.trim() });
    }
  };

  return (
    <Screen scroll keyboardAvoiding testID="register-scroll">
      <AuthHeader
        title={t('register.createAccount')}
        subtitle={t('register.oneAccountForYour')}
      />

      <Card style={styles.form}>
        <Field
          label={t('register.email')}
          testID="register-email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (emailError) setEmailError(null);
          }}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Field
          label={t('register.password')}
          testID="register-password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setPasswordTouched(true);
          }}
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={submit}
          placeholder={t('register.chooseAPassword')}
        />

        <PasswordStrengthMeter password={password} />
        {passwordTouched && password.length > 0 && !allRulesMet ? (
          <Txt variant="caption" color={colors.danger} style={styles.rulesHint}>
            {t('register.yourPasswordDoesNot')}
          </Txt>
        ) : null}

        {error ? (
          <Txt variant="caption" color={colors.danger} style={styles.formError}>
            {error}
          </Txt>
        ) : null}

        {inviteVisible ? (
          <Field
            label={t('register.inviteCodeOptional')}
            value={inviteCode}
            onChangeText={(t) => setInviteCode(t.toUpperCase())}
            placeholder="ABC12345"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        ) : (
          <Button
            title={t('register.haveAnInviteCode')}
            variant="ghost"
            onPress={() => setInviteVisible(true)}
            style={styles.inviteToggle}
          />
        )}

        <Button
          title={t('register.createAccount')}
          testID="register-submit"
          winTitle={t('register.startGrowing')}
          icon={ArrowRightGlyph}
          onPress={submit}
          loading={busy}
        />
      </Card>
      <Button
        title={t('register.backToSignIn')}
        variant="ghost"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      />
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    form: {
      marginBottom: spacing.md,
    },
    rulesHint: {
      marginTop: -spacing.sm,
      marginBottom: spacing.md,
    },
    formError: {
      marginBottom: spacing.md,
    },
    backButton: {
      marginTop: spacing.sm,
    },
    inviteToggle: {
      marginBottom: spacing.md,
    },
  }),
);

export default RegisterScreen;
