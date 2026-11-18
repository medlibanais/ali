// Streak prediction: the chance (0-100) that a user completes at least one
// quest tomorrow, in their own timezone.
//
// Why a fixed-weight logistic score and not a trained model: one user has
// at most 30 daily outcomes here, and a per-user regression fitted on 30
// rows (often fewer, often all 1s) overfits badly. Pooling every user to
// train shared weights would need a training job and a label history we
// do not keep yet. So the weights below are hand-set, the inputs are the
// signals that predict habit lapses best (recent rate, long-run rate, the
// same weekday, streak length, recency), and the output goes through a
// sigmoid so it behaves like a logistic regression. When enough history
// exists, refit these weights offline and replace WEIGHTS; nothing else
// changes.
//
// Pure functions only (no Deno or Supabase imports) so it is unit tested.

export const MIN_DATA_DAYS = 7;
export const WINDOW_DAYS = 30;
const DAY_MS = 86400000;

/** Logistic weights. z = sum(w * x); p = sigmoid(z). */
export const WEIGHTS = {
  bias: -2.2,
  rate7: 2.2, // share of the last 7 days with a completion
  rate30: 1.4, // smoothed share over the whole window
  weekday: 1.2, // smoothed share on the same weekday as tomorrow
  streak: 0.8, // current streak, scaled to 0..1 (30 days = 1)
  activeToday: 0.6, // already completed something today
  score7: 0.6, // average overall daily score of the last 7 days, 0..1
  gap: -0.35, // per day since last active (from yesterday), up to 4
} as const;

/** Never claim certainty from a hand-set model. */
const FLOOR = 3;
const CEIL = 97;

export interface StreakInputs {
  /** Today in the user's timezone, yyyy-mm-dd. */
  today: string;
  /** First local day we know the user existed (signup or first data). */
  firstDay: string | null;
  /** Local days with at least one completion that was not undone. */
  activeDays: ReadonlySet<string>;
  /** Overall daily score (0-100) by local day; missing days count as 0. */
  overallByDay: ReadonlyMap<string, number>;
  currentStreak: number;
}

export interface StreakDetail {
  /** Full days of history used (yesterday back, at most 30). */
  days: number;
  /** Active days in the last 7 full days (or fewer when history is short). */
  active7: number;
  window7: number;
  active30: number;
  /** Same weekday as tomorrow: active count / occurrences in the window. */
  weekdayActive: number;
  weekdayTotal: number;
  /** 0 = Sunday ... 6 = Saturday, for tomorrow. */
  weekday: number;
  activeToday: boolean;
}

export interface StreakPrediction {
  /** 0-100, or null when there are fewer than MIN_DATA_DAYS days. */
  probability: number | null;
  /** The local day the prediction is about (tomorrow). */
  forDay: string;
  detail: StreakDetail;
}

export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Local calendar day (yyyy-mm-dd) of an instant in an IANA timezone. */
export function localDay(instant: string | Date, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function predictStreak(input: StreakInputs): StreakPrediction {
  const { today, activeDays, overallByDay } = input;
  const yesterday = shiftDay(today, -1);
  const forDay = shiftDay(today, 1);
  const windowStart = shiftDay(today, -WINDOW_DAYS);
  const start =
    input.firstDay && input.firstDay > windowStart ? input.firstDay : windowStart;
  // Only full days count as history: today is still in progress.
  const days = Math.max(0, daysBetween(start, yesterday) + 1);

  const history: string[] = [];
  for (let i = 0; i < days; i++) history.push(shiftDay(yesterday, -i)); // newest first

  const window7 = Math.min(7, days);
  const last7 = history.slice(0, window7);
  const active7 = last7.filter((d) => activeDays.has(d)).length;
  const active30 = history.filter((d) => activeDays.has(d)).length;
  const weekday = weekdayOf(forDay);
  const sameWeekday = history.filter((d) => weekdayOf(d) === weekday);
  const weekdayActive = sameWeekday.filter((d) => activeDays.has(d)).length;
  const activeToday = activeDays.has(today);

  const detail: StreakDetail = {
    days,
    active7,
    window7,
    active30,
    weekdayActive,
    weekdayTotal: sameWeekday.length,
    weekday,
    activeToday,
  };

  if (days < MIN_DATA_DAYS) return { probability: null, forDay, detail };

  // Laplace smoothing keeps a short or perfect history from reading as 0 or 1.
  const rate30 = (active30 + 1) / (days + 2);
  const rate7 = window7 > 0 ? active7 / window7 : 0;
  // Few same-weekday samples (4 at most): shrink toward the overall rate.
  const weekdayRate = (weekdayActive + 2 * rate30) / (sameWeekday.length + 2);
  const streak = Math.min(Math.max(input.currentStreak, 0), 30) / 30;
  const score7 =
    last7.reduce((s, d) => s + Math.min(Math.max(overallByDay.get(d) ?? 0, 0), 100), 0) /
    (100 * Math.max(window7, 1));
  const lastActiveIdx = history.findIndex((d) => activeDays.has(d));
  const gap = lastActiveIdx === -1 ? 4 : Math.min(lastActiveIdx, 4);

  const z =
    WEIGHTS.bias +
    WEIGHTS.rate7 * rate7 +
    WEIGHTS.rate30 * rate30 +
    WEIGHTS.weekday * weekdayRate +
    WEIGHTS.streak * streak +
    WEIGHTS.activeToday * (activeToday ? 1 : 0) +
    WEIGHTS.score7 * score7 +
    WEIGHTS.gap * gap;

  const probability = Math.min(CEIL, Math.max(FLOOR, Math.round(sigmoid(z) * 100)));
  return { probability, forDay, detail };
}

/** Below this, the user gets one streak rescue push (once per local day). */
export const RESCUE_THRESHOLD = 30;
