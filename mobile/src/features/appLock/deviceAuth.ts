// Web build: expo-local-authentication is never imported here, so the web
// bundle does not load the native module. The lock itself is disabled on web
// (see useAppLock), these stubs only keep the types identical.
import type { DeviceAuthInfo, DeviceAuthResult } from './policy';

export async function getDeviceAuthInfo(): Promise<DeviceAuthInfo> {
  return { level: 'none', biometricName: null };
}

export async function authenticateWithDevice(
  _promptMessage: string,
): Promise<DeviceAuthResult> {
  return { ok: false, reason: 'unavailable' };
}
