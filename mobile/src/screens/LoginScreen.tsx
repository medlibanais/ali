import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AuthHeader from '../components/AuthHeader';
import Button from '../components/Button';
import Card from '../components/Card';
import { ArrowRightGlyph } from '../components/icons';
import Field from '../components/Field';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearAuthError, login } from '../store/slices/authSlice';
import { colors, spacing, themed } from '../theme/tokens';
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
      <AuthHeader title="Welcome back" subtitle="Sign in to pick up today's quests." />

      <Card style={styles.form}>
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
          containerStyle={styles.passwordField}
        />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Forgot password?"
          onPress={() => navigation.navigate('ForgotPassword')}
          style={styles.forgot}
          hitSlop={8}
        >
          <Txt variant="bodySemi" color={colors.accent} style={styles.smallLink}>
            Forgot password?
          </Txt>
        </Pressable>

        {error ? (
          <Txt variant="caption" color={colors.danger} style={styles.formError}>
            {error}
          </Txt>
        ) : null}

        <Button
          title="Sign in"
          winTitle="Let's grow"
          icon={ArrowRightGlyph}
          onPress={submit}
          loading={busy}
          disabled={busy}
        />
      </Card>

      <View style={styles.divider}>
        <View style={styles.rule} />
        <Txt variant="label" style={styles.dividerText}>
          New to GROW?
        </Txt>
        <View style={styles.rule} />
      </View>

      <Button
        title="Create account"
        variant="secondary"
        onPress={() => navigation.navigate('Register')}
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

const styles = themed(() =>
  StyleSheet.create({
    form: {
      marginBottom: spacing.xl,
    },
    passwordField: {
      marginBottom: spacing.sm,
    },
    forgot: {
      alignSelf: 'flex-end',
      minHeight: 44,
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    smallLink: {
      fontSize: 14,
    },
    formError: {
      marginBottom: spacing.md,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    rule: {
      flex: 1,
      height: 1,
      backgroundColor: colors.line,
    },
    dividerText: {
      marginHorizontal: spacing.md,
    },
    inviteButton: {
      marginTop: spacing.sm,
    },
  }),
);

export default LoginScreen;
