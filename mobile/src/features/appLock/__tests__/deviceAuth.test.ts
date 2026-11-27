import * as LocalAuthentication from 'expo-local-authentication';
import { authenticateWithDevice, getDeviceAuthInfo } from '../deviceAuth.native';

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  hasHardwareAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const mocked = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

function device(hasHardware: boolean, level: number, types: number[]) {
  mocked.hasHardwareAsync.mockResolvedValue(hasHardware);
  mocked.getEnrolledLevelAsync.mockResolvedValue(level);
  mocked.supportedAuthenticationTypesAsync.mockResolvedValue(types);
}

describe('getDeviceAuthInfo', () => {
  it('names Face ID on an iPhone with face enrolled', async () => {
    device(true, 3, [2]);
    await expect(getDeviceAuthInfo()).resolves.toEqual({
      level: 'biometric',
      biometricName: 'Face ID',
    });
  });

  it('falls back to passcode when no biometric is enrolled', async () => {
    device(true, 1, [2]);
    await expect(getDeviceAuthInfo()).resolves.toEqual({
      level: 'passcode',
      biometricName: null,
    });
  });

  it('reports none when the phone has no lock at all', async () => {
    device(false, 0, []);
    await expect(getDeviceAuthInfo()).resolves.toEqual({ level: 'none', biometricName: null });
  });
});

describe('authenticateWithDevice', () => {
  it('lets the OS offer the phone passcode as fallback', async () => {
    mocked.authenticateAsync.mockResolvedValue({ success: true });
    await expect(authenticateWithDevice('Unlock GROW')).resolves.toEqual({ ok: true });
    expect(mocked.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Unlock GROW', disableDeviceFallback: false }),
    );
  });

  it('reports a cancel without unlocking', async () => {
    mocked.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    await expect(authenticateWithDevice('Unlock GROW')).resolves.toEqual({
      ok: false,
      reason: 'cancelled',
    });
  });
});
