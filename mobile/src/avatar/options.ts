// Creator option catalogs + unlock rules.

import type { AvatarChoiceKey, AvatarConfig, ValidChoices } from './types';
import { BEAUTY_MARKS, BODY_PRESETS, BODY_SLIDERS, BROW_PRESETS, BROW_SLIDERS, CLOTHES_SLIDERS, EXPRESSIONS, EYE_PRESETS, EYE_SLIDERS, FACE_PRESETS, FACE_SLIDERS, FACIAL_HAIR_3D, HAIR_SLIDERS, MOUTH_PRESETS, MOUTH_SLIDERS, NOSE_PRESETS, NOSE_SLIDERS, PATTERNS, SKIN_SLIDERS, SLIDER_IDS, applyPreset, randomSlider, type Preset, type SliderId, type Sliders } from './custom';
import { BG_STYLES, EYE_COLORS, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from './palettes';
import {
  BROW_STYLES,
  EYE_STYLES,
  FACE_SHAPES,
  GLASSES_STYLES,
  MOUTH_STYLES,
  NOSE_STYLES,
} from './parts-face';
import { HAIR_STYLES, HEADWEAR_STYLES } from './parts-hair';
import { OUTFIT_STYLES } from './parts-outfit';

export interface OptionItem {
  id: string;
  label: string;
  /** Minimum level to use. Locked options render with a lock. */
  minLevel?: number;
  /** Swatch color when the category is a color palette. */
  swatch?: string;
}

export interface Category {
  key: AvatarChoiceKey;
  label: string;
  kind: 'shape' | 'color';
  options: OptionItem[];
}

export const CATEGORIES: Category[] = [
  { key: 'face', label: 'Face', kind: 'shape',
    options: FACE_SHAPES.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'skin', label: 'Skin', kind: 'color',
    options: SKIN_TONES.map((t) => ({ id: t.id, label: t.label, swatch: t.base })) },
  { key: 'hair', label: 'Hair', kind: 'shape',
    options: HAIR_STYLES.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'hairColor', label: 'Hair color', kind: 'color',
    options: HAIR_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'eyes', label: 'Eyes', kind: 'shape',
    options: EYE_STYLES.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'brows', label: 'Brows', kind: 'shape',
    options: BROW_STYLES.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'nose', label: 'Nose', kind: 'shape',
    options: NOSE_STYLES.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'mouth', label: 'Mouth', kind: 'shape',
    options: MOUTH_STYLES.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'facialHair', label: 'Facial hair', kind: 'shape',
    options: FACIAL_HAIR_3D.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'glasses', label: 'Glasses', kind: 'shape',
    options: GLASSES_STYLES.map((o) => ({ id: o.id, label: o.label })) },
  { key: 'headwear', label: 'Headwear', kind: 'shape',
    options: HEADWEAR_STYLES.map((o) => ({
      id: o.id,
      label: o.label,
      minLevel: o.id === 'crown' ? 26 : undefined,
    })) },
  { key: 'outfit', label: 'Outfit', kind: 'shape',
    options: OUTFIT_STYLES.map((o) => ({
      id: o.id,
      label: o.label,
      minLevel: o.id === 'jacket' ? 11 : undefined,
    })) },
  { key: 'outfitColor', label: 'Outfit color', kind: 'color',
    options: OUTFIT_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'bodyBuild', label: 'Body', kind: 'shape',
    options: [
      { id: 'slim', label: 'Slim' },
      { id: 'athletic', label: 'Athletic' },
      { id: 'average', label: 'Average' },
      { id: 'curvy', label: 'Curvy' },
      { id: 'broad', label: 'Broad', minLevel: 5 },
    ] },
  { key: 'height', label: 'Height', kind: 'shape',
    options: [
      { id: 'short', label: 'Short' },
      { id: 'medium', label: 'Medium' },
      { id: 'tall', label: 'Tall' },
    ] },
  { key: 'pose', label: 'Pose', kind: 'shape',
    options: [
      { id: 'standing', label: 'Standing' },
      { id: 'hip', label: 'Hand on hip', minLevel: 3 },
      { id: 'arms-crossed', label: 'Arms crossed', minLevel: 5 },
      { id: 'wave', label: 'Waving', minLevel: 8 },
      { id: 'hands-hips', label: 'Hands on hips' },
      { id: 'arms-raised', label: 'Arms raised' },
      { id: 'look-side', label: 'Looking sideways' },
      { id: 'look-up', label: 'Looking upward' },
    ] },
  { key: 'bottoms', label: 'Bottoms', kind: 'shape',
    options: [
      { id: 'pants', label: 'Pants' },
      { id: 'joggers', label: 'Joggers' },
      { id: 'shorts', label: 'Shorts' },
      { id: 'skirt', label: 'Skirt' },
    ] },
  { key: 'pantsColor', label: 'Bottoms color', kind: 'color',
    options: OUTFIT_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'shoes', label: 'Shoes', kind: 'shape',
    options: [
      { id: 'sneakers', label: 'Sneakers' },
      { id: 'boots', label: 'Boots' },
      { id: 'sandals', label: 'Sandals' },
      { id: 'barefoot', label: 'Barefoot' },
    ] },
  { key: 'shoesColor', label: 'Shoes color', kind: 'color',
    options: OUTFIT_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'eyeColor', label: 'Eye color', kind: 'color',
    options: EYE_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'expression', label: 'Expression', kind: 'shape',
    options: EXPRESSIONS.map((e) => ({ id: e.id, label: e.label })) },
  { key: 'mark', label: 'Marks and scars', kind: 'shape',
    options: BEAUTY_MARKS.map((m) => ({ id: m.id, label: m.label })) },
  { key: 'topPattern', label: 'Top pattern', kind: 'shape',
    options: PATTERNS.map((m) => ({ id: m.id, label: m.label })) },
  { key: 'topColor2', label: 'Top second color', kind: 'color',
    options: OUTFIT_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'bottomPattern', label: 'Bottoms pattern', kind: 'shape',
    options: PATTERNS.filter((m) => m.id !== 'raglan' && m.id !== 'colorblock').map((m) => ({ id: m.id, label: m.label })) },
  { key: 'bottomColor2', label: 'Bottoms second color', kind: 'color',
    options: OUTFIT_COLORS.map((c) => ({ id: c.id, label: c.label, swatch: c.value })) },
  { key: 'bg', label: 'Background', kind: 'color',
    options: BG_STYLES.map((b) => ({ id: b.id, label: b.label, swatch: b.to })) },
];

export const VALID_OPTION_IDS: ValidChoices = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.options.map((o) => o.id)]),
) as ValidChoices;

function pickOption(category: Category, level: number): string {
  const allowed = category.options.filter((o) => (o.minLevel ?? 1) <= level);
  const pool = allowed.length > 0 ? allowed : category.options;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function randomAvatarConfig(level: number): AvatarConfig {
  const config = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, pickOption(c, level)]),
  ) as unknown as AvatarConfig;
  // Extras most faces go without: keep them rare so a roll looks like a person.
  if (Math.random() < 0.75) config.facialHair = 'none';
  if (Math.random() < 0.8) config.mark = 'none';
  config.expression = 'auto';
  const sliders: Sliders = {};
  for (const id of SLIDER_IDS) {
    const v = randomSlider(id);
    if (v) sliders[id] = v;
  }
  config.sliders = sliders;
  return config;
}

export function optionLocked(option: OptionItem, level: number): boolean {
  return (option.minLevel ?? 1) > level;
}

// ---------------------------------------------------------------- editor tabs

/** One block of a tab: preset chips, sliders, choices or colors. */
export type EditorSection =
  | { kind: 'presets'; title: string; presets: Preset[]; owns: SliderId[] }
  | { kind: 'sliders'; title: string; sliders: SliderId[] }
  | { kind: 'choice'; title: string; category: AvatarChoiceKey }
  | { kind: 'color'; title: string; category: AvatarChoiceKey; custom: boolean }
  | { kind: 'note'; title: string; text: string };

export type EditorView = 'face' | 'head' | 'full-body';

export interface EditorTab {
  key: string;
  label: string;
  /** How close the preview stands when the tab opens. */
  view: EditorView;
  sections: EditorSection[];
}

/**
 * The ten tabs. Everything listed here changes the 3D avatar today. What
 * needs new 3D models (hairstyles, garments, accessories) is named in a
 * note on its tab instead of being offered as choices that do nothing.
 */
export const EDITOR_TABS: EditorTab[] = [
  { key: 'face', label: 'Face', view: 'face', sections: [
    { kind: 'presets', title: 'Face shape', presets: FACE_PRESETS, owns: FACE_SLIDERS },
    { kind: 'sliders', title: 'Fine-tune', sliders: FACE_SLIDERS },
  ] },
  { key: 'eyes', label: 'Eyes', view: 'face', sections: [
    { kind: 'presets', title: 'Eye shape', presets: EYE_PRESETS, owns: EYE_SLIDERS },
    { kind: 'color', title: 'Eye color', category: 'eyeColor', custom: true },
    { kind: 'sliders', title: 'Fine-tune eyes', sliders: EYE_SLIDERS },
    { kind: 'presets', title: 'Eyebrows', presets: BROW_PRESETS, owns: BROW_SLIDERS },
    { kind: 'sliders', title: 'Fine-tune brows', sliders: BROW_SLIDERS },
  ] },
  { key: 'mouth', label: 'Nose & mouth', view: 'face', sections: [
    { kind: 'presets', title: 'Nose', presets: NOSE_PRESETS, owns: NOSE_SLIDERS },
    { kind: 'sliders', title: 'Fine-tune nose', sliders: NOSE_SLIDERS },
    { kind: 'presets', title: 'Mouth', presets: MOUTH_PRESETS, owns: MOUTH_SLIDERS },
    { kind: 'sliders', title: 'Fine-tune mouth', sliders: MOUTH_SLIDERS },
    { kind: 'note', title: 'Nose and ears', text: 'This is an anime face: the nose is small, so turn the avatar to the side to see nose changes. Ear shapes need a model with sculpted ears.' },
  ] },
  { key: 'skin', label: 'Skin', view: 'face', sections: [
    { kind: 'color', title: 'Skin tone', category: 'skin', custom: true },
    { kind: 'sliders', title: 'Details', sliders: SKIN_SLIDERS },
  ] },
  { key: 'hair', label: 'Hair', view: 'head', sections: [
    { kind: 'color', title: 'Hair color', category: 'hairColor', custom: true },
    { kind: 'sliders', title: 'Shape', sliders: HAIR_SLIDERS },
    { kind: 'note', title: 'Hairstyles', text: 'Each hairstyle is its own 3D model. More styles appear here as VRoid models are added to the app.' },
  ] },
  { key: 'body', label: 'Body', view: 'full-body', sections: [
    { kind: 'presets', title: 'Body type', presets: BODY_PRESETS, owns: BODY_SLIDERS },
    { kind: 'sliders', title: 'Proportions', sliders: BODY_SLIDERS },
  ] },
  { key: 'clothing', label: 'Clothing', view: 'full-body', sections: [
    { kind: 'color', title: 'Top color', category: 'outfitColor', custom: true },
    { kind: 'choice', title: 'Top pattern', category: 'topPattern' },
    { kind: 'color', title: 'Top second color', category: 'topColor2', custom: true },
    { kind: 'color', title: 'Bottoms color', category: 'pantsColor', custom: true },
    { kind: 'choice', title: 'Bottoms pattern', category: 'bottomPattern' },
    { kind: 'color', title: 'Bottoms second color', category: 'bottomColor2', custom: true },
    { kind: 'color', title: 'Shoes color', category: 'shoesColor', custom: true },
    { kind: 'sliders', title: 'Fit', sliders: CLOTHES_SLIDERS },
    { kind: 'note', title: 'More garments', text: 'The model wears a T-shirt, shorts and sneakers. Hoodies, jackets, trousers, skirts and other shoes each need a 3D garment and appear here as models are added.' },
  ] },
  { key: 'accessories', label: 'Accessories', view: 'head', sections: [
    { kind: 'note', title: 'Coming with 3D models', text: 'Glasses, hats, jewelry, watches and bags are 3D objects that have to be modeled and fitted to the head and hands. None are in the app yet, so there is nothing to pick here for now.' },
  ] },
  { key: 'details', label: 'Details', view: 'face', sections: [
    { kind: 'choice', title: 'Facial hair', category: 'facialHair' },
    { kind: 'choice', title: 'Marks and scars', category: 'mark' },
    { kind: 'note', title: 'Tattoos and makeup', text: 'Facial hair and marks are painted on the skin in the hair color. Tattoos and makeup use the same painting and come next.' },
  ] },
  { key: 'personality', label: 'Personality', view: 'full-body', sections: [
    { kind: 'choice', title: 'Expression', category: 'expression' },
    { kind: 'choice', title: 'Pose', category: 'pose' },
    { kind: 'sliders', title: 'Posture', sliders: ['posture'] },
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
  return syncLegacyBody(next);
}

/** Roll new values for one tab only. */
export function randomizeTab(config: AvatarConfig, tab: EditorTab, level: number): AvatarConfig {
  const { choices, sliders } = tabFields(tab);
  const next = { ...config, sliders: { ...config.sliders } } as AvatarConfig;
  const record = next as unknown as Record<AvatarChoiceKey, string>;
  for (const key of choices) record[key] = pickOption(categoryFor(key), level);
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
  return syncLegacyBody(next);
}

/**
 * The 2D fallback avatar only knows five builds and three heights: keep
 * those fields close to what the sliders say.
 */
export function syncLegacyBody(config: AvatarConfig): AvatarConfig {
  const s = config.sliders;
  const h = s.height ?? 0;
  const height = h < -0.33 ? 'short' : h > 0.33 ? 'tall' : 'medium';
  const fat = s.bodyFat ?? 0;
  const muscle = s.muscle ?? 0;
  const bodyBuild =
    (s.shoulders ?? 0) > 0.6 || muscle > 0.7 ? 'broad'
    : (s.hips ?? 0) > 0.5 ? 'curvy'
    : muscle > 0.3 ? 'athletic'
    : fat < -0.4 ? 'slim'
    : 'average';
  return config.height === height && config.bodyBuild === bodyBuild ? config : { ...config, height, bodyBuild };
}

export function categoryFor(key: AvatarChoiceKey): Category {
  const found = CATEGORIES.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown avatar category ${key}`);
  return found;
}
