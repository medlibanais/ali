// Motion: the shared rules for how GROW moves. Pure numbers and functions,
// no animation library, so both Animated and Reanimated code can use them
// and jest can test them. Functions marked 'worklet' also run on the UI
// thread inside Reanimated styles.
//
// The principles behind the numbers:
// - Timing: everyday UI motion stays under 300 ms (DURATION.max).
// - Frequency of use: the more often something happens (quest checks, tab
//   switches), the smaller and faster its motion. Rich motion is saved for
//   rare peaks (level-up, Perfect Day).
// - Slow in, slow out: EASE_STANDARD starts and ends gently.
// - Follow-through: SPRING.settle overshoots a hair and settles a beat late.
// - Staggering: staggerDelay() brings lists in one row after another.
// - Rubber banding: rubberBand() resists a drag past an edge.
// - Arcs: arcPoint() bends a straight flight into a curve.
// - Origin awareness: originVector() points from where the tap happened.

/** Durations in ms. Everyday UI motion stays at or under `max`. */
export const DURATION = {
  /** Feedback on the most frequent actions (checks, tabs). */
  instant: 90,
  fast: 160,
  base: 240,
  max: 300,
} as const;

/** Slow in, slow out: cubic-bezier control points (Material "standard"). */
export const EASE_STANDARD = [0.4, 0, 0.2, 1] as const;

/** Spring configs (Reanimated style; mass/stiffness/damping). */
export const SPRING = {
  /** Press feedback: fast, no wobble, interruptible at any point. */
  press: { mass: 0.6, stiffness: 420, damping: 30 },
  /** Follow-through: settles with a small overshoot. */
  settle: { mass: 0.8, stiffness: 260, damping: 14 },
  /** Squash and stretch pop on impact. */
  pop: { mass: 0.6, stiffness: 340, damping: 11 },
} as const;

/**
 * Delay for the item at `index` in a staggered entrance. Capped, so a long
 * list never makes the last visible row wait long (Doherty threshold: the
 * whole entrance starts within ~400 ms).
 */
export function staggerDelay(index: number, step = 35, maxItems = 6, base = 0): number {
  const i = Math.max(0, Math.min(Math.floor(index), maxItems));
  return base + i * step;
}

/**
 * Rubber banding: how far something moves when dragged `offset` px past
 * its edge. Free at first, then harder and harder, never beyond `limit`.
 * Keeps the sign of `offset`.
 */
export function rubberBand(offset: number, limit: number, coefficient = 0.55): number {
  'worklet';
  if (!Number.isFinite(offset) || limit <= 0 || offset === 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const d = Math.abs(offset);
  const moved = (1 - 1 / ((d * coefficient) / limit + 1)) * limit;
  return sign * moved;
}

/**
 * Squash and stretch: the scale along the motion for a stretch of `amount`
 * px out of `limit`, and the matching squash across it, so the area looks
 * conserved. Returns [along, across].
 */
export function stretchScale(amount: number, limit: number, maxStretch = 0.18): [number, number] {
  'worklet';
  if (limit <= 0) return [1, 1];
  const t = Math.min(1, Math.abs(amount) / limit);
  const along = 1 + maxStretch * t;
  return [along, 1 / Math.sqrt(along)];
}

/**
 * Arcs: the offset at progress `p` (1 = start, 0 = landed) of a flight
 * that would otherwise travel the straight line from (dx, dy) to (0, 0).
 * The path bows sideways by up to `bend` of the distance (capped at
 * `maxLift` px), bulging upward for mostly sideways moves, so nothing
 * slides like a robot.
 */
export function arcPoint(
  dx: number,
  dy: number,
  p: number,
  bend = 0.18,
  maxLift = 90,
): { x: number; y: number } {
  'worklet';
  const dist = Math.hypot(dx, dy);
  const x = dx * p;
  const y = dy * p;
  if (dist < 1) return { x, y };
  // Unit normal to the flight; pick the one pointing up the screen.
  let nx = -dy / dist;
  let ny = dx / dist;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const lift = Math.min(maxLift, dist * bend) * Math.sin(Math.PI * Math.max(0, Math.min(1, p)));
  return { x: x + nx * lift, y: y + ny * lift };
}

/**
 * Origin awareness: a vector of length `distance` pointing from the center
 * toward an angle in degrees (0 = right, 90 = down). Content that belongs
 * to something at that angle enters from that side.
 */
export function originVector(angleDeg: number, distance: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  const round = (v: number) => Math.round(v * 100) / 100 || 0;
  return { x: round(Math.cos(a) * distance), y: round(Math.sin(a) * distance) };
}
