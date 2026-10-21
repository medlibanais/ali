import { CATEGORIES, EDITOR_GROUPS, VALID_OPTION_IDS } from '../options';
import { DEFAULT_AVATAR, sanitizeAvatarConfig } from '../types';

describe('avatar editor groups', () => {
  it('put every category in exactly one tab', () => {
    const grouped = EDITOR_GROUPS.flatMap((g) => g.categories);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(CATEGORIES.map((c) => c.key).sort());
  });

  it('cover every config field', () => {
    expect(CATEGORIES.map((c) => c.key).sort()).toEqual(Object.keys(DEFAULT_AVATAR).sort());
  });
});

describe('sanitizeAvatarConfig', () => {
  it('fills the new bottoms field for configs saved before it existed', () => {
    const old = { ...DEFAULT_AVATAR } as Record<string, unknown>;
    delete old.bottoms;
    expect(sanitizeAvatarConfig(old, VALID_OPTION_IDS).bottoms).toBe('pants');
  });

  it('keeps a valid bottoms choice', () => {
    expect(sanitizeAvatarConfig({ bottoms: 'shorts' }, VALID_OPTION_IDS).bottoms).toBe('shorts');
  });
});
