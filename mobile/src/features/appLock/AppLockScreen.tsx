import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import Field from '../../components/Field';
import Hairline from '../../components/Hairline';
import Txt from '../../components/Txt';
import { supabase } from '../../lib/supabase';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { colors, spacing } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { authenticateWithDevice, getDeviceAuthInfo } from './deviceAuth';
import { failureMessage, type DeviceAuthInfo } from './policy';

export interface AppLockScreenProps {
  onUnlock: () => void;
}

type Mode = 'checking' | 'device' | 'password';

export function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const email = useAppSelector((state) => state.auth.email);

  const [info, setInfo] = useState<DeviceAuthInfo | null>(null);
  const [mode, setMode] = useState<Mode>('checking');
  const [prompting, setPrompting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(false);
  const inFlight = useRef(false);

  const promptDevice = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPrompting(true);
    setMessage(null);
    const result = await authenticateWithDevice('Unlock GROW');
    inFlight.current = false;
    setPrompting(false);
    if (result.ok) {
      onUnlock();
      return;
    }
    setMessage(failureMessage(result.reason));
    if (result.reason === 'unavailable') setMode('password');
  }, [onUnlock]);

  // Ask right away so unlocking is one glance for most people.
  useEffect(() => {
    let cancelled = false;
    void getDeviceAuthInfo().then((found) => {
      if (cancelled) return;
      setInfo(found);
      if (found.level === 'none') {
        // No Face ID, fingerprint or passcode on this phone: the GROW
        // account password is the only way to prove it's the owner.
        setMode('password');
        return;
      }
      setMode('device');
      void promptDevice();
    });
    return () => {
      cancelled = true;
    };
  }, [promptDevice]);

  // Android back button must not reach the screens behind the lock.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const unlockWithPassword = async () => {
    if (!email) return;
    if (!password) {
      setPasswordError('Enter your password.');
      return;
    }
    setCheckingPassword(true);
    setPasswordError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCheckingPassword(false);
    if (error) {
      setPasswordError(
        error.message.toLowerCase().includes('invalid login credentials')
          ? 'Password incorrect.'
          : error.message,
      );
      return;
    }
    setPassword('');
    onUnlock();
  };

  const deviceLabel =
    info?.level === 'biometric' && info.biometricName
      ? `Unlock with ${info.biometricName}`
      : 'Unlock with passcode';
  const canUseDevice = info !== null && info.level !== 'none';

  return (
    <KeyboardAvoidingView
      style={[
        styles.root,
        { backgroundColor: colors.paper },
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      accessibilityViewIsModal
    >
      <View style={styles.header}>
        <Txt variant="display" accessibilityRole="header">
          GROW
        </Txt>
        <Hairline style={styles.rule} />
        <Txt variant="body" color={colors.inkSoft} align="center">
          {mode === 'password'
            ? 'Enter your GROW password to continue.'
            : 'Locked while you were away.'}
        </Txt>
        {message ? (
          <Txt
            variant="caption"
            color={colors.danger}
            align="center"
            style={styles.message}
            accessibilityLiveRegion="polite"
          >
            {message}
          </Txt>
        ) : null}
      </View>

      <View style={styles.actions}>
        {mode === 'password' ? (
          <>
            {email ? (
              <>
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
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={() => void unlockWithPassword()}
                  accessibilityLabel="GROW password"
                />
                <Button
                  title="Unlock"
                  onPress={() => void unlockWithPassword()}
                  loading={checkingPassword}
                />
              </>
            ) : null}
            {canUseDevice ? (
              <Button
                title={deviceLabel}
                variant="secondary"
                onPress={() => {
                  setMode('device');
                  void promptDevice();
                }}
                disabled={checkingPassword}
              />
            ) : null}
          </>
        ) : (
          <>
            <Button
              title={deviceLabel}
              onPress={() => void promptDevice()}
              loading={mode === 'checking' || prompting}
            />
            {email ? (
              <Button
                title="Use GROW password"
                variant="secondary"
                onPress={() => {
                  setMessage(null);
                  setMode('password');
                }}
                disabled={prompting}
              />
            ) : null}
          </>
        )}
        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => void dispatch(logout())}
          disabled={prompting || checkingPassword}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  header: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: {
    width: 48,
    marginVertical: spacing.md,
  },
  message: {
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
});

export default AppLockScreen;
