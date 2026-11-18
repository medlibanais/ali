// Screen positions the animations need but Redux should not hold:
// where the user tapped to complete a quest, and where the XP bar is now.
// Plain module state, written by the views and read by the effects.

import type { Point } from '../../store/slices/celebrationsSlice';

interface Rect extends Point {
  width: number;
  height: number;
}

type Measure = (done: (rect: Rect | null) => void) => void;

const ORIGIN_TTL_MS = 15000;
const origins = new Map<string, { point: Point; at: number }>();

/** Called by the quest checkbox with the tap position (window coordinates). */
export function rememberCompletionOrigin(questId: string, point: Point): void {
  origins.set(questId, { point, at: Date.now() });
}

/** The tap that completed this quest, used once. */
export function takeCompletionOrigin(questId: string): Point | null {
  const hit = origins.get(questId);
  origins.delete(questId);
  if (!hit || Date.now() - hit.at > ORIGIN_TTL_MS) return null;
  return hit.point;
}

let measureXpBar: Measure | null = null;
const arrivalListeners = new Set<() => void>();

/** The visible XP bar registers how to measure itself. Returns unregister. */
export function registerXpBar(measure: Measure, onArrive: () => void): () => void {
  measureXpBar = measure;
  arrivalListeners.add(onArrive);
  return () => {
    if (measureXpBar === measure) measureXpBar = null;
    arrivalListeners.delete(onArrive);
  };
}

/** Center of the XP bar's fill, or null when no bar is mounted. */
export function findXpBarTarget(done: (target: Point | null) => void): void {
  if (!measureXpBar) {
    done(null);
    return;
  }
  measureXpBar((rect) =>
    done(rect && rect.width > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null),
  );
}

/** Particles reached the bar: let it glow. */
export function notifyXpArrived(): void {
  arrivalListeners.forEach((fn) => fn());
}
