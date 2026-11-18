import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AuthHeader from '../components/AuthHeader';
import Button from '../components/Button';
import Card from '../components/Card';
import { MailGlyph } from '../components/icons';
import Field from '../components/Field';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { sendPasswordReset } from '../store/slices/authSlice';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  const { busy } = useAppSelector((state) => state.auth);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t('forgotPassword.enterAValidEmail'));
      return;
    }
    setEmailError(null);
    const result = await dispatch(sendPasswordReset({ email: email.trim() }));
    if (sendPasswordReset.fulfilled.match(result)) {
      setSent(true);
    } else {
      setError(result.payload ?? t('forgotPassword.couldNotSendThe'));
    }
  };

  return (
    <Screen scroll keyboardAvoiding>
      <AuthHeader
        title={t('forgotPassword.resetPassword')}
        subtitle={
          sent
            ? t('forgotPassword.ifAnAccountExists', { email: email.trim() })
            : t('forgotPassword.enterTheEmailYou')
        }
      />

      {!sent ? (
        <Card>
          <Field
            label={t('forgotPassword.email')}
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
          {error ? (
            <Txt variant="caption" color={colors.danger} style={styles.formError}>
              {error}
            </Txt>
          ) : null}
          <Button
            title={t('forgotPassword.sendResetLink')}
            winTitle={t('forgotPassword.sendingItYourWay')}
            icon={MailGlyph}
            onPress={submit}
            loading={busy}
          />
        </Card>
      ) : (
        <>
          {error ? (
            <Txt variant="caption" color={colors.danger} style={styles.formError}>
              {error}
            </Txt>
          ) : null}
          <Button
            title={t('forgotPassword.resendLink')}
            variant="secondary"
            onPress={submit}
            loading={busy}
          />
        </>
      )}

      <Button
        title={t('forgotPassword.backToSignIn')}
        variant="ghost"
        onPress={() => navigation.navigate('Login')}
        style={styles.backButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  formError: { marginBottom: spacing.md },
  backButton: { marginTop: spacing.sm },
});

export default ForgotPasswordScreen;
