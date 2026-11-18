// Typed translation keys: t('profile.title') is checked at compile time,
// and a missing or misspelled key is a type error.
import 'i18next';
import type en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
    returnNull: false;
  }
}
