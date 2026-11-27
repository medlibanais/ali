// Creator option catalogs, the editor's tabs and the ready-made looks.

import type { AvatarChoiceKey, AvatarConfig, ValidChoices } from './types';
import { DEFAULT_AVATAR } from './types';
import {
  BODY_MAIN_SLIDERS, BODY_PRESETS, BODY_SLIDERS, BROW_PRESETS, BROW_SLIDERS, CHEEK_SLIDERS, CHEST_SLIDERS, EAR_SLIDERS, EXPRESSIONS, EYE_PRESETS,
  EYE_SLIDERS, FACE_PRESETS, FACE_SLIDERS, HEAD_SLIDERS, JAW_SLIDERS, LIMB_SLIDERS, MOUTH_PRESETS, MOUTH_SLIDERS, NECK_SLIDERS, NOSE_PRESETS,
  NOSE_SLIDERS, TORSO_SLIDERS, applyPreset, randomSlider, type Preset, type SliderId, type Sliders,
} from './custom';
import { BG_STYLES, EYE_COLORS, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from './palettes';
import { BODY_TYPES, BOTTOMS, BROW_STYLES, FEATURES, GLASSES, HAIR_STYLES, LASH_STYLES, OUTFITS, SHOES, TOPS, type Sex, type WearItem } from './wardrobe';

export interface OptionItem {
  id: string;
  label: string;
  /** Minimum level to use. Locked options render with a lock. */
  minLevel?: number;
  /** Swatch color when the category is a color palette. */
  swatch?: string;
  /** Offered for one body only. */
  for?: Sex;
}

export interface Category {
  key: AvatarChoiceKey;
  label: string;
  kind: 'shape' | 'color';
  options: OptionItem[];
}

const wear = (items: WearItem[]): OptionItem[] => items.map((i) => ({ id: i.id, label: i.label, for: i.for }));
const cloth = (): OptionItem[] => OUTFIT_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value }));

export const POSES: OptionItem[] = [
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'confident', label: 'Confident' },
  { id: 'walk', label: 'Walking' },
  { id: 'arms-raised', label: 'Arms raised' },
  { id: 'look-side', label: 'Looking sideways' },
  { id: 'look-up', label: 'Looking upward' },
];

export const CATEGORIES: Category[] = [
  { key: 'sex', label: 'Body', kind: 'shape', options: [{ id: 'female', label: 'Female' }, { id: 'male', label: 'Male' }] },
  { key: 'features', label: 'Features', kind: 'shape', options: FEATURES.map((f) => ({ id: f.id, label: f.label })) },
  { key: 'bodyType', label: 'Body type', kind: 'shape', options: wear(BODY_TYPES) },
  { key: 'skin', label: 'Skin', kind: 'color', options: SKIN_TONES.map((t) => ({ id: t.id, label: t.label, swatch: t.base })) },
  { key: 'hair', label: 'Hair', kind: 'shape', options: wear(HAIR_STYLES) },
  { key: 'hairColor', label: 'Hair color', kind: 'color', options: HAIR_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'brows', label: 'Brows', kind: 'shape', options: wear(BROW_STYLES) },
  { key: 'lashes', label: 'Lashes', kind: 'shape', options: wear(LASH_STYLES) },
  { key: 'eyeColor', label: 'Eye color', kind: 'color', options: EYE_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'outfit', label: 'Outfit', kind: 'shape', options: wear(OUTFITS) },
  { key: 'top', label: 'Top', kind: 'shape', options: wear(TOPS) },
  { key: 'topColor', label: 'Top color', kind: 'color', options: cloth() },
  { key: 'bottom', label: 'Bottom', kind: 'shape', options: wear(BOTTOMS) },
  { key: 'bottomColor', label: 'Bottom color', kind: 'color', options: cloth() },
  { key: 'shoes', label: 'Shoes', kind: 'shape', options: wear(SHOES) },
  { key: 'glasses', label: 'Glasses', kind: 'shape', options: wear(GLASSES) },
  { key: 'expression', label: 'Expression', kind: 'shape', options: EXPRESSIONS.map((e) => ({ id: e.id, label: e.label })) },
  { key: 'pose', label: 'Pose', kind: 'shape', options: POSES },
  { key: 'bg', label: 'Backdrop', kind: 'color', options: BG_STYLES.map((b) => ({ id: b.id, label: b.label, swatch: b.to })) },
];

export const VALID_OPTION_IDS: ValidChoices = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.options.map((o) => o.id)]),
) as ValidChoices;

export function categoryFor(key: AvatarChoiceKey): Category {
  const found = CATEGORIES.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown avatar category ${key}`);
  return found;
}

export function optionLocked(option: OptionItem, level: number): boolean {
  return (option.minLevel ?? 1) > level;
}

/** The options of a category that the given body can use. */
export function optionsFor(key: AvatarChoiceKey, sex: Sex): OptionItem[] {
  return categoryFor(key).options.filter((o) => !o.for || o.for === sex);
}

function pickOption(key: AvatarChoiceKey, sex: Sex, level: number): string {
  const open = optionsFor(key, sex).filter((o) => !optionLocked(o, level));
  return open[Math.floor(Math.random() * open.length)].id;
}

/**
 * After the body changes, swap anything cut for the other body (an
 * outfit, a top, a body type) for the first choice that fits.
 */
export function fitToSex(config: AvatarConfig): AvatarConfig {
  const next = { ...config };
  const record = next as unknown as Record<AvatarChoiceKey, string>;
  for (const c of CATEGORIES) {
    const current = c.options.find((o) => o.id === record[c.key]);
    if (current && current.for && current.for !== config.sex) record[c.key] = optionsFor(c.key, config.sex)[0].id;
  }
  return next;
}

// ---------------------------------------------------------------- ready-made looks

export interface Look {
  id: string;
  label: string;
  config: AvatarConfig;
}

function look(id: string, label: string, choices: Partial<AvatarConfig>, presets: { face?: string; eyes?: string; nose?: string; mouth?: string; body?: string } = {}, extra: Sliders = {}): Look {
  let sliders: Sliders = {};
  const use = (list: Preset[], owned: SliderId[], pid?: string) => {
    const preset = list.find((x) => x.id === pid);
    if (preset) sliders = applyPreset(sliders, owned, preset);
  };
  use(FACE_PRESETS, FACE_SLIDERS, presets.face);
  use(EYE_PRESETS, EYE_SLIDERS, presets.eyes);
  use(NOSE_PRESETS, NOSE_SLIDERS, presets.nose);
  use(MOUTH_PRESETS, MOUTH_SLIDERS, presets.mouth);
  use(BODY_PRESETS, BODY_SLIDERS, presets.body);
  return { id, label, config: { ...DEFAULT_AVATAR, ...choices, sliders: { ...sliders, ...extra } } };
}

/** Whole characters to start from, like a game's preset row. */
export const LOOKS: Look[] = [
  look('f1', 'Lina', { sex: 'female', features: 'european', skin: 'light-1', hair: 'bob02', hairColor: 'light-brown', eyeColor: 'hazel', outfit: 'separates', top: 'fitted_tee', topColor: 'cream', bottom: 'trousers', bottomColor: 'charcoal', shoes: 'shoes2' }, { face: 'oval', eyes: 'almond', mouth: 'full' }),
  look('f2', 'Amara', { sex: 'female', features: 'african', skin: 'brown-3', hair: 'ponytail01', hairColor: 'black', eyeColor: 'dark-brown', outfit: 'f_sport', shoes: 'shoes5', brows: 'brow4' }, { face: 'heart', eyes: 'large', mouth: 'full', body: 'athletic' }),
  look('f3', 'Mei', { sex: 'female', features: 'asian', skin: 'light-neutral', hair: 'long01', hairColor: 'near-black', eyeColor: 'dark-brown', outfit: 'f_blouse_skirt', shoes: 'shoes4', brows: 'brow2' }, { face: 'soft', eyes: 'monolid', nose: 'small', body: 'slim' }),
  look('f4', 'Sofia', { sex: 'female', features: 'european-african', skin: 'golden-tan', hair: 'long01', hairColor: 'dark-brown', eyeColor: 'honey', outfit: 'f_tee_jeans', shoes: 'shoes6', brows: 'brow5' }, { face: 'diamond', eyes: 'upturned', mouth: 'bow', body: 'toned' }),
  look('f5', 'Nora', { sex: 'female', features: 'european', skin: 'porcelain-2', hair: 'braid01', hairColor: 'copper', eyeColor: 'green', outfit: 'separates', top: 'tee', topColor: 'teal', bottom: 'cargo', shoes: 'shoes2', glasses: 'glasses_slim' }, { face: 'round', eyes: 'doe', nose: 'button', body: 'curvy' }),
  look('f6', 'Yara', { sex: 'female', features: 'european-asian', skin: 'olive', hair: 'bob01', hairColor: 'espresso', eyeColor: 'brown', outfit: 'f_tee_shorts', shoes: 'shoes1', brows: 'brow7' }, { face: 'sculpted', eyes: 'cat', nose: 'refined', body: 'lean' }),
  look('m1', 'Adam', { sex: 'male', features: 'european', skin: 'light-2', hair: 'short02', hairColor: 'dark-brown', eyeColor: 'blue', outfit: 'm_tee_jeans', shoes: 'shoes3', brows: 'brow3' }, { face: 'square', eyes: 'natural', body: 'athletic' }),
  look('m2', 'Karim', { sex: 'male', features: 'european-african', skin: 'tan-3', hair: 'short01', hairColor: 'black', eyeColor: 'dark-brown', outfit: 'm_shirt_jeans', shoes: 'shoes1', brows: 'brow9' }, { face: 'strong-jaw', eyes: 'deep-set', nose: 'roman', body: 'toned' }),
  look('m3', 'Kenji', { sex: 'male', features: 'asian', skin: 'light-olive', hair: 'short02', hairColor: 'near-black', eyeColor: 'dark-brown', outfit: 'm_longsleeve', shoes: 'shoes6', brows: 'brow3' }, { face: 'oval', eyes: 'monolid', nose: 'small', body: 'slim' }),
  look('m4', 'Malik', { sex: 'male', features: 'african', skin: 'deep-1', hair: 'short04', hairColor: 'black', eyeColor: 'black', outfit: 'm_suit', shoes: 'shoes4', brows: 'brow4' }, { face: 'rectangular', eyes: 'natural', nose: 'wide', mouth: 'full', body: 'muscular' }),
  look('m5', 'Leo', { sex: 'male', features: 'european', skin: 'fair-beige', hair: 'short04', hairColor: 'dirty-blonde', eyeColor: 'grey', outfit: 'separates', top: 'sweater', topColor: 'charcoal', bottom: 'cargo', bottomColor: 'olive', shoes: 'shoes3', glasses: 'glasses_bold' }, { face: 'long', eyes: 'narrow', nose: 'straight', body: 'average' }),
  look('m6', 'Sami', { sex: 'male', features: 'blend', skin: 'medium-beige', hair: 'short01', hairColor: 'espresso', eyeColor: 'hazel', outfit: 'm_jacket', shoes: 'shoes3', brows: 'brow1' }, { face: 'soft', eyes: 'round', body: 'stocky' }),
];

// ---------------------------------------------------------------- editor tabs

/** One block of a tab. `detail` blocks only show in Detailed edit mode. */
export type EditorSection =
  | { kind: 'looks'; title: string }
  | { kind: 'presets'; title: string; presets: Preset[]; owns: SliderId[] }
  | { kind: 'sliders'; title: string; sliders: SliderId[]; detail?: boolean; only?: Sex }
  | { kind: 'choice'; title: string; category: AvatarChoiceKey; thumbs?: 'head' | 'full-body'; when?: 'separates' }
  | { kind: 'color'; title: string; category: AvatarChoiceKey; custom: boolean; when?: 'top' | 'bottom' }
  | { kind: 'note'; title: string; text: string };

export type EditorView = 'face' | 'head' | 'full-body';

export interface EditorTab {
  key: string;
  label: string;
  /** How close the preview stands when the tab opens. */
  view: EditorView;
  sections: EditorSection[];
}

export const EDITOR_TABS: EditorTab[] = [
  { key: 'presets', label: 'Presets', view: 'head', sections: [
    { kind: 'choice', title: 'Body', category: 'sex' },
    { kind: 'looks', title: 'Start from a look' },
    { kind: 'choice', title: 'Features', category: 'features' },
  ] },
  { key: 'face', label: 'Face', view: 'face', sections: [
    { kind: 'presets', title: 'Face shape', presets: FACE_PRESETS, owns: FACE_SLIDERS },
    { kind: 'sliders', title: 'Head', sliders: HEAD_SLIDERS, detail: true },
    { kind: 'sliders', title: 'Cheeks', sliders: CHEEK_SLIDERS, detail: true },
    { kind: 'sliders', title: 'Jaw and chin', sliders: JAW_SLIDERS, detail: true },
    { kind: 'sliders', title: 'Ears', sliders: EAR_SLIDERS, detail: true },
    { kind: 'sliders', title: 'Neck', sliders: NECK_SLIDERS, detail: true },
  ] },
  { key: 'eyes', label: 'Eyes', view: 'face', sections: [
    { kind: 'presets', title: 'Eye shape', presets: EYE_PRESETS, owns: EYE_SLIDERS },
    { kind: 'color', title: 'Eye color', category: 'eyeColor', custom: true },
    { kind: 'choice', title: 'Eyebrows', category: 'brows', thumbs: 'head' },
    { kind: 'presets', title: 'Brow position', presets: BROW_PRESETS, owns: BROW_SLIDERS },
    { kind: 'choice', title: 'Lashes', category: 'lashes' },
    { kind: 'sliders', title: 'Fine-tune eyes', sliders: EYE_SLIDERS, detail: true },
    { kind: 'sliders', title: 'Fine-tune brows', sliders: BROW_SLIDERS, detail: true },
  ] },
  { key: 'nose', label: 'Nose', view: 'face', sections: [
    { kind: 'presets', title: 'Nose', presets: NOSE_PRESETS, owns: NOSE_SLIDERS },
    { kind: 'sliders', title: 'Fine-tune nose', sliders: NOSE_SLIDERS, detail: true },
  ] },
  { key: 'mouth', label: 'Mouth', view: 'face', sections: [
    { kind: 'presets', title: 'Mouth', presets: MOUTH_PRESETS, owns: MOUTH_SLIDERS },
    { kind: 'sliders', title: 'Fine-tune mouth', sliders: MOUTH_SLIDERS, detail: true },
  ] },
  { key: 'hair', label: 'Hair', view: 'head', sections: [
    { kind: 'choice', title: 'Hairstyle', category: 'hair', thumbs: 'head' },
    { kind: 'color', title: 'Hair color', category: 'hairColor', custom: true },
  ] },
  { key: 'skin', label: 'Skin', view: 'head', sections: [
    { kind: 'color', title: 'Skin tone', category: 'skin', custom: true },
    { kind: 'note', title: 'Makeup and marks', text: 'Makeup, freckles, facial hair and tattoos are painted layers on the skin. They are not part of this version yet.' },
  ] },
  { key: 'body', label: 'Body', view: 'full-body', sections: [
    { kind: 'presets', title: 'Build', presets: BODY_PRESETS, owns: BODY_SLIDERS },
    { kind: 'sliders', title: 'Overall', sliders: BODY_MAIN_SLIDERS },
    { kind: 'choice', title: 'Body type', category: 'bodyType' },
    { kind: 'sliders', title: 'Bust', sliders: CHEST_SLIDERS, detail: true, only: 'female' },
    { kind: 'sliders', title: 'Torso and hips', sliders: TORSO_SLIDERS, detail: true },
    { kind: 'sliders', title: 'Arms and legs', sliders: LIMB_SLIDERS, detail: true },
  ] },
  { key: 'outfit', label: 'Outfit', view: 'full-body', sections: [
    { kind: 'choice', title: 'Outfit', category: 'outfit', thumbs: 'full-body' },
    { kind: 'choice', title: 'Top', category: 'top', thumbs: 'full-body', when: 'separates' },
    { kind: 'color', title: 'Top color', category: 'topColor', custom: true, when: 'top' },
    { kind: 'choice', title: 'Bottom', category: 'bottom', thumbs: 'full-body', when: 'separates' },
    { kind: 'color', title: 'Bottom color', category: 'bottomColor', custom: true, when: 'bottom' },
    { kind: 'choice', title: 'Shoes', category: 'shoes' },
  ] },
  { key: 'accessories', label: 'Accessories', view: 'head', sections: [
    { kind: 'choice', title: 'Glasses', category: 'glasses', thumbs: 'head' },
    { kind: 'note', title: 'More accessories', text: 'Hats, jewelry, watches and bags are not in this version: the free hat models clip through the hair, and the others need to be fitted to the hands and neck.' },
  ] },
  { key: 'style', label: 'Style', view: 'full-body', sections: [
    { kind: 'choice', title: 'Expression', category: 'expression' },
    { kind: 'choice', title: 'Pose', category: 'pose' },
    { kind: 'color', title: 'Backdrop', category: 'bg', custom: false },
  ] },
];

/** Config fields and sliders a tab edits, for "reset this tab" and "randomize this tab". */
export function tabFields(tab: EditorTab): { choices: AvatarChoiceKey[]; sliders: SliderId[] } {
  const choices: AvatarChoiceKey[] = [];
  const sliders: SliderId[] = [];
  for (const section of tab.sections) {
    if (section.kind === 'choice' || section.kind === 'color') choices.push(section.category);
    if (section.kind === 'sliders') sliders.push(...section.sliders);
    if (section.kind === 'presets') sliders.push(...section.owns);
  }
  return { choices, sliders: [...new Set(sliders)] };
}

/** Put one tab back to `base` (the default avatar, or the saved one). */
export function resetTab(config: AvatarConfig, tab: EditorTab, base: AvatarConfig): AvatarConfig {
  const { choices, sliders } = tabFields(tab);
  const next = { ...config, sliders: { ...config.sliders } } as AvatarConfig;
  const record = next as unknown as Record<AvatarChoiceKey, string>;
  for (const key of choices) record[key] = base[key];
  for (const id of sliders) {
    const v = base.sliders[id];
    if (v) next.sliders[id] = v;
    else delete next.sliders[id];
  }
  return fitToSex(next);
}

/** Roll new values for one tab only. The body (female or male) is never rolled. */
export function randomizeTab(config: AvatarConfig, tab: EditorTab, level: number): AvatarConfig {
  const { choices, sliders } = tabFields(tab);
  const next = { ...config, sliders: { ...config.sliders } } as AvatarConfig;
  const record = next as unknown as Record<AvatarChoiceKey, string>;
  for (const key of choices) if (key !== 'sex') record[key] = pickOption(key, config.sex, level);
  for (const section of tab.sections) {
    if (section.kind !== 'presets') continue;
    const preset = section.presets[Math.floor(Math.random() * section.presets.length)];
    next.sliders = applyPreset(next.sliders, section.owns, preset);
  }
  const owned = new Set(tab.sections.flatMap((x) => (x.kind === 'presets' ? x.owns : [])));
  for (const id of sliders) {
    if (owned.has(id)) continue;
    const v = randomSlider(id);
    if (v) next.sliders[id] = v;
    else delete next.sliders[id];
  }
  return next;
}

/** A whole random avatar: every tab rolled, on a random body. */
export function randomAvatarConfig(level: number): AvatarConfig {
  let config: AvatarConfig = { ...DEFAULT_AVATAR, sex: Math.random() < 0.5 ? 'female' : 'male', sliders: {} };
  for (const tab of EDITOR_TABS) config = randomizeTab(config, tab, level);
  // Presets already vary the face; keep the fine sliders gentle.
  const sliders: Sliders = {};
  for (const id in config.sliders) sliders[id] = Math.round(config.sliders[id] * 70) / 100;
  return { ...config, sliders, expression: 'auto', pose: 'relaxed', bg: DEFAULT_AVATAR.bg };
}
