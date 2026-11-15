// Avatar config: a single JSON object stored in profiles.avatar_config.
// Every value is an id into the option catalogs (options.ts) or a custom
// colour; the sliders shape the face and body (custom.ts). The same
// config renders at any size, anywhere in the app.

import { sanitizeSliders, type Sliders } from './custom';
import { isHex } from './palettes';
import type { Sex } from './wardrobe';

export type Mood = 'tired' | 'neutral' | 'happy' | 'glowing';

export interface AvatarConfig {
  sex: Sex;
  /** Face structure family the body blends toward. */
  features: string;
  /** Named body type, or 'none' to use the sliders alone. */
  bodyType: string;
  skin: string;
  hair: string;
  hairColor: string;
  brows: string;
  lashes: string;
  eyeColor: string;
  /** A whole outfit, or 'separates' to wear `top` and `bottom`. */
  outfit: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  glasses: string;
  expression: string; // 'auto' follows the day's mood
  pose: string;
  bg: string;
  /** Shape sliders, -1..1, zeros left out (custom.ts). */
  sliders: Sliders;
}

/** Every field except the sliders: an id into an option catalog. */
export type AvatarChoiceKey = Exclude<keyof AvatarConfig, 'sliders'>;
export type ValidChoices = { [K in AvatarChoiceKey]: string[] };

/** Fields that also accept a custom '#RRGGBB' color. */
export const CUSTOM_COLOR_KEYS: AvatarChoiceKey[] = ['skin', 'hairColor', 'eyeColor', 'topColor', 'bottomColor'];

export const DEFAULT_AVATAR: AvatarConfig = {
  sex: 'female',
  features: 'blend',
  bodyType: 'none',
  skin: 'tan-1',
  hair: 'long01',
  hairColor: 'espresso',
  brows: 'brow1',
  lashes: 'lashes1',
  eyeColor: 'brown',
  outfit: 'separates',
  top: 'fitted_tee',
  topColor: 'forest',
  bottom: 'trousers',
  bottomColor: 'navy',
  shoes: 'shoes2',
  glasses: 'none',
  expression: 'auto',
  pose: 'relaxed',
  bg: 'studio',
  sliders: {},
};

/** Field names used before the realistic avatar, and what they map to now. */
const RENAMED: Partial<Record<AvatarChoiceKey, string>> = { topColor: 'outfitColor', bottomColor: 'pantsColor' };

/** Coerce arbitrary JSONB into a valid config (falls back per-field). */
export function sanitizeAvatarConfig(raw: unknown, valid: ValidChoices): AvatarConfig {
  const out = { ...DEFAULT_AVATAR, sliders: {} } as AvatarConfig;
  if (!raw || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  const choices = out as unknown as Record<AvatarChoiceKey, string>;
  for (const key of Object.keys(valid) as AvatarChoiceKey[]) {
    const old = RENAMED[key];
    const value = record[key] ?? (old ? record[old] : undefined);
    if (typeof value !== 'string') continue;
    if (valid[key].includes(value) || (CUSTOM_COLOR_KEYS.includes(key) && isHex(value))) {
      choices[key] = value;
    }
  }
  out.sliders = sanitizeSliders(record.sliders);
  return out;
}

// ---------------------------------------------------------------- Current You / Future You

/**
 * What profiles.avatar_config holds. The current avatar stays at the top
 * level (so everything that reads a plain config keeps working), with the
 * Future You avatar and saved looks beside it.
 */
export interface AvatarDoc {
  current: AvatarConfig;
  /** The person you are becoming. Null until it is made. */
  future: AvatarConfig | null;
  looks: SavedLook[];
}

export interface SavedLook {
  name: string;
  config: AvatarConfig;
}

export const MAX_LOOKS = 6;

export function readAvatarDoc(raw: unknown, valid: ValidChoices): AvatarDoc {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const looks: SavedLook[] = [];
  if (Array.isArray(record.looks)) {
    for (const item of record.looks.slice(0, MAX_LOOKS)) {
      if (!item || typeof item !== 'object') continue;
      const look = item as Record<string, unknown>;
      if (typeof look.name !== 'string' || !look.config) continue;
      looks.push({ name: look.name.slice(0, 24), config: sanitizeAvatarConfig(look.config, valid) });
    }
  }
  return {
    current: sanitizeAvatarConfig(record, valid),
    future: record.future && typeof record.future === 'object' ? sanitizeAvatarConfig(record.future, valid) : null,
    looks,
  };
}

export function writeAvatarDoc(doc: AvatarDoc): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc.current, v: 3 };
  if (doc.future) out.future = doc.future;
  if (doc.looks.length) out.looks = doc.looks.slice(0, MAX_LOOKS);
  return out;
}

/**
 * A first Future You: the same person, a little fitter, standing tall
 * and smiling. A starting point to edit, not a goal we choose for them.
 */
export function suggestFuture(current: AvatarConfig): AvatarConfig {
  const s = current.sliders;
  const up = (v: number | undefined, by: number) => Math.max(-1, Math.min(1, Math.round(((v ?? 0) + by) * 100) / 100));
  return {
    ...current,
    expression: 'confident',
    pose: 'confident',
    sliders: { ...s, muscle: up(s.muscle, 0.35), stomachTone: up(s.stomachTone, 0.4), proportions: up(s.proportions, 0.3) },
  };
}

/** Mood derived from the Daily Life Score. */
export function moodForScore(score: number): Mood {
  if (score >= 80) return 'glowing';
  if (score >= 50) return 'happy';
  if (score >= 25) return 'neutral';
  return 'tired';
}
