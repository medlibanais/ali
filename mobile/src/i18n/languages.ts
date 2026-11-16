import { Platform } from 'react-native';

export const LANGUAGES = ['en', 'fr', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface LanguageOption {
  code: Language;
  /** Name written in the language itself, so anyone can find their own. */
  nativeName: string;
  rtl: boolean;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'en', nativeName: 'English', rtl: false },
  { code: 'fr', nativeName: 'Français', rtl: false },
  { code: 'ar', nativeName: 'العربية', rtl: true },
];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function isRtlLanguage(language: string): boolean {
  return language === 'ar';
}

/**
 * Best guess from the device, without a native module (so no new dev build):
 * Hermes and browsers both expose the locale through Intl.
 */
export function detectDeviceLanguage(): Language {
  let locale = '';
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      locale = navigator.language ?? '';
    }
    if (!locale) {
      locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    }
  } catch {
    locale = '';
  }
  const base = locale.toLowerCase().split(/[-_]/)[0];
  return isLanguage(base) ? base : 'en';
}

/** BCP 47 tag for Intl / toLocale* formatting of dates and numbers. */
export function localeTag(language: string): string {
  switch (language) {
    case 'fr':
      return 'fr-FR';
    case 'ar':
      // Arabic UI with Western digits, which is what Maghreb users read.
      return 'ar-MA-u-nu-latn';
    default:
      return 'en-US';
  }
}
