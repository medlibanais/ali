// Password rules + strength, shared by Register and ResetPassword screens.

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /[0-9]/.test(p) },
  {
    id: 'special',
    label: 'One special character',
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

export const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  empty: '',
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
};
