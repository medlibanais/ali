import { Alert, Platform } from 'react-native';
import { showAlert } from '../alert';

describe('showAlert', () => {
  const originalOS = Platform.OS;
  let confirmSpy: jest.Mock;
  let alertSpy: jest.Mock;

  beforeEach(() => {
    confirmSpy = jest.fn();
    alertSpy = jest.fn();
    Object.assign(globalThis, { window: { confirm: confirmSpy, alert: alertSpy } });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    jest.restoreAllMocks();
  });

  const setOS = (os: string) =>
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

  it('uses the native dialog on Android', () => {
    setOS('android');
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const buttons = [{ text: 'OK' }];
    showAlert('Title', 'Body', buttons);
    expect(native).toHaveBeenCalledWith('Title', 'Body', buttons);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('runs the action on web when the user confirms (sign out)', () => {
    setOS('web');
    confirmSpy.mockReturnValue(true);
    const signOut = jest.fn();
    const stay = jest.fn();
    showAlert('Sign out', 'You can sign back in anytime', [
      { text: 'Stay', style: 'cancel', onPress: stay },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
    expect(confirmSpy).toHaveBeenCalledWith('Sign out\n\nYou can sign back in anytime');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(stay).not.toHaveBeenCalled();
  });

  it('runs cancel on web when the user declines', () => {
    setOS('web');
    confirmSpy.mockReturnValue(false);
    const action = jest.fn();
    const cancel = jest.fn();
    showAlert('T', undefined, [
      { text: 'No', style: 'cancel', onPress: cancel },
      { text: 'Yes', onPress: action },
    ]);
    expect(action).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('offers each action in turn on web when there are several', () => {
    setOS('web');
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const unfriend = jest.fn();
    const block = jest.fn();
    showAlert('Sam', '@sam', [
      { text: 'Close', style: 'cancel' },
      { text: 'Unfriend', style: 'destructive', onPress: unfriend },
      { text: 'Block', style: 'destructive', onPress: block },
    ]);
    expect(unfriend).not.toHaveBeenCalled();
    expect(block).toHaveBeenCalledTimes(1);
  });

  it('shows a plain alert on web when there is no action', () => {
    setOS('web');
    showAlert('Heads up', 'Done');
    expect(alertSpy).toHaveBeenCalledWith('Heads up\n\nDone');
  });
});
