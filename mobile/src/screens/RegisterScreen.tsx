import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
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
      setEmailError('Enter a valid email address.');
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
    <Screen scroll keyboardAvoiding>
      <View style={styles.header}>
        <Txt variant="display">Create account</Txt>
        <Txt variant="body" color={colors.inkSoft} style={styles.subtitle}>
          One account for your whole life, across five pillars.
        </Txt>
      </View>

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
      <Field
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setPasswordTouched(true);
        }}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Choose a password"
      />

      <PasswordStrengthMeter password={password} />
      {passwordTouched && password.length > 0 && !allRulesMet ? (
        <Txt variant="caption" color={colors.danger} style={styles.rulesHint}>
          Your password does not meet every rule yet.
        </Txt>
      ) : null}

      {error ? (
        <Txt variant="caption" color={colors.danger} style={styles.formError}>
          {error}
        </Txt>
      ) : null}

      {inviteVisible ? (
        <Field
          label="Invite code (optional)"
          value={inviteCode}
          onChangeText={(t) => setInviteCode(t.toUpperCase())}
          placeholder="ABC12345"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      ) : (
        <Button
          title="Have an invite code?"
          variant="ghost"
          onPress={() => setInviteVisible(true)}
          style={styles.inviteToggle}
        />
      )}

      <Button title="Create account" onPress={submit} loading={busy} />
      <Button
        title="Back to sign in"
        variant="ghost"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      />
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: {
      marginTop: spacing.xxl,
      marginBottom: spacing.xl,
    },
    subtitle: {
      marginTop: spacing.sm,
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
