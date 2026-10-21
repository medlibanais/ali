// Avatar config: a single JSON object stored in profiles.avatar_config.
// Every value is an id into the option catalogs below — the same config
// renders at any size, anywhere in the app.

export type Mood = 'tired' | 'neutral' | 'happy' | 'glowing';

export type BodyBuild = 'slim' | 'athletic' | 'average' | 'curvy' | 'broad';
export type BodyHeight = 'short' | 'medium' | 'tall';
export type BodyPose = 'standing' | 'hip' | 'arms-crossed' | 'wave';
export type ShoeStyle = 'sneakers' | 'boots' | 'sandals' | 'barefoot';

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
  pantsColor: string; // palette key
  shoes: ShoeStyle;
  shoesColor: string; // palette key
}

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
  pantsColor: 'navy',
  shoes: 'sneakers',
  shoesColor: 'charcoal',
};

/** Coerce arbitrary JSONB into a valid config (falls back per-field). */
export function sanitizeAvatarConfig(
  raw: unknown,
  valid: { [K in keyof AvatarConfig]: string[] },
): AvatarConfig {
  const out: Record<string, string> = { ...DEFAULT_AVATAR };
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    for (const key of Object.keys(out) as (keyof AvatarConfig)[]) {
      const value = record[key];
      if (typeof value === 'string' && valid[key].includes(value)) {
        out[key] = value;
      }
    }
  }
  return out as unknown as AvatarConfig;
}

/** Mood derived from the Daily Life Score. */
export function moodForScore(score: number): Mood {
  if (score >= 80) return 'glowing';
  if (score >= 50) return 'happy';
  if (score >= 25) return 'neutral';
  return 'tired';
}
