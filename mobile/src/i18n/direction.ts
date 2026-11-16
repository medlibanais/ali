import { I18nManager, Platform } from 'react-native';
import { isRtlLanguage } from './languages';

/**
 * Applies the writing direction for a language.
 *
 * - Web: sets dir/lang on <html>, which flips the page at once.
 * - Android: I18nManager.forceRTL only takes effect after the app restarts.
 *   The root view also sets `direction` (see DirectionRoot), so the layout
 *   flips instantly; the restart then lines up the native parts (header
 *   back arrow, system dialogs).
 *
 * Returns true when a restart is still needed to finish the switch.
 */
export function applyDirection(language: string): boolean {
  const rtl = isRtlLanguage(language);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
    }
    return false;
  }
  I18nManager.allowRTL(true);
  I18nManager.swapLeftAndRightInRTL(true);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export function nativeDirectionMatches(language: string): boolean {
  if (Platform.OS === 'web') return true;
  return I18nManager.isRTL === isRtlLanguage(language);
}
