import { heroOffset, launchHero, registerHeroSource, resetHeroes, takeHero } from '../hero';

const rect = { x: 100, y: 200, width: 172, height: 172 };

describe('hero hand-off', () => {
  beforeEach(() => {
    resetHeroes();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('returns nothing when no hero was launched', () => {
    expect(takeHero('avatar')).toBeNull();
  });

  it('hands the measured source rect to the target once', async () => {
    registerHeroSource('avatar', () => Promise.resolve(rect));
    launchHero('avatar');
    await expect(takeHero('avatar')).resolves.toEqual(rect);
    expect(takeHero('avatar')).toBeNull();
  });

  it('ignores a stale launch', () => {
    registerHeroSource('avatar', () => Promise.resolve(rect));
    launchHero('avatar');
    jest.setSystemTime(Date.now() + 2000);
    expect(takeHero('avatar')).toBeNull();
  });

  it('does nothing without a registered source', () => {
    launchHero('avatar');
    expect(takeHero('avatar')).toBeNull();
  });

  it('unregisters on cleanup', () => {
    const off = registerHeroSource('avatar', () => Promise.resolve(rect));
    off();
    launchHero('avatar');
    expect(takeHero('avatar')).toBeNull();
  });

  it('computes the offset between centers and the size ratio', () => {
    const to = { x: 20, y: 120, width: 108, height: 108 };
    expect(heroOffset(rect, to)).toEqual({
      dx: 100 + 86 - (20 + 54),
      dy: 200 + 86 - (120 + 54),
      scale: 172 / 108,
    });
  });
});
