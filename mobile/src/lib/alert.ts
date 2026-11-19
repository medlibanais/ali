import { Alert, Platform } from 'react-native';
import type { AlertButton } from 'react-native';

/**
 * Drop-in replacement for `Alert.alert` that also works on web.
 *
 * react-native-web's `Alert.alert` is a no-op, so on the web build a
 * confirmation dialog never appears and its button callbacks never run
 * (this is why "Sign out" did nothing there). On web we fall back to the
 * browser's own `window.confirm` / `window.alert`; on Android we keep the
 * native dialog unchanged.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  showWebAlert(title, message, buttons);
}

function showWebAlert(
  title: string,
  message: string | undefined,
  buttons: AlertButton[] | undefined,
): void {
  if (typeof window === 'undefined') return;
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons ?? []).find((b) => b.style === 'cancel');

  if (actions.length === 0) {
    window.alert(text);
    cancel?.onPress?.();
    return;
  }

  if (actions.length === 1) {
    if (window.confirm(text)) actions[0].onPress?.();
    else cancel?.onPress?.();
    return;
  }

  // Several actions: offer each in turn and run the first one accepted.
  for (const action of actions) {
    if (window.confirm(`${text}\n\n${action.text ?? ''}?`)) {
      action.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}
