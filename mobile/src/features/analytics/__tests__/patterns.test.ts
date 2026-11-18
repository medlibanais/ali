import { niceMax, roundedShares, timeOfDayBins, type BehavioralPatterns } from '../patterns';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

const base: BehavioralPatterns = {
  user_id: 'u1',
  timezone: 'Africa/Casablanca',
  window_start: '2026-09-22',
  window_end: '2026-11-16',
  skip_weekday: 2,
  skip_weekday_name: 'Tuesday',
  skip_rate: 28,
  skip_missed: 11,
  skip_total: 40,
  skip_top_pillar: 'family',
  morning_count: 29,
  afternoon_count: 56,
  evening_count: 138,
  peak_time_of_day: 'evening',
  neglected_pillar: 'spirituality',
  neglected_rate: 15,
  neglected_done: 2,
  neglected_total: 13,
  neglected_days_since: 1,
};

describe('time-of-day bins', () => {
  it('maps the view row to three bins with shares that sum to 100', () => {
    const bins = timeOfDayBins(base);
    expect(bins.map((b) => b.key)).toEqual(['morning', 'afternoon', 'evening']);
    expect(bins.map((b) => b.count)).toEqual([29, 56, 138]);
    expect(bins.reduce((s, b) => s + b.share, 0)).toBe(100);
    expect(bins.filter((b) => b.isPeak).map((b) => b.key)).toEqual(['evening']);
    // 138 over 56 days.
    expect(bins[2].perDay).toBe(2.5);
  });

  it('has no peak and zero shares without data', () => {
    const bins = timeOfDayBins({
      ...base,
      morning_count: 0,
      afternoon_count: 0,
      evening_count: 0,
      peak_time_of_day: null,
    });
    expect(bins.every((b) => b.share === 0 && !b.isPeak)).toBe(true);
  });

  it('rounds shares by largest remainder', () => {
    expect(roundedShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(roundedShares([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('picks a readable axis top', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(138)).toBe(200);
    expect(niceMax(23)).toBe(25);
  });
});
