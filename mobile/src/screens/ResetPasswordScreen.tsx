import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Field from '../components/Field';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { passwordRulesMet } from '../lib/password';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updatePassword } from '../store/slices/authSlice';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

type LinkState = 'checking' | 'ready' | 'invalid';
type DoneState = 'form' | 'done';

function paramsFromUrl(url: string): URLSearchParams | null {
  try {
    const queryIndex = url.indexOf('?');
    const hashIndex = url.indexOf('#');
    const raw =
      queryIndex >= 0
        ? url.slice(queryIndex + 1)
        : hashIndex >= 0
          ? url.slice(hashIndex + 1)
          : null;
    return raw ? new URLSearchParams(raw) : null;
  } catch {
    return null;
  }
}

export function ResetPasswordScreen({ navigation, route }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const { busy } = useAppSelector((state) => state.auth);
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [doneState, setDoneState] = useState<DoneState>('form');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Establish the recovery session from the deep link (?code=... PKCE or
  // ?token_hash=...&type=recovery). On web the SDK may already have
  // exchanged it via detectSessionInUrl.
  useEffect(() => {
    let cancelled = false;

    async function establish(url: string | null) {
      const params = url ? paramsFromUrl(url) : null;
      const code =
        route.params?.code ?? params?.get('code') ?? undefined;
      const tokenHash =
        route.params?.token_hash ?? params?.get('token_hash') ?? undefined;

      try {
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          if (!cancelled) setLinkState('ready');
          return;
        }
        if (tokenHash) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (otpError) throw otpError;
          if (!cancelled) setLinkState('ready');
          return;
        }
        // Web: session may already exist from detectSessionInUrl.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) setLinkState(session ? 'ready' : 'invalid');
      } catch {
        if (!cancelled) setLinkState('invalid');
      }
    }

    Linking.getInitialURL().then(establish);
    const sub = Linking.addEventListener('url', ({ url }) => establish(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setError(null);
    setTouched(true);
    if (!passwordRulesMet(password)) return;
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    const result = await dispatch(updatePassword({ password }));
    if (updatePassword.fulfilled.match(result)) {
      setDoneState('done');
      // End the recovery session so the app returns to the signed-out state.
      await supabase.auth.signOut();
    } else {
      setError(result.payload ?? 'Could not update the password.');
    }
  };

  return (
    <Screen scroll keyboardAvoiding>
      <View style={styles.header}>
        <Txt variant="display">Set a new password</Txt>
        <Txt variant="body" color={colors.inkSoft} style={styles.subtitle}>
          {linkState === 'invalid'
            ? 'This reset link is invalid or has expired.'
            : doneState === 'done'
              ? 'Your password was updated. Sign in with the new one.'
              : 'Choose a strong password you do not use anywhere else.'}
        </Txt>
      </View>

      {linkState === 'ready' && doneState === 'form' ? (
        <>
          <Field
            label="New password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setTouched(true);
            }}
            secureTextEntry
            autoCapitalize="none"
            placeholder="New password"
          />
          <PasswordStrengthMeter password={password} />
          <Field
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Repeat the new password"
            error={
              touched && confirm.length > 0 && password !== confirm
                ? 'Passwords do not match.'
                : null
            }
          />
          {touched && !passwordRulesMet(password) ? (
            <Txt variant="caption" color={colors.danger} style={styles.formError}>
              Your password does not meet every rule yet.
            </Txt>
          ) : null}
          {error ? (
            <Txt variant="caption" color={colors.danger} style={styles.formError}>
              {error}
            </Txt>
          ) : null}
          <Button title="Update password" onPress={submit} loading={busy} />
        </>
      ) : null}

      {linkState === 'invalid' ? (
        <Button
          title="Request a new link"
          onPress={() => navigation.navigate('ForgotPassword')}
        />
      ) : null}
      {doneState === 'done' ? (
        <Button
          title="Back to sign in"
          onPress={() => navigation.navigate('Login')}
        />
      ) : null}
      {doneState === 'form' ? (
        <Button
          title="Back to sign in"
          variant="ghost"
          onPress={() => navigation.navigate('Login')}
          style={styles.backButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  subtitle: { marginTop: spacing.sm },
  formError: { marginBottom: spacing.md },
  backButton: { marginTop: spacing.sm },
});

export default ResetPasswordScreen;
