// Avatar config: a single JSON object stored in profiles.avatar_config.
// Every value is an id into the option catalogs below — the same config
// renders at any size, anywhere in the app.

export type Mood = 'tired' | 'neutral' | 'happy' | 'glowing';

export type BodyBuild = 'slim' | 'athletic' | 'average' | 'curvy' | 'broad';
export type BodyHeight = 'short' | 'medium' | 'tall';
export type BodyPose = 'standing' | 'hip' | 'arms-crossed' | 'wave';
export type ShoeStyle = 'sneakers' | 'boots' | 'sandals' | 'barefoot';
export type BottomsStyle = 'pants' | 'joggers' | 'shorts' | 'skirt';

import { sanitizeSliders, type Sliders } from './custom';
import { isHex } from './palettes';

export interface AvatarConfig {
  face: string; // 8 face shapes
  skin: string; // 12 skin tones
  hair: string; // 20 hairstyles (incl. hijab, cap, bald)
  hairColor: string; // 20 hair colors
  eyes: string; // 10 eye styles
  brows: string; // 8 brow styles
  nose: string; // 6 nose styles
  mouth: string; // 8 mouth styles
  facialHair: string; // none + 4 styles
  glasses: string; // none + 4 styles
  headwear: string; // none + 4 styles
  outfit: string; // 6 outfits
  outfitColor: string; // palette key
  bg: string; // 8 background styles
  bodyBuild: BodyBuild;
  height: BodyHeight;
  pose: BodyPose;
  bottoms: BottomsStyle;
  pantsColor: string; // palette key
  shoes: ShoeStyle;
  shoesColor: string; // palette key
  eyeColor: string; // palette key, 'natural' keeps the model's eyes
  expression: string; // 'auto' follows the day's mood
  mark: string; // beauty mark or scar
  topPattern: string;
  topColor2: string; // the pattern's second color
  bottomPattern: string;
  bottomColor2: string;
  /** Proportion sliders, -1..1, zeros left out (custom.ts). */
  sliders: Sliders;
}

/** Every field except the sliders: an id into an option catalog. */
export type AvatarChoiceKey = Exclude<keyof AvatarConfig, 'sliders'>;
export type ValidChoices = { [K in AvatarChoiceKey]: string[] };

/** Fields that also accept a custom '#RRGGBB' color. */
export const CUSTOM_COLOR_KEYS: AvatarChoiceKey[] = [
  'skin', 'hairColor', 'eyeColor', 'outfitColor', 'pantsColor', 'shoesColor', 'topColor2', 'bottomColor2',
];

export const DEFAULT_AVATAR: AvatarConfig = {
  face: 'oval',
  skin: 'tan-3',
  hair: 'short-wave',
  hairColor: 'espresso',
  eyes: 'almond',
  brows: 'natural',
  nose: 'straight',
  mouth: 'soft-smile',
  facialHair: 'none',
  glasses: 'none',
  headwear: 'none',
  outfit: 'crewneck',
  outfitColor: 'forest',
  bg: 'sunrise',
  bodyBuild: 'average',
  height: 'medium',
  pose: 'standing',
  bottoms: 'pants',
  pantsColor: 'navy',
  shoes: 'sneakers',
  shoesColor: 'charcoal',
  eyeColor: 'natural',
  expression: 'auto',
  mark: 'none',
  topPattern: 'plain',
  topColor2: 'cream',
  bottomPattern: 'plain',
  bottomColor2: 'cream',
  sliders: {},
};

/** Sliders that match the body and height choices made before sliders existed. */
const LEGACY_BUILD: Record<string, Sliders> = {
  slim: { bodyFat: -0.6, muscle: -0.3, waist: -0.3 },
  athletic: { muscle: 0.5, shoulders: 0.4, bodyFat: -0.4, waist: -0.2 },
  curvy: { hips: 0.8, chest: 0.5, waist: -0.4, bodyFat: 0.2 },
  broad: { shoulders: 0.9, muscle: 0.4 },
};
const LEGACY_HEIGHT: Record<string, number> = { short: -0.7, tall: 0.7 };

/** Coerce arbitrary JSONB into a valid config (falls back per-field). */
export function sanitizeAvatarConfig(raw: unknown, valid: ValidChoices): AvatarConfig {
  const out = { ...DEFAULT_AVATAR, sliders: {} } as AvatarConfig;
  if (!raw || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  const choices = out as unknown as Record<AvatarChoiceKey, string>;
  for (const key of Object.keys(valid) as AvatarChoiceKey[]) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    if (valid[key].includes(value) || (CUSTOM_COLOR_KEYS.includes(key) && isHex(value))) {
      choices[key] = value;
    }
  }
  if (record.sliders && typeof record.sliders === 'object') {
    out.sliders = sanitizeSliders(record.sliders);
  } else {
    // Saved before sliders: keep the body it had.
    const seeded: Sliders = { ...(LEGACY_BUILD[out.bodyBuild] ?? {}) };
    const h = LEGACY_HEIGHT[out.height];
    if (h) seeded.height = h;
    out.sliders = seeded;
  }
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
  const out: Record<string, unknown> = { ...doc.current, v: 2 };
  if (doc.future) out.future = doc.future;
  if (doc.looks.length) out.looks = doc.looks.slice(0, MAX_LOOKS);
  return out;
}

/**
 * A first Future You: the same person, standing taller, a little fitter
 * and smiling. A starting point to edit, not a goal we choose for them.
 */
export function suggestFuture(current: AvatarConfig): AvatarConfig {
  const s = current.sliders;
  const up = (v: number | undefined, by: number, max = 1) => Math.max(-1, Math.min(max, Math.round(((v ?? 0) + by) * 100) / 100));
  return {
    ...current,
    expression: 'confident',
    pose: 'arms-crossed',
    sliders: { ...s, posture: up(s.posture, 0.7), muscle: up(s.muscle, 0.3), shoulders: up(s.shoulders, 0.2) },
  };
}

/** Mood derived from the Daily Life Score. */
export function moodForScore(score: number): Mood {
  if (score >= 80) return 'glowing';
  if (score >= 50) return 'happy';
  if (score >= 25) return 'neutral';
  return 'tired';
}
