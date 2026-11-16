// Password rules + strength, shared by Register and ResetPassword screens.
import i18n from '../i18n';

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    get label() {
      return i18n.t('password.ruleLength');
    },
    test: (p) => p.length >= 8,
  },
  {
    id: 'upper',
    get label() {
      return i18n.t('password.ruleUpper');
    },
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'number',
    get label() {
      return i18n.t('password.ruleNumber');
    },
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: 'special',
    get label() {
      return i18n.t('password.ruleSpecial');
    },
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export function passwordRulesMet(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export type PasswordStrength = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return 'empty';
  const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  let score = met;
  if (password.length >= 12) score += 1;
  if (score <= 2) return 'weak';
  if (score === 3) return 'fair';
  if (score === 4) return 'good';
  return 'strong';
}

export const STRENGTH_LABEL: Readonly<Record<PasswordStrength, string>> = {
  empty: '',
  get weak() {
    return i18n.t('password.weak');
  },
  get fair() {
    return i18n.t('password.fair');
  },
  get good() {
    return i18n.t('password.good');
  },
  get strong() {
    return i18n.t('password.strong');
  },
};
