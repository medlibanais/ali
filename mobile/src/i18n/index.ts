// i18n setup: i18next + react-i18next with three bundled languages.
// Every language ships inside the bundle, so switching is instant and
// works offline. English is the source of truth and the fallback.
import 'intl-pluralrules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import { detectDeviceLanguage } from './languages';

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  ar: { translation: ar },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'fr', 'ar'],
  interpolation: {
    // React already escapes rendered strings.
    escapeValue: false,
  },
  returnNull: false,
  react: {
    // Re-render every useTranslation() consumer on language change.
    bindI18n: 'languageChanged',
  },
});

export default i18n;
