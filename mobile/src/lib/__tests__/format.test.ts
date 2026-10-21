import { bestStreakLabel, pluralize, streakLabel } from '../format';
import { passwordRulesMet, passwordStrength } from '../password';

describe('pluralize', () => {
  it('singular for exactly 1', () => {
    expect(pluralize(1, 'day')).toBe('1 day');
  });
  it('plural for 0 and 2+', () => {
    expect(pluralize(0, 'day')).toBe('0 days');
    expect(pluralize(2, 'day')).toBe('2 days');
    expect(pluralize(23, 'day')).toBe('23 days');
  });
});

describe('streak labels', () => {
  it('never renders "1 days"', () => {
    expect(streakLabel(1)).toBe('1 day');
    expect(bestStreakLabel(23)).toBe('best 23 days');
  });
});

describe('password rules', () => {
  it('accepts a compliant password', () => {
    expect(passwordRulesMet('SecurePass123!')).toBe(true);
  });
  it('rejects short / missing-class passwords', () => {
    expect(passwordRulesMet('Short1!')).toBe(false);
    expect(passwordRulesMet('nouppercase1!')).toBe(false);
    expect(passwordRulesMet('NoNumber!abc')).toBe(false);
    expect(passwordRulesMet('NoSpecial123')).toBe(false);
  });
  it('strength buckets are sane', () => {
    expect(passwordStrength('')).toBe('empty');
    expect(passwordStrength('abc')).toBe('weak');
    // 8 chars, all 4 rule classes -> good; 12+ chars adds a bonus -> strong
    expect(passwordStrength('Secur1!a')).toBe('good');
    expect(passwordStrength('SecurePass123!')).toBe('strong');
  });
});
