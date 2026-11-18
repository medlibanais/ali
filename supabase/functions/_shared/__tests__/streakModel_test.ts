// deno test supabase/functions/_shared/__tests__/streakModel_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { localDay, predictStreak, shiftDay, type StreakInputs } from '../streakModel.ts';

const TODAY = '2026-11-15'; // a Sunday; tomorrow is Monday

function input(activeBack: number[], opts: Partial<StreakInputs> = {}): StreakInputs {
  // activeBack: days ago that had a completion (0 = today, 1 = yesterday)
  return {
    today: TODAY,
    firstDay: shiftDay(TODAY, -60),
    activeDays: new Set(activeBack.map((n) => shiftDay(TODAY, -n))),
    overallByDay: new Map(activeBack.map((n) => [shiftDay(TODAY, -n), 70])),
    currentStreak: 0,
    ...opts,
  };
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

Deno.test('fewer than 7 full days of history is "not enough data"', () => {
  const p = predictStreak(input(range(0, 6), { firstDay: shiftDay(TODAY, -6) }));
  assertEquals(p.probability, null);
  assertEquals(p.detail.days, 6);
  assertEquals(p.forDay, '2026-11-16');
});

Deno.test('exactly 7 full days is enough', () => {
  const p = predictStreak(input(range(1, 7), { firstDay: shiftDay(TODAY, -7) }));
  assertEquals(p.detail.days, 7);
  assert(p.probability !== null);
});

Deno.test('a perfect month is on track but never 100', () => {
  const p = predictStreak(input(range(0, 30), { currentStreak: 31 }));
  assertEquals(p.probability, 97);
});

Deno.test('a silent month is high risk but never 0', () => {
  const p = predictStreak(input([]));
  assertEquals(p.probability, 3);
});

Deno.test('every other day lands in the middle', () => {
  const p = predictStreak(input(range(1, 30).filter((n) => n % 2 === 1)));
  assert(p.probability !== null && p.probability >= 30 && p.probability < 70, `${p.probability}`);
});

Deno.test('a recent lapse lowers the chance', () => {
  const steady = predictStreak(input(range(1, 30))).probability ?? 0;
  const lapsed = predictStreak(input(range(5, 30))).probability ?? 0;
  assert(lapsed < steady - 20, `${lapsed} vs ${steady}`);
});

Deno.test('same-weekday record moves the needle', () => {
  // Active every day except Mondays (tomorrow is a Monday).
  const noMondays = range(1, 30).filter((n) => new Date(`${shiftDay(TODAY, -n)}T00:00:00Z`).getUTCDay() !== 1);
  const all = predictStreak(input(range(1, 30))).probability ?? 0;
  const skipMon = predictStreak(input(noMondays));
  assertEquals(skipMon.detail.weekdayActive, 0);
  assert((skipMon.probability ?? 0) < all, `${skipMon.probability} vs ${all}`);
});

Deno.test('signup date limits the window', () => {
  const p = predictStreak(input(range(1, 10), { firstDay: shiftDay(TODAY, -10) }));
  assertEquals(p.detail.days, 10);
  assertEquals(p.detail.active30, 10);
});

Deno.test('localDay uses the user timezone and survives bad zones', () => {
  assertEquals(localDay('2026-11-15T23:30:00Z', 'Africa/Casablanca'), '2026-11-16');
  assertEquals(localDay('2026-11-15T23:30:00Z', 'America/New_York'), '2026-11-15');
  assertEquals(localDay('2026-11-15T23:30:00Z', 'Not/AZone'), '2026-11-15');
});
