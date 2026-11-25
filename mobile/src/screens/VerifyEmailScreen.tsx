import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import DrawnCheck from '../components/DrawnCheck';
import Glass from '../components/Glass';
import { MailGlyph } from '../components/icons';
import Screen from '../components/Screen';
import { useToast } from '../components/Toast';
import Txt from '../components/Txt';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch } from '../store/hooks';
import { resendVerification } from '../store/slices/authSlice';
import { colors, fonts, radius, spacing, themed, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;
type LinkParams = {
  code?: string;
  token_hash?: string;
  signupSession?: { access_token: string; refresh_token: string };
};
type Verification = 'idle' | 'verifying' | 'verified' | 'invalidCode' | 'invalidLink';

const OTP_LENGTH = 6;
const CELLS = Array.from({ length: OTP_LENGTH }, (_, i) => i);
const FOCUS_GLOW = FadeIn.duration(160).reduceMotion(ReduceMotion.System);

function normalizeCode(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf))
    .replace(/[^0-9]/g, '')
    .slice(0, OTP_LENGTH);
}

function verificationParams(url: string): LinkParams | null {
  try {
    const link = new URL(url);
    const isAppLink = link.protocol === 'prayerlock:' &&
      (link.hostname === 'verify-email' || link.pathname === '/verify-email');
    const isWebLink = typeof window !== 'undefined' &&
      link.origin === window.location?.origin && link.pathname === '/verify-email';
    if (!isAppLink && !isWebLink) return null;
    const fragment = new URLSearchParams(link.hash.slice(1));
    const access = fragment.get('access_token');
    const refresh = fragment.get('refresh_token');
    return {
      signupSession: fragment.get('type') === 'signup' && access && refresh
        ? { access_token: access, refresh_token: refresh }
        : undefined,
      code: link.searchParams.get('code') ?? fragment.get('code') ?? undefined,
      token_hash: link.searchParams.get('token_hash') ?? fragment.get('token_hash') ?? undefined,
    };
  } catch {
    return null;
  }
}

export function VerifyEmailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  useTheme();
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const email = route.params?.email?.trim();
  const routeCode = route.params?.code;
  const routeTokenHash = route.params?.token_hash;
  const [state, setState] = useState<Verification>('idle');
  const [digits, setDigits] = useState('');
  const [focused, setFocused] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const actionInFlight = useRef(false);
  const confirmed = useRef(false);
  const lastLink = useRef<string>();

  const verify = useCallback(async (
    request: () => Promise<{ error: unknown }>,
    failure: 'invalidCode' | 'invalidLink',
  ) => {
    if (actionInFlight.current || confirmed.current) return;
    actionInFlight.current = true;
    setState('verifying');
    setResendNote(null);
    try {
      const { error } = await request();
      if (error) throw error;
      confirmed.current = true;
      setState('verified');
      // The auth listener may already have routed the user to onboarding.
      showToast({ message: t('verifyEmail.emailVerified') });
    } catch {
      setState(failure);
    } finally {
      actionInFlight.current = false;
    }
  }, [showToast, t]);

  useEffect(() => {
    let active = true;
    const handleLink = (params: LinkParams | null) => {
      if (!active || !params || actionInFlight.current || confirmed.current) return;
      const { code, token_hash, signupSession } = params;
      const key = code ?? token_hash ?? signupSession?.access_token;
      if (!key || lastLink.current === key) return;
      lastLink.current = key;
      if (code) {
        void verify(() => supabase.auth.exchangeCodeForSession(code), 'invalidLink');
      } else if (token_hash) {
        void verify(() => supabase.auth.verifyOtp({ token_hash, type: 'signup' }), 'invalidLink');
      } else if (signupSession) {
        void verify(() => supabase.auth.setSession(signupSession), 'invalidLink');
      }
    };
    handleLink({ code: routeCode, token_hash: routeTokenHash });
    const subscription = Linking.addEventListener('url', ({ url }) => handleLink(verificationParams(url)));
    void Linking.getInitialURL()
      .then((url) => { if (url) handleLink(verificationParams(url)); })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [routeCode, routeTokenHash, verify]);

  const verifyCode = (token: string) => {
    if (!email || token.length !== OTP_LENGTH) return;
    void verify(() => supabase.auth.verifyOtp({ email, token, type: 'email' }), 'invalidCode');
  };

  const resend = async () => {
    if (!email || actionInFlight.current || confirmed.current) return;
    actionInFlight.current = true;
    setResending(true);
    setResendNote(null);
    try {
      const result = await dispatch(resendVerification({ email }));
      if (resendVerification.fulfilled.match(result)) {
        setDigits('');
        setState('idle');
        setResendNote(t('verifyEmail.newCodeSent'));
      } else {
        setResendNote(result.payload ?? t('verifyEmail.couldNotResendThe'));
      }
    } finally {
      actionInFlight.current = false;
      setResending(false);
    }
  };

  const verifying = state === 'verifying';
  const verified = state === 'verified';
  const failed = state === 'invalidCode' || state === 'invalidLink';
  const statusMessage = state === 'invalidCode'
    ? t('verifyEmail.invalidCode')
    : state === 'invalidLink' ? t('verifyEmail.thatLinkIsInvalid') : null;

  return (
    <Screen scroll keyboardAvoiding contentStyle={styles.screen}>
      <Glass style={styles.panel} intensity={48} tint={0.72}>
        <View style={styles.badge} accessible={false}>
          {verified
            ? <DrawnCheck animate size={28} color={colors.onAccent} />
            : <MailGlyph size={26} color={colors.onAccent} />}
        </View>
        <Txt testID="verify-title" variant="title" align="center" style={styles.title}>
          {verified ? t('verifyEmail.emailVerified') : t('verifyEmail.checkYourInbox')}
        </Txt>
        <Txt variant="body" align="center" color={colors.inkSoft}>
          {verified
            ? t('verifyEmail.yourEmailIsVerified')
            : email
              ? t('verifyEmail.codeSentTo', { email })
              : t('verifyEmail.weSentYouA')}
        </Txt>

        {email && !verified ? (
          <>
            <View style={styles.codeField}>
              <View
                style={styles.cells}
                pointerEvents="none"
                aria-hidden
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {CELLS.map((index) => {
                  const active = focused && !verifying && index === Math.min(digits.length, OTP_LENGTH - 1);
                  return (
                    <View
                      key={index}
                      style={[styles.cell, digits[index] ? styles.filledCell : null,
                        active ? styles.activeCell : null, failed ? styles.invalidCell : null]}
                    >
                      {active && !failed ? (
                        <Animated.View entering={FOCUS_GLOW} style={styles.cellGlow} />
                      ) : null}
                      <Txt variant="heading" align="center" style={styles.digit}>{digits[index] ?? '·'}</Txt>
                    </View>
                  );
                })}
              </View>
              <TextInput
                testID="verify-code"
                accessibilityLabel={t('verifyEmail.codeLabel')}
                value={digits}
                editable={!verifying && !resending}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCorrect={false}
                caretHidden
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChangeText={(value) => {
                  if (actionInFlight.current) return;
                  const next = normalizeCode(value);
                  if (next === digits) return;
                  setDigits(next);
                  setState('idle');
                  if (next.length === OTP_LENGTH) verifyCode(next);
                }}
                style={styles.input}
              />
            </View>
            <Txt variant="caption" align="center" color={colors.inkSoft} style={styles.hint}>
              {t('verifyEmail.codeOrLink')}
            </Txt>
          </>
        ) : null}

        {statusMessage ? (
          <Txt accessibilityRole="alert" variant="body" color={colors.danger} align="center" style={styles.status}>
            {statusMessage}
          </Txt>
        ) : null}
        {email && !verified ? (
          <Button
            title={t('verifyEmail.verifyCode')}
            testID="verify-submit"
            onPress={() => verifyCode(digits)}
            disabled={digits.length !== OTP_LENGTH || resending}
            loading={verifying}
            style={styles.verifyButton}
          />
        ) : verifying ? (
          <Txt variant="body" align="center" accessibilityLiveRegion="polite" style={styles.status}>
            {t('verifyEmail.verifyingYourLink')}
          </Txt>
        ) : null}

        {email && !verified ? (
          <Button
            title={t('verifyEmail.resendVerificationEmail')}
            variant="ghost"
            onPress={resend}
            disabled={verifying}
            loading={resending}
            style={styles.resendButton}
          />
        ) : null}
        {resendNote ? (
          <Txt variant="caption" align="center" accessibilityLiveRegion="polite" color={colors.inkSoft}>
            {resendNote}
          </Txt>
        ) : null}
      </Glass>

      {verified ? (
        <Button
          title={t('verifyEmail.continue')}
          variant="ghost"
          onPress={() => navigation.navigate('Login')}
          style={styles.backButton}
        />
      ) : (
        <Button
          title={t('verifyEmail.backToSignIn')}
          testID="verify-back-to-sign-in"
          variant="ghost"
          disabled={verifying}
          onPress={() => navigation.navigate('Login')}
          style={styles.backButton}
        />
      )}
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { justifyContent: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xl },
  panel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: withAlpha(colors.accent, 0.26),
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  badge: {
    alignSelf: 'center',
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  title: { marginBottom: spacing.sm },
  codeField: { position: 'relative', marginTop: spacing.xl },
  cells: { flexDirection: 'row', direction: 'ltr', gap: 6 },
  cell: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: withAlpha(colors.paper, 0.72),
  },
  filledCell: { borderColor: withAlpha(colors.accent, 0.55) },
  activeCell: { borderColor: colors.accent },
  cellGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.sm,
    backgroundColor: withAlpha(colors.accent, 0.12),
  },
  invalidCell: { borderColor: colors.danger },
  digit: { fontFamily: fonts.mono },
  input: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    fontSize: 16,
    color: 'transparent',
    backgroundColor: 'transparent',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  hint: { marginTop: spacing.md },
  status: { marginTop: spacing.md },
  verifyButton: { marginTop: spacing.lg },
  resendButton: { marginTop: spacing.sm },
  backButton: { marginTop: spacing.md, alignSelf: 'center' },
}));

export default VerifyEmailScreen;
