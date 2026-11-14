// Turns an avatar config into what the 3D viewer draws: the weights of
// the body's shape targets, and the meshes it wears. Pure functions, so
// the editor, the image cache key and the tests all agree.

import { EXPRESSIONS, MOOD_EXPRESSION, SLIDERS, sv, type Sliders } from './custom';
import { eyeColor, hairColor, outfitColor, pantsColor, skinTone } from './palettes';
import type { AvatarConfig, Mood } from './types';
import { BODY_TYPES, BOTTOMS, FEATURES, GLASSES, HAIR_STYLES, OUTFITS, TOPS, fits, type Sex, type WearItem } from './wardrobe';

const round = (v: number) => Math.round(v * 1000) / 1000;

/** min / average / max shares of a 0..1 value, as MakeHuman blends them. */
function three(v: number): [number, number, number] {
  return [Math.max(0, 1 - 2 * v), 1 - Math.abs(2 * v - 1), Math.max(0, 2 * v - 1)];
}
const LEVEL = ['min', 'average', 'max'] as const;

/** Sliders run -1..1; MakeHuman's whole-body values run 0..1. */
const unit = (sliders: Sliders, id: string) => (sv(sliders, id) + 1) / 2;

/** Target weights for the body, the face and the expression. */
export function targetsFor(config: AvatarConfig, mood: Mood, eyesClosed = false): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (name: string, w: number) => {
    if (w > 0.001) out[name] = round((out[name] ?? 0) + w);
  };
  const s = config.sliders;
  const sex = config.sex;

  // The body itself: sex, muscle and weight pick between nine bodies.
  const muscle = three(unit(s, 'muscle'));
  const weight = three(unit(s, 'weight'));
  for (let m = 0; m < 3; m++) {
    for (let w = 0; w < 3; w++) {
      // The average body is the model's resting shape, so it has no target.
      if (m === 1 && w === 1) continue;
      add(`universal-${sex}-young-${LEVEL[m]}muscle-${LEVEL[w]}weight`, muscle[m] * weight[w]);
    }
  }
  const height = three(unit(s, 'height'));
  add(`${sex}-young-averagemuscle-averageweight-minheight`, height[0]);
  add(`${sex}-young-averagemuscle-averageweight-maxheight`, height[2]);
  add(`${sex}-young-averagemuscle-averageweight-idealproportions`, Math.max(0, sv(s, 'proportions')));
  if (sex === 'female') {
    const cup = three(unit(s, 'cup'));
    const firm = three(unit(s, 'firmness'));
    for (let c = 0; c < 3; c++) {
      for (let f = 0; f < 3; f++) {
        if (c === 1 && f === 1) continue;
        add(`female-young-averagemuscle-averageweight-${LEVEL[c]}cup-${LEVEL[f]}firmness`, cup[c] * firm[f]);
      }
    }
  }
  const mix = (FEATURES.find((f) => f.id === config.features) ?? FEATURES[0]).mix;
  add(`caucasian-${sex}-young`, mix[0]);
  add(`asian-${sex}-young`, mix[1]);
  add(`african-${sex}-young`, mix[2]);
  const bodyType = BODY_TYPES.find((b) => b.id === config.bodyType);
  if (bodyType && bodyType.id !== 'none' && fits(bodyType, sex)) add(`bodyshapes-elvs-${bodyType.id}`, 1);

  // Detail sliders.
  for (const def of SLIDERS) {
    if (def.macro) continue;
    const v = sv(s, def.id);
    if (v > 0 && def.pos) add(def.pos, v);
    else if (v < 0 && def.neg) add(def.neg, -v);
  }

  // Expression.
  const id = config.expression === 'auto' ? MOOD_EXPRESSION[mood] : config.expression;
  const units = { ...(EXPRESSIONS.find((e) => e.id === id)?.units ?? {}) };
  if (eyesClosed) {
    units['eye-left-closure'] = 1;
    units['eye-right-closure'] = 1;
    delete units['eye-left-slit'];
    delete units['eye-right-slit'];
    delete units['eye-left-opened-up'];
    delete units['eye-right-opened-up'];
  }
  for (const u in units) add(`expr-${u}`, units[u]);
  return out;
}

export interface Part {
  id: string;
  color?: string;
  /** Metres to push the surface outward (see partsFor). */
  grow?: number;
}

/** A separate bottom is drawn a little larger, so the top tucks into it instead of poking through. */
const BOTTOM_GROW = 0.013;

function pick(list: WearItem[], id: string, sex: Sex): WearItem {
  return list.find((i) => i.id === id && fits(i, sex)) ?? list.find((i) => fits(i, sex) && i.id !== 'none' && i.id !== 'separates')!;
}

/** The outfit actually worn: a choice cut for the other body falls back to one that fits. */
export function wornOutfit(config: AvatarConfig): { outfit: WearItem | null; top: WearItem | null; bottom: WearItem | null } {
  const outfit = OUTFITS.find((o) => o.id === config.outfit && fits(o, config.sex));
  if (outfit && outfit.id !== 'separates') return { outfit, top: null, bottom: null };
  return { outfit: null, top: pick(TOPS, config.top, config.sex), bottom: pick(BOTTOMS, config.bottom, config.sex) };
}

/** Meshes the avatar wears, in drawing order. The body is never left bare. */
export function partsFor(config: AvatarConfig): Part[] {
  const parts: Part[] = [{ id: 'eyes' }, { id: 'teeth' }, { id: 'tongue' }, { id: config.lashes }];
  const hair = hairColor(config.hairColor);
  parts.push({ id: config.brows, color: hair });
  if (config.hair !== 'none' && HAIR_STYLES.some((h) => h.id === config.hair)) parts.push({ id: config.hair, color: hair });
  const worn = wornOutfit(config);
  if (worn.outfit) parts.push({ id: worn.outfit.id });
  if (worn.top) parts.push(worn.top.tint ? { id: worn.top.id, color: outfitColor(config.topColor).value } : { id: worn.top.id });
  if (worn.bottom) {
    parts.push(worn.bottom.tint ? { id: worn.bottom.id, color: pantsColor(config.bottomColor).value, grow: BOTTOM_GROW } : { id: worn.bottom.id, grow: BOTTOM_GROW });
  }
  parts.push({ id: config.shoes });
  if (config.glasses !== 'none' && GLASSES.some((g) => g.id === config.glasses)) parts.push({ id: config.glasses });
  return parts;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
}

/** The photographed skin closest to the chosen tone, tinted the rest of the way. */
export function skinFor(config: AvatarConfig): { id: string; color: string } {
  const color = skinTone(config.skin).base;
  const l = luminance(color);
  const family = l > 0.7 ? 'caucasian' : l > 0.44 ? 'asian' : 'african';
  return { id: `${family}_${config.sex}`, color };
}

export function irisFor(config: AvatarConfig): string {
  return eyeColor(config.eyeColor);
}
