jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import * as Haptics from 'expo-haptics';
import { playHaptic, setHapticIntensity, tuneImpact } from '../haptics';

const impact = Haptics.impactAsync as jest.Mock;
const selection = Haptics.selectionAsync as jest.Mock;
const notify = Haptics.notificationAsync as jest.Mock;

// Each test starts a second later, clear of the repeat-guard window.
let clock = Date.parse('2026-11-16T10:00:00Z');

describe('haptics', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clock += 1000;
    jest.setSystemTime(clock);
    impact.mockClear();
    selection.mockClear();
    notify.mockClear();
    setHapticIntensity('normal');
  });
  afterEach(() => jest.useRealTimers());

  it('plays a medium impact for a pillar tap', () => {
    playHaptic('pillar');
    expect(impact).toHaveBeenCalledWith('medium');
  });

  it('plays a selection tick when switching tabs', () => {
    playHaptic('tab');
    expect(selection).toHaveBeenCalledTimes(1);
  });

  it('plays quest completion as a thump then a success buzz', () => {
    playHaptic('questComplete');
    expect(impact).toHaveBeenCalledWith('medium');
    expect(notify).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(notify).toHaveBeenCalledWith('success');
  });

  it('shifts impacts with the intensity setting', () => {
    expect(tuneImpact('medium', 'soft')).toBe('light');
    expect(tuneImpact('medium', 'strong')).toBe('heavy');
    expect(tuneImpact('heavy', 'strong')).toBe('heavy');
    expect(tuneImpact('light', 'soft')).toBe('light');
    setHapticIntensity('strong');
    playHaptic('pillar');
    expect(impact).toHaveBeenCalledWith('heavy');
  });

  it('is silent when turned off', () => {
    setHapticIntensity('off');
    playHaptic('levelUp');
    jest.advanceTimersByTime(1000);
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('drops a repeat of the same event within 40 ms', () => {
    playHaptic('tap');
    playHaptic('tap');
    expect(impact).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 50);
    playHaptic('tap');
    expect(impact).toHaveBeenCalledTimes(2);
  });
});
