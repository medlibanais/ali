import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { resendVerification } from '../store/slices/authSlice';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

type VerifyState = 'idle' | 'verifying' | 'verified' | 'failed';

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

export function VerifyEmailScreen({ navigation, route }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const { busy } = useAppSelector((state) => state.auth);
  const email = route.params?.email;
  const [state, setState] = useState<VerifyState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  const handleUrl = useCallback(async (url: string | null, params: {
    code?: string;
    token_hash?: string;
  }) => {
    const urlParams = url ? paramsFromUrl(url) : null;
    const code = params.code ?? urlParams?.get('code') ?? null;
    const tokenHash = params.token_hash ?? urlParams?.get('token_hash') ?? null;
    if (!code && !tokenHash) return;

    setState('verifying');
    try {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'signup',
        });
        if (error) throw error;
      }
      setState('verified');
      setMessage('Your email is verified. Setting up your account…');
      // The auth state listener moves the app into onboarding automatically.
    } catch {
      setState('failed');
      setMessage(
        'That link is invalid or has expired. Request a new one below.',
      );
    }
  }, []);

  useEffect(() => {
    const params = {
      code: route.params?.code,
      token_hash: route.params?.token_hash,
    };
    if (params.code || params.token_hash) {
      handleUrl(null, params);
      return;
    }
    const sub = Linking.addEventListener('url', ({ url }) =>
      handleUrl(url, {}),
    );
    Linking.getInitialURL().then((url) => {
      if (url && url.includes('verify-email')) handleUrl(url, {});
    });
    return () => sub.remove();
  }, [route.params?.code, route.params?.token_hash, handleUrl]);

  const resend = async () => {
    if (!email) {
      setResendNote('Sign in again to request a new link.');
      return;
    }
    setResendNote(null);
    const result = await dispatch(resendVerification({ email }));
    if (resendVerification.fulfilled.match(result)) {
      setResendNote('A new link is on its way. Check spam if it does not arrive.');
    } else {
      setResendNote(result.payload ?? 'Could not resend the email.');
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Txt variant="display">Check your inbox</Txt>
        <Txt variant="body" color={colors.inkSoft} style={styles.subtitle}>
          {email
            ? `We sent a verification link to ${email}.`
            : 'We sent you a verification link.'}{' '}
          Open it on this device to activate your account. The link stays valid
          for 24 hours.
        </Txt>
      </View>

      {state !== 'idle' ? (
        <Card style={styles.statusCard}>
          <Txt variant="heading">
            {state === 'verifying'
              ? 'Verifying your link'
              : state === 'verified'
                ? 'Email verified'
                : 'Verification failed'}
          </Txt>
          {message ? (
            <Txt
              variant="body"
              color={state === 'failed' ? colors.danger : colors.inkSoft}
              style={styles.statusMessage}
            >
              {message}
            </Txt>
          ) : null}
          {state === 'verified' ? (
            <Button
              title="Continue"
              onPress={() => navigation.navigate('Login')}
              style={styles.statusButton}
            />
          ) : null}
        </Card>
      ) : null}

      <View style={styles.resendSection}>
        <Txt variant="body" color={colors.inkSoft} style={styles.resendText}>
          Nothing arrived yet. Check spam first, then request a new link.
        </Txt>
        <Button
          title="Resend verification email"
          variant="secondary"
          onPress={resend}
          loading={busy}
        />
        {resendNote ? (
          <Txt variant="caption" color={colors.inkSoft} style={styles.resendNote}>
            {resendNote}
          </Txt>
        ) : null}
      </View>

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
  header: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  subtitle: { marginTop: spacing.sm },
  statusCard: { marginBottom: spacing.xl },
  statusMessage: { marginTop: spacing.sm },
  statusButton: { marginTop: spacing.lg },
  resendSection: { marginBottom: spacing.xl },
  resendText: { marginBottom: spacing.lg },
  resendNote: { marginTop: spacing.md },
  backButton: { marginTop: spacing.sm },
});

export default VerifyEmailScreen;
