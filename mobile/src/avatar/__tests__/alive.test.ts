import {
  BLINK_CLOSE_MS,
  BLINK_OPEN_MS,
  BREATH_CALM_MS,
  BREATH_STRESSED_MS,
  blinkEyesAt,
  blinkGapMs,
  breathAt,
  breathDepth,
  breathPeriodMs,
} from '../alive';

describe('avatar breathing pace', () => {
  it('breathes faster when the life score is low and slower when high', () => {
    expect(breathPeriodMs(0)).toBe(BREATH_STRESSED_MS);
    expect(breathPeriodMs(100)).toBe(BREATH_CALM_MS);
    expect(breathPeriodMs(20)).toBeLessThan(breathPeriodMs(80));
  });

  it('clamps out-of-range and missing scores', () => {
    expect(breathPeriodMs(-40)).toBe(BREATH_STRESSED_MS);
    expect(breathPeriodMs(250)).toBe(BREATH_CALM_MS);
    expect(breathPeriodMs(Number.NaN)).toBe(breathPeriodMs(50));
  });

  it('breathes shallower when stressed', () => {
    expect(breathDepth(0)).toBeLessThan(breathDepth(100));
    expect(breathDepth(100)).toBe(1);
  });

  it('follows a smooth in-and-out curve', () => {
    expect(breathAt(0)).toBeCloseTo(0);
    expect(breathAt(0.5)).toBeCloseTo(1);
    expect(breathAt(1)).toBeCloseTo(0);
  });
});

describe('avatar blinking', () => {
  it('blinks more often when stressed', () => {
    expect(blinkGapMs(0, 0.5)).toBeLessThan(blinkGapMs(100, 0.5));
  });

  it('closes then reopens the eyes', () => {
    expect(blinkEyesAt(0, false)).toBe(1);
    expect(blinkEyesAt(BLINK_CLOSE_MS - 1, false)).toBeLessThan(0.1);
    expect(blinkEyesAt(BLINK_CLOSE_MS + BLINK_OPEN_MS, false)).toBe(1);
  });

  it('a double blink shuts the eyes twice', () => {
    const one = BLINK_CLOSE_MS + BLINK_OPEN_MS;
    expect(blinkEyesAt(one + BLINK_CLOSE_MS - 1, true)).toBeLessThan(0.1);
    expect(blinkEyesAt(one + BLINK_CLOSE_MS - 1, false)).toBe(1);
  });
});
