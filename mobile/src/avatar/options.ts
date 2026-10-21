// Creator option catalogs + unlock rules.

import type { AvatarConfig } from './types';
import { BG_STYLES, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from './palettes';
import {
  BROW_STYLES,
  EYE_STYLES,
  FACE_SHAPES,
  FACIAL_HAIR_STYLES,
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
  key: keyof AvatarConfig;
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
  { key: 'facialHair', label: 'Beard', kind: 'shape',
    options: FACIAL_HAIR_STYLES.map((o) => ({ id: o.id, label: o.label })) },
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
    options: OUTFIT_COLORS.slice(0, 6).map((c) => ({
      id: c.id,
      label: c.label,
      swatch: c.value,
    })) },
  { key: 'bg', label: 'Background', kind: 'color',
    options: BG_STYLES.map((b) => ({ id: b.id, label: b.label, swatch: b.to })) },
];

export const VALID_OPTION_IDS: { [K in keyof AvatarConfig]: string[] } =
  Object.fromEntries(
    CATEGORIES.map((c) => [c.key, c.options.map((o) => o.id)]),
  ) as { [K in keyof AvatarConfig]: string[] };

const ALL: string[] = [
  ...FACE_SHAPES.map((o) => o.id),
  ...SKIN_TONES.map((o) => o.id),
  ...HAIR_STYLES.map((o) => o.id),
  ...HAIR_COLORS.map((o) => o.id),
  ...EYE_STYLES.map((o) => o.id),
  ...BROW_STYLES.map((o) => o.id),
  ...NOSE_STYLES.map((o) => o.id),
  ...MOUTH_STYLES.map((o) => o.id),
  ...FACIAL_HAIR_STYLES.map((o) => o.id),
  ...GLASSES_STYLES.map((o) => o.id),
  ...HEADWEAR_STYLES.map((o) => o.id),
  ...OUTFIT_STYLES.map((o) => o.id),
  ...OUTFIT_COLORS.map((o) => o.id),
  'slim', 'athletic', 'average', 'curvy', 'broad',
  'short', 'medium', 'tall',
  'standing', 'hip', 'arms-crossed', 'wave',
  'pants', 'joggers', 'shorts', 'skirt',
  'sneakers', 'boots', 'sandals', 'barefoot',
  ...BG_STYLES.map((o) => o.id),
];

export function randomAvatarConfig(level: number): AvatarConfig {
  const pick = (category: Category): string => {
    const allowed = category.options.filter(
      (o) => (o.minLevel ?? 1) <= level,
    );
    const pool = allowed.length > 0 ? allowed : category.options;
    return pool[Math.floor(Math.random() * pool.length)].id;
  };
  const config = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, pick(c)]),
  ) as unknown as AvatarConfig;
  return config;
}

export function optionLocked(option: OptionItem, level: number): boolean {
  return (option.minLevel ?? 1) > level;
}

export const TOTAL_OPTIONS = ALL.length;

/**
 * Editor tabs: related categories share a tab (a style and its color),
 * and each tab says which view of the avatar shows its choices best.
 */
export interface EditorGroup {
  key: string;
  label: string;
  categories: (keyof AvatarConfig)[];
  view: 'head' | 'full-body';
}

export const EDITOR_GROUPS: EditorGroup[] = [
  { key: 'face', label: 'Face', categories: ['face', 'skin'], view: 'head' },
  { key: 'hair', label: 'Hairstyle', categories: ['hair', 'hairColor'], view: 'head' },
  { key: 'eyes', label: 'Eyes', categories: ['eyes', 'brows'], view: 'head' },
  { key: 'mouth', label: 'Nose & mouth', categories: ['nose', 'mouth'], view: 'head' },
  { key: 'beard', label: 'Beard', categories: ['facialHair'], view: 'head' },
  { key: 'extras', label: 'Glasses & hats', categories: ['glasses', 'headwear'], view: 'head' },
  { key: 'outfit', label: 'Outfit', categories: ['outfit', 'outfitColor'], view: 'full-body' },
  { key: 'bottoms', label: 'Bottoms', categories: ['bottoms', 'pantsColor'], view: 'full-body' },
  { key: 'shoes', label: 'Shoes', categories: ['shoes', 'shoesColor'], view: 'full-body' },
  { key: 'body', label: 'Body', categories: ['bodyBuild', 'height', 'pose'], view: 'full-body' },
  { key: 'bg', label: 'Background', categories: ['bg'], view: 'head' },
];

export function categoryFor(key: keyof AvatarConfig): Category {
  const found = CATEGORIES.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown avatar category ${key}`);
  return found;
}
