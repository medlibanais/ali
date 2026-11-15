jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first
import { addDays, buildYearGrid, todayInTimezone, xpIntensity, xpScaleMax } from '../yearHeatmap';

describe('buildYearGrid', () => {
  it('lays out exactly 365 days ending today in Sunday-first weeks', () => {
    const g = buildYearGrid([], '2026-11-15');
    expect(g.cells).toHaveLength(365);
    expect(g.cells[0].date).toBe('2025-11-16');
    expect(g.cells[364].date).toBe('2026-11-15');
    // 2025-11-16 is a Sunday, 2026-11-15 is a Sunday.
    expect(g.cells[0]).toMatchObject({ col: 0, row: 0 });
    expect(g.cells[364]).toMatchObject({ col: 52, row: 0 });
    expect(g.weeks).toBe(53);
    // Every (col,row) slot is used once.
    expect(new Set(g.cells.map((c) => `${c.col}:${c.row}`)).size).toBe(365);
  });

  it('sums XP, counts active days and finds the best day', () => {
    const g = buildYearGrid(
      [
        { date: '2026-11-14', xp: 120 },
        { date: '2026-03-01', xp: 40 },
        { date: '2020-01-01', xp: 999 }, // outside the window
      ],
      '2026-11-15',
    );
    expect(g.totalXp).toBe(160);
    expect(g.activeDays).toBe(2);
    expect(g.best).toEqual({ date: '2026-11-14', xp: 120 });
    expect(g.cells.find((c) => c.date === '2026-03-01')?.xp).toBe(40);
  });

  it('crosses DST and leap days without skipping or doubling a date', () => {
    const g = buildYearGrid([], '2028-03-31', 365);
    for (let i = 1; i < g.cells.length; i += 1) {
      expect(g.cells[i].date).toBe(addDays(g.cells[i - 1].date, 1));
    }
    expect(g.cells.some((c) => c.date === '2028-02-29')).toBe(true);
  });

  it('labels each month once, in order', () => {
    const g = buildYearGrid([], '2026-11-15');
    const labels = g.months.map((m) => m.label);
    expect(labels[labels.length - 1]).toBe('Nov');
    expect(new Set(labels.slice(1, -1)).size).toBe(labels.length - 2);
    for (let i = 1; i < g.months.length; i += 1) {
      expect(g.months[i].col - g.months[i - 1].col).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('color scale', () => {
  it('keeps zero empty and grows continuously with XP', () => {
    expect(xpIntensity(0, 100)).toBe(0);
    const a = xpIntensity(10, 100);
    const b = xpIntensity(11, 100);
    const c = xpIntensity(100, 100);
    expect(a).toBeGreaterThan(0.15);
    expect(b).toBeGreaterThan(a);
    expect(c).toBe(1);
    expect(xpIntensity(500, 100)).toBe(1);
  });

  it('caps the scale at the 90th percentile so one huge day does not wash out the rest', () => {
    const many = [...Array.from({ length: 50 }, () => 50), 1000];
    expect(xpScaleMax(many)).toBe(50);
    expect(xpScaleMax([0, 0])).toBe(1);
  });
});

describe('todayInTimezone', () => {
  const now = new Date('2026-11-15T02:30:00Z');
  it('uses the profile timezone for the day boundary', () => {
    expect(todayInTimezone('UTC', now)).toBe('2026-11-15');
    expect(todayInTimezone('America/Los_Angeles', now)).toBe('2026-11-14');
    expect(todayInTimezone('Asia/Tokyo', now)).toBe('2026-11-15');
  });
  it('falls back to a date for unknown timezones', () => {
    expect(todayInTimezone('Not/AZone', now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInTimezone(null, now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
