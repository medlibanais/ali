import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    const result = await dispatch(sendPasswordReset({ email: email.trim() }));
    if (sendPasswordReset.fulfilled.match(result)) {
      setSent(true);
    } else {
      setError(result.payload ?? 'Could not send the reset email.');
    }
  };

  return (
    <Screen scroll keyboardAvoiding>
      <AuthHeader
        title="Reset password"
        subtitle={
          sent
            ? `If an account exists for ${email.trim()}, a reset link is on its way. Open it on this device. It expires in 1 hour.`
            : 'Enter the email you signed up with and we will send you a reset link.'
        }
      />

      {!sent ? (
        <Card>
          <Field
            label="Email"
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
            title="Send reset link"
            winTitle="Sending it your way"
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
            title="Resend link"
            variant="secondary"
            onPress={submit}
            loading={busy}
          />
        </>
      )}

      <Button
        title="Back to sign in"
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
