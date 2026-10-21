import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Field from '../components/Field';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearAuthError, login } from '../store/slices/authSlice';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function LoginScreen({ navigation }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const { busy, error } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validate = (): boolean => {
    let valid = true;
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      valid = false;
    } else {
      setEmailError(null);
    }
    if (password.length === 0) {
      setPasswordError('Enter your password.');
      valid = false;
    } else {
      setPasswordError(null);
    }
    return valid;
  };

  const submit = async () => {
    dispatch(clearAuthError());
    if (validate()) {
      await dispatch(login({ email: email.trim(), password }));
    }
  };

  return (
    <Screen scroll keyboardAvoiding>
      <View style={styles.header}>
        <Txt variant="display">Welcome back</Txt>
        <Txt variant="body" color={colors.inkSoft} style={styles.subtitle}>
          Sign in to continue your practice.
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
          if (passwordError) setPasswordError(null);
        }}
        error={passwordError}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Your password"
      />

      {error ? (
        <Txt variant="caption" color={colors.danger} style={styles.formError}>
          {error}
        </Txt>
      ) : null}

      <Button
        title="Forgot password?"
        variant="ghost"
        onPress={() => navigation.navigate('ForgotPassword')}
        style={styles.forgotButton}
      />

      <Button title="Sign in" onPress={submit} loading={busy} disabled={busy} />

      <Button
        title="Create account"
        variant="ghost"
        onPress={() => navigation.navigate('Register')}
        style={styles.registerButton}
      />

      <Button
        title="Have an invite code? Join a friend"
        variant="ghost"
        onPress={() => navigation.navigate('Register', { showInvite: true })}
        style={styles.inviteButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
  formError: {
    marginBottom: spacing.md,
  },
  forgotButton: {
    marginBottom: spacing.sm,
  },
  registerButton: {
    marginTop: spacing.sm,
  },
  inviteButton: {
    marginTop: spacing.lg,
  },
});

export default LoginScreen;
