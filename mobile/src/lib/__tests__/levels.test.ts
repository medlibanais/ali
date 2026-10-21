import {
  cumulativeXpForLevel,
  DAILY_XP_CAP,
  levelForXp,
  levelProgress,
  MAX_LEVEL,
  titleForLevel,
  xpForLevel,
  xpToNextLevel,
} from '../levels';

describe('xpForLevel', () => {
  it('matches the spec formula 500*N', () => {
    expect(xpForLevel(2)).toBe(1000);
    expect(xpForLevel(3)).toBe(1500);
    expect(xpForLevel(13)).toBe(6500);
  });
});

describe('cumulativeXpForLevel', () => {
  it('level 1 is free', () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
  });
  it('level 2 costs 1000', () => {
    expect(cumulativeXpForLevel(2)).toBe(1000);
  });
  it('level 12 requires 38500', () => {
    expect(cumulativeXpForLevel(12)).toBe(38500);
  });
  it('level 100 requires 2,524,500 (flag: unreachable at 500 XP/day)', () => {
    expect(cumulativeXpForLevel(100)).toBe(2524500);
  });
});

describe('levelForXp', () => {
  it('new users start at level 1', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(NaN)).toBe(1);
  });
  it('exact threshold lands on the level', () => {
    expect(levelForXp(38500)).toBe(12);
  });
  it('one XP below the threshold stays on the previous level', () => {
    expect(levelForXp(38499)).toBe(11);
  });
  it('caps at MAX_LEVEL', () => {
    expect(levelForXp(999_999_999)).toBe(MAX_LEVEL);
  });
  it('is the exact inverse of cumulativeXpForLevel across 1..100', () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      expect(levelForXp(cumulativeXpForLevel(level))).toBe(level);
    }
  });
});

describe('xpToNextLevel', () => {
  it('is the remaining distance to the next threshold', () => {
    expect(xpToNextLevel(38500)).toBe(xpForLevel(13));
    expect(xpToNextLevel(38900)).toBe(6500 - 400);
  });
  it('is 0 at max level', () => {
    expect(xpToNextLevel(cumulativeXpForLevel(MAX_LEVEL))).toBe(0);
  });
});

describe('levelProgress', () => {
  it('is 0 at a level threshold', () => {
    expect(levelProgress(cumulativeXpForLevel(5))).toBe(0);
  });
  it('is 0.5 halfway through a level', () => {
    const level = 5;
    const mid = cumulativeXpForLevel(level) + xpForLevel(level + 1) / 2;
    expect(levelProgress(mid)).toBeCloseTo(0.5, 5);
  });
  it('is 1 at max level', () => {
    expect(levelProgress(cumulativeXpForLevel(MAX_LEVEL))).toBe(1);
  });
});

describe('titleForLevel', () => {
  it('follows the SRS ranges', () => {
    expect(titleForLevel(1)).toBe('Novice');
    expect(titleForLevel(10)).toBe('Novice');
    expect(titleForLevel(11)).toBe('Disciplined Human');
    expect(titleForLevel(25)).toBe('Disciplined Human');
    expect(titleForLevel(26)).toBe('Iron Mind');
    expect(titleForLevel(50)).toBe('Iron Mind');
    expect(titleForLevel(51)).toBe('Guardian of Family');
    expect(titleForLevel(75)).toBe('Guardian of Family');
    expect(titleForLevel(76)).toBe('Legendary');
    expect(titleForLevel(100)).toBe('Legendary');
  });
});

describe('constants sanity', () => {
  it('daily cap documented for the report', () => {
    expect(DAILY_XP_CAP).toBe(500);
    // Days to max level playing perfectly: 2,524,500 / 500 = 5,049 days (~13.8y).
    expect(Math.ceil(cumulativeXpForLevel(MAX_LEVEL) / DAILY_XP_CAP)).toBe(5049);
  });
});
