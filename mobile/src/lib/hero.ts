// Hero transitions between screens that can't share a native element.
//
// React Navigation's bottom tabs have no shared-element support, and the
// avatar is a rendered image that each screen draws itself. So a "hero"
// here is a hand-off of a position: the source screen (Today) registers
// how to measure its avatar; just before switching to Profile we launch
// the hero, which measures that avatar while it is still on screen. When
// Profile gains focus, its HeroTarget takes the measured rectangle, jumps
// its own avatar there, and springs it home. To the eye the avatar flies
// and shrinks from the middle of Today into the Profile header.

import type { View } from 'react-native';

export interface HeroRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Measurer = () => Promise<HeroRect | null>;

/** A launched hero older than this is stale and ignored. */
const MAX_AGE_MS = 900;
/**
 * Give up on a measurement after this long. Generous on purpose: the
 * measure answer can queue behind the target screen's first render.
 */
const MEASURE_TIMEOUT_MS = 1200;
/** Longest a navigation waits for the source to be measured. */
const LAUNCH_WAIT_MS = 120;

const sources = new Map<string, Measurer>();
let pending: { key: string; at: number; rect: Promise<HeroRect | null> } | null = null;

/** Measure a mounted view in window coordinates; null if not laid out. */
export function measureView(view: View | null): Promise<HeroRect | null> {
  if (!view) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    try {
      view.measureInWindow((x, y, width, height) => {
        clearTimeout(timer);
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Register where a hero starts from. Returns the unregister function. */
export function registerHeroSource(key: string, measurer: Measurer): () => void {
  sources.set(key, measurer);
  return () => {
    if (sources.get(key) === measurer) sources.delete(key);
  };
}

/**
 * Measure the source, then resolve so the caller can navigate. Navigate
 * only after this resolves: once the source screen is hidden it measures
 * as an empty box. Resolves within LAUNCH_WAIT_MS even if measuring stalls,
 * so a tap never feels late.
 */
export function launchHero(key: string): Promise<void> {
  const measurer = sources.get(key);
  if (!measurer) return Promise.resolve();
  const rect = measurer();
  pending = { key, at: Date.now(), rect };
  return Promise.race([
    rect.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, LAUNCH_WAIT_MS)),
  ]);
}

/**
 * The target screen calls this on focus. Returns null at once when no
 * fresh hero is waiting for this key (normal navigation, no flight).
 */
export function takeHero(key: string): Promise<HeroRect | null> | null {
  if (!pending || pending.key !== key) return null;
  const fresh = Date.now() - pending.at <= MAX_AGE_MS;
  const rect = pending.rect;
  pending = null;
  return fresh ? rect : null;
}

/** True when a fresh hero is waiting for this key (does not consume it). */
export function heroPending(key: string): boolean {
  return pending !== null && pending.key === key && Date.now() - pending.at <= MAX_AGE_MS;
}

/** Translate and scale that move `to` onto `from`, centers aligned. */
export function heroOffset(from: HeroRect, to: HeroRect): {
  dx: number;
  dy: number;
  scale: number;
} {
  return {
    dx: from.x + from.width / 2 - (to.x + to.width / 2),
    dy: from.y + from.height / 2 - (to.y + to.height / 2),
    scale: to.width > 0 ? from.width / to.width : 1,
  };
}

/** Test hook. */
export function resetHeroes(): void {
  sources.clear();
  pending = null;
}
