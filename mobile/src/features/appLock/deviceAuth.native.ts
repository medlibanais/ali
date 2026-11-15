// iOS and Android: Face ID / Touch ID / fingerprint, with the phone's own
// passcode (PIN, pattern, password) as the system fallback.
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  failureFromErrorCode,
  type DeviceAuthInfo,
  type DeviceAuthResult,
} from './policy';

function nameFor(types: LocalAuthentication.AuthenticationType[]): string {
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  if (Platform.OS === 'ios') return face ? 'Face ID' : 'Touch ID';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint';
  }
  return face ? 'face unlock' : 'biometrics';
}

export async function getDeviceAuthInfo(): Promise<DeviceAuthInfo> {
  try {
    const [hasHardware, level, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (hasHardware && level >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK) {
      return { level: 'biometric', biometricName: nameFor(types) };
    }
    if (level >= LocalAuthentication.SecurityLevel.SECRET) {
      return { level: 'passcode', biometricName: null };
    }
    return { level: 'none', biometricName: null };
  } catch {
    return { level: 'none', biometricName: null };
  }
}

export async function authenticateWithDevice(
  promptMessage: string,
): Promise<DeviceAuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use passcode',
      // Let the OS offer the phone passcode when biometrics fail.
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true };
    return { ok: false, reason: failureFromErrorCode(result.error) };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
