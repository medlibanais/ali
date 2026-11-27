import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet } from 'react-native';
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
  const { t } = useTranslation();
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
      setError(t('resetPassword.theTwoPasswordsDo'));
      return;
    }
    const result = await dispatch(updatePassword({ password }));
    if (updatePassword.fulfilled.match(result)) {
      setDoneState('done');
      // End the recovery session so the app returns to the signed-out state.
      await supabase.auth.signOut();
    } else {
      setError(result.payload ?? t('resetPassword.couldNotUpdateThe'));
    }
  };

  return (
    <Screen scroll keyboardAvoiding>
      <AuthHeader
        title={t('resetPassword.setANewPassword')}
        subtitle={
          linkState === 'invalid'
            ? t('resetPassword.thisResetLinkIs')
            : doneState === 'done'
              ? t('resetPassword.yourPasswordWasUpdated')
              : t('resetPassword.chooseAStrongPassword')
        }
      />

      {linkState === 'ready' && doneState === 'form' ? (
        <Card style={styles.form}>
          <Field
            label={t('resetPassword.newPassword')}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setTouched(true);
            }}
            secureTextEntry
            autoCapitalize="none"
            placeholder={t('resetPassword.newPassword')}
          />
          <PasswordStrengthMeter password={password} />
          <Field
            label={t('resetPassword.confirmPassword')}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            placeholder={t('resetPassword.repeatTheNewPassword')}
            error={
              touched && confirm.length > 0 && password !== confirm
                ? t('resetPassword.passwordsDoNotMatch')
                : null
            }
          />
          {touched && !passwordRulesMet(password) ? (
            <Txt variant="caption" color={colors.danger} style={styles.formError}>
              {t('resetPassword.yourPasswordDoesNot')}
            </Txt>
          ) : null}
          {error ? (
            <Txt variant="caption" color={colors.danger} style={styles.formError}>
              {error}
            </Txt>
          ) : null}
          <Button
            title={t('resetPassword.updatePassword')}
            winTitle={t('resetPassword.lockedIn')}
            icon={ArrowRightGlyph}
            onPress={submit}
            loading={busy}
          />
        </Card>
      ) : null}

      {linkState === 'invalid' ? (
        <Button
          title={t('resetPassword.requestANewLink')}
          onPress={() => navigation.navigate('ForgotPassword')}
        />
      ) : null}
      {doneState === 'done' ? (
        <Button
          title={t('resetPassword.backToSignIn')}
          onPress={() => navigation.navigate('Login')}
        />
      ) : null}
      {doneState === 'form' ? (
        <Button
          title={t('resetPassword.backToSignIn')}
          variant="ghost"
          onPress={() => navigation.navigate('Login')}
          style={styles.backButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { marginBottom: spacing.sm },
  formError: { marginBottom: spacing.md },
  backButton: { marginTop: spacing.sm },
});

export default ResetPasswordScreen;
