import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useAppLock } from './useAppLock';
import AppLockScreen from './AppLockScreen';

export interface AppLockGateProps {
  children: React.ReactNode;
}

const lockSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Wraps the signed-in app. After 5 minutes in the background the app content
 * is hidden (visually and from screen readers) behind the lock screen until
 * Face ID / Touch ID / fingerprint, the phone passcode or the GROW password
 * succeeds. Does nothing on web.
 */
export function AppLockGate({ children }: AppLockGateProps) {
  const { locked, unlock } = useAppLock(lockSupported);

  if (!lockSupported) return <>{children}</>;

  const lockScreen = locked ? <AppLockScreen onUnlock={unlock} /> : null;

  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {lockScreen && Platform.OS === 'ios' ? (
        // On iOS, native-stack modals (e.g. Quest detail) sit above the React
        // root; FullWindowOverlay draws above them too.
        <FullWindowOverlay>{lockScreen}</FullWindowOverlay>
      ) : (
        lockScreen
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default AppLockGate;
