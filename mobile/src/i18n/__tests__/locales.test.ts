import i18n from '../index';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import ar from '../locales/ar.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out[prefix + key] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (key: string) => key.replace(PLURAL, '');
const vars = (text: string) => new Set(text.match(/\{\{\w+/g) ?? []);

const EN = flatten(en as Tree);
const enBases = new Set(Object.keys(EN).map(base));

describe.each([
  ['fr', fr],
  ['ar', ar],
])('%s translations', (_lang, tree) => {
  const flat = flatten(tree as Tree);
  const bases = new Set(Object.keys(flat).map(base));

  it('covers every English key', () => {
    // Avatar preset names may fall back to English.
    const missing = [...enBases].filter((k) => !bases.has(k) && !k.startsWith('avatarText.'));
    expect(missing).toEqual([]);
  });

  it('has no keys English lacks', () => {
    expect([...bases].filter((k) => !enBases.has(k))).toEqual([]);
  });

  it('uses only variables the English string passes', () => {
    const bad = Object.entries(flat).filter(([key, text]) => {
      const english = EN[key] ?? EN[`${base(key)}_other`] ?? EN[base(key)];
      const allowed = vars(english);
      allowed.add('{{count');
      return [...vars(text)].some((v) => !allowed.has(v));
    });
    expect(bad).toEqual([]);
  });
});

describe('switching language', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('fills variables and plurals in each language', async () => {
    expect(i18n.t('common.days', { count: 1 })).toMatch(/1/);
    await i18n.changeLanguage('fr');
    expect(i18n.t('coach.youHaveLeft', { count: 2 })).toBe("Il te reste 2 messages aujourd'hui.");
    await i18n.changeLanguage('ar');
    expect(i18n.t('coach.youHaveLeft', { count: 2 })).toBe('تبقّت لك رسالتان اليوم.');
    expect(i18n.dir()).toBe('rtl');
  });
});
