// Fine-grained avatar customization: the sliders that shape the realistic
// human, the presets built from them, and expressions. Pure data with no
// React Native imports.
//
// A slider runs from -1 to 1 (or 0 to 1 for amounts); 0 leaves the body
// as it is. Each slider blends MakeHuman shape targets stored in the
// model file (assets/avatar3d/models/core.bin, from human.bin): `neg` at the low end,
// `pos` at the high end. A preset is a named set of slider values, so
// picking "Heart" moves the face sliders and they stay free to tweak.

export type SliderId = string;
export type Sliders = Record<SliderId, number>;

/** Whole-body sliders that mix several targets (see shape.ts). */
export type Macro = 'muscle' | 'weight' | 'height' | 'proportions' | 'cup' | 'firmness';

export interface SliderDef {
  id: SliderId;
  label: string;
  /** Words at the two ends of the track. */
  low: string;
  high: string;
  /** 0 for amounts, -1 for everything else. */
  min: 0 | -1;
  neg?: string;
  pos?: string;
  macro?: Macro;
}

/** A two-ended slider over a pair of targets, `<target>-<lo>` and `<target>-<hi>`. */
const t = (id: string, label: string, target: string, low = 'Less', high = 'More', lo = 'decr', hi = 'incr'): SliderDef => ({
  id, label, low, high, min: -1, neg: `${target}-${lo}`, pos: `${target}-${hi}`,
});
/** A one-ended amount over a single target. */
const amount = (id: string, label: string, target: string): SliderDef => ({ id, label, low: 'None', high: 'Full', min: 0, pos: target });
const macro = (id: Macro, label: string, low: string, high: string): SliderDef => ({ id, label, low, high, min: -1, macro: id });

const HEAD: SliderDef[] = [
  amount('shapeOval', 'Oval', 'head-oval'),
  amount('shapeRound', 'Round', 'head-round'),
  amount('shapeSquare', 'Square', 'head-square'),
  amount('shapeRect', 'Rectangular', 'head-rectangular'),
  amount('shapeHeart', 'Heart', 'head-invertedtriangular'),
  amount('shapeTriangle', 'Triangle', 'head-triangular'),
  amount('shapeDiamond', 'Diamond', 'head-diamond'),
  t('headWidth', 'Face width', 'head-scale-horiz', 'Narrow', 'Wide'),
  t('headHeight', 'Face length', 'head-scale-vert', 'Short', 'Long'),
  t('headDepth', 'Head depth', 'head-scale-depth', 'Shallow', 'Deep'),
  t('headFat', 'Face fullness', 'head-fat', 'Lean', 'Full'),
  t('headAge', 'Face age', 'head-age', 'Younger', 'Older'),
  t('headAngle', 'Profile angle', 'head-angle', 'In', 'Out', 'in', 'out'),
  t('foreheadHeight', 'Forehead height', 'forehead-scale-vert', 'Low', 'High'),
  t('foreheadSlope', 'Forehead slope', 'forehead-nubian', 'Flat', 'Round'),
  t('foreheadDepth', 'Forehead', 'forehead-trans', 'Back', 'Forward', 'backward', 'forward'),
  t('temples', 'Temples', 'forehead-temple', 'Narrow', 'Wide'),
];
const CHEEKS: SliderDef[] = [
  t('cheekbones', 'Cheekbones', 'cheek-bones', 'Flat', 'High'),
  t('cheekVolume', 'Cheek fullness', 'cheek-volume', 'Hollow', 'Full'),
  t('cheekInner', 'Inner cheeks', 'cheek-inner', 'Flat', 'Full'),
  t('cheekHeight', 'Cheek position', 'cheek-trans', 'Low', 'High', 'down', 'up'),
];
const JAW: SliderDef[] = [
  t('chinWidth', 'Chin width', 'chin-width', 'Pointed', 'Broad'),
  t('chinHeight', 'Chin length', 'chin-height', 'Short', 'Long'),
  t('chinProminent', 'Chin projection', 'chin-prominent', 'Back', 'Forward'),
  t('chinBones', 'Jaw width', 'chin-bones', 'Narrow', 'Wide'),
  t('chinCleft', 'Chin cleft', 'chin-cleft', 'Smooth', 'Cleft'),
  t('jawDrop', 'Jaw drop', 'chin-jaw-drop', 'High', 'Low'),
  t('jawForward', 'Lower jaw', 'chin-prognathism', 'Back', 'Forward'),
  amount('chinTriangle', 'Tapered chin', 'chin-triangle'),
];
const NECK: SliderDef[] = [
  t('neckWidth', 'Neck width', 'neck-scale-horiz', 'Thin', 'Thick'),
  t('neckDepth', 'Neck depth', 'neck-scale-depth', 'Thin', 'Thick'),
  t('neckLength', 'Neck length', 'neck-scale-vert', 'Short', 'Long'),
  t('neckDouble', 'Under the chin', 'neck-double', 'Tight', 'Full'),
];
const EARS: SliderDef[] = [
  t('earSize', 'Ear size', 'ear-scale', 'Small', 'Large'),
  t('earWing', 'Ear angle', 'ear-wing', 'Flat', 'Out'),
  t('earLobe', 'Earlobe', 'ear-lobe', 'Small', 'Large'),
  t('earFlap', 'Ear fold', 'ear-flap', 'Thin', 'Thick'),
  t('earHeight', 'Ear position', 'ear-trans', 'Low', 'High', 'down', 'up'),
];
const EYES: SliderDef[] = [
  t('eyeSize', 'Eye size', 'eye-scale', 'Small', 'Large'),
  t('eyeOpen', 'Eye opening', 'eye-height2', 'Narrow', 'Open'),
  t('eyeInnerHeight', 'Inner height', 'eye-height1', 'Low', 'High'),
  t('eyeOuterHeight', 'Outer height', 'eye-height3', 'Low', 'High'),
  t('eyeY', 'Eye position', 'eye-trans', 'Low', 'High', 'down', 'up'),
  t('eyeOuterCorner', 'Outer corner', 'eye-corner1', 'Down', 'Up', 'down', 'up'),
  t('eyeInnerCorner', 'Inner corner', 'eye-corner2', 'Down', 'Up', 'down', 'up'),
  t('eyeDepthInner', 'Inner depth', 'eye-push1', 'Deep', 'Forward', 'in', 'out'),
  t('eyeDepthOuter', 'Outer depth', 'eye-push2', 'Deep', 'Forward', 'in', 'out'),
  t('eyeFoldAngle', 'Eyelid fold angle', 'eye-eyefold-angle', 'Down', 'Up', 'down', 'up'),
  t('eyeFold', 'Eyelid fold', 'eye-eyefold', 'Low', 'High', 'down', 'up'),
  t('eyeFoldShape', 'Eyelid shape', 'eye-eyefold', 'Hollow', 'Full', 'concave', 'convex'),
  t('epicanthus', 'Inner eyelid', 'eye-epicanthus', 'Covered', 'Open', 'in', 'out'),
  t('eyeBags', 'Under-eye', 'eye-bag', 'Smooth', 'Heavy'),
  t('eyeBagDepth', 'Under-eye depth', 'eye-bag', 'In', 'Out', 'in', 'out'),
  t('eyeBagHeight', 'Under-eye height', 'eye-bag-height', 'Low', 'High'),
];
const BROWS: SliderDef[] = [
  t('browAngle', 'Brow angle', 'eyebrows-angle', 'Down', 'Up', 'down', 'up'),
  t('browHeight', 'Brow height', 'eyebrows-trans', 'Low', 'High', 'down', 'up'),
  t('browDepth', 'Brow ridge', 'eyebrows-trans', 'Back', 'Forward', 'backward', 'forward'),
];
const NOSE: SliderDef[] = [
  t('noseWidth', 'Nose width', 'nose-scale-horiz', 'Narrow', 'Wide'),
  t('noseLength', 'Nose length', 'nose-scale-vert', 'Short', 'Long'),
  t('noseDepth', 'Nose projection', 'nose-scale-depth', 'Flat', 'Pointed'),
  t('noseBridgeWidth', 'Bridge width', 'nose-width1', 'Narrow', 'Wide'),
  t('noseMidWidth', 'Middle width', 'nose-width2', 'Narrow', 'Wide'),
  t('noseTipWidth', 'Lower width', 'nose-width3', 'Narrow', 'Wide'),
  t('noseCurve', 'Bridge curve', 'nose-curve', 'Scooped', 'Arched', 'concave', 'convex'),
  t('noseHump', 'Bridge bump', 'nose-hump', 'Smooth', 'Bump'),
  t('noseGreek', 'Bridge to forehead', 'nose-greek', 'Notched', 'Straight'),
  t('noseTip', 'Tip rotation', 'nose-point', 'Down', 'Up', 'down', 'up'),
  t('noseTipSize', 'Tip size', 'nose-point-width', 'Fine', 'Round'),
  t('nostrilWidth', 'Nostril width', 'nose-nostrils-width', 'Narrow', 'Wide'),
  t('nostrilFlare', 'Nostril flare', 'nose-flaring', 'Tight', 'Flared'),
  t('nostrilAngle', 'Nostril angle', 'nose-nostrils-angle', 'Down', 'Up', 'down', 'up'),
  t('noseBase', 'Nose base', 'nose-base', 'Low', 'High', 'down', 'up'),
  t('noseSeptum', 'Septum angle', 'nose-septumangle', 'Down', 'Up'),
  t('noseVolume', 'Nose volume', 'nose-volume', 'Slim', 'Full'),
  t('noseCompress', 'Nose press', 'nose-compression', 'Pressed', 'Free', 'compress', 'uncompress'),
  t('noseY', 'Nose position', 'nose-trans', 'Low', 'High', 'down', 'up'),
  t('noseZ', 'Nose depth', 'nose-trans', 'Back', 'Forward', 'backward', 'forward'),
];
const MOUTH: SliderDef[] = [
  t('mouthWidth', 'Mouth width', 'mouth-scale-horiz', 'Narrow', 'Wide'),
  t('mouthHeight', 'Mouth height', 'mouth-scale-vert', 'Thin', 'Full'),
  t('mouthDepth', 'Mouth depth', 'mouth-scale-depth', 'Flat', 'Forward'),
  t('upperLipVolume', 'Upper lip fullness', 'mouth-upperlip-volume', 'Thin', 'Full'),
  t('upperLipHeight', 'Upper lip height', 'mouth-upperlip-height', 'Short', 'Tall'),
  t('upperLipWidth', 'Upper lip width', 'mouth-upperlip-width', 'Narrow', 'Wide'),
  t('lowerLipVolume', 'Lower lip fullness', 'mouth-lowerlip-volume', 'Thin', 'Full'),
  t('lowerLipHeight', 'Lower lip height', 'mouth-lowerlip-height', 'Short', 'Tall'),
  t('lowerLipWidth', 'Lower lip width', 'mouth-lowerlip-width', 'Narrow', 'Wide'),
  t('cupidsBow', "Cupid's bow", 'mouth-cupidsbow', 'Flat', 'Defined'),
  t('cupidsBowWidth', "Cupid's bow width", 'mouth-cupidsbow-width', 'Narrow', 'Wide'),
  t('mouthCorners', 'Mouth corners', 'mouth-angles', 'Down', 'Up', 'down', 'up'),
  t('upperLipMiddle', 'Upper lip middle', 'mouth-upperlip-middle', 'Down', 'Up', 'down', 'up'),
  t('lowerLipMiddle', 'Lower lip middle', 'mouth-lowerlip-middle', 'Down', 'Up', 'down', 'up'),
  t('upperLipEdge', 'Upper lip edges', 'mouth-upperlip-ext', 'Down', 'Up', 'down', 'up'),
  t('lowerLipEdge', 'Lower lip edges', 'mouth-lowerlip-ext', 'Down', 'Up', 'down', 'up'),
  t('dimples', 'Dimples', 'mouth-dimples', 'In', 'Out', 'in', 'out'),
  t('laughLines', 'Laugh lines', 'mouth-laugh-lines', 'In', 'Out', 'in', 'out'),
  t('philtrum', 'Philtrum', 'mouth-philtrum-volume', 'Flat', 'Deep'),
  t('mouthY', 'Mouth position', 'mouth-trans', 'Low', 'High', 'down', 'up'),
  t('mouthZ', 'Mouth forward', 'mouth-trans', 'Back', 'Forward', 'backward', 'forward'),
];
const BODY_MAIN: SliderDef[] = [
  macro('height', 'Height', 'Short', 'Tall'),
  macro('weight', 'Weight', 'Light', 'Heavy'),
  macro('muscle', 'Muscle', 'Soft', 'Muscular'),
  macro('proportions', 'Proportions', 'Natural', 'Idealized'),
];
const CHEST: SliderDef[] = [
  macro('cup', 'Bust size', 'Small', 'Large'),
  macro('firmness', 'Bust shape', 'Soft', 'Firm'),
];
const TORSO: SliderDef[] = [
  t('vShape', 'Shoulder to waist', 'torso-vshape', 'Straight', 'V-shape'),
  t('pectorals', 'Chest muscle', 'torso-muscle-pectoral', 'Flat', 'Built'),
  t('dorsi', 'Back muscle', 'torso-muscle-dorsi', 'Flat', 'Built'),
  t('torsoWidth', 'Torso width', 'torso-scale-horiz', 'Narrow', 'Wide'),
  t('torsoDepth', 'Torso depth', 'torso-scale-depth', 'Thin', 'Deep'),
  t('torsoLength', 'Torso length', 'torso-scale-vert', 'Short', 'Long'),
  t('stomachTone', 'Stomach', 'stomach-tone', 'Soft', 'Toned'),
  t('belly', 'Belly', 'stomach-pregnant', 'Flat', 'Round'),
  t('hipWidth', 'Hip width', 'hip-scale-horiz', 'Narrow', 'Wide'),
  t('hipDepth', 'Hip depth', 'hip-scale-depth', 'Thin', 'Deep'),
  t('hipLength', 'Hip height', 'hip-scale-vert', 'Short', 'Long'),
  t('waistHeight', 'Waistline', 'hip-waist', 'Low', 'High', 'down', 'up'),
  t('buttocks', 'Buttocks', 'buttocks-volume', 'Flat', 'Full'),
];
const LIMBS: SliderDef[] = [
  t('shoulderMuscle', 'Shoulders', 'upperarm-shoulder-muscle', 'Slim', 'Broad'),
  t('upperArmMuscle', 'Upper arm muscle', 'upperarm-muscle', 'Slim', 'Built'),
  t('upperArmFat', 'Upper arm fullness', 'upperarm-fat', 'Lean', 'Full'),
  t('lowerArmMuscle', 'Forearm muscle', 'lowerarm-muscle', 'Slim', 'Built'),
  t('lowerArmFat', 'Forearm fullness', 'lowerarm-fat', 'Lean', 'Full'),
  t('upperLegMuscle', 'Thigh muscle', 'upperleg-muscle', 'Slim', 'Built'),
  t('upperLegFat', 'Thigh fullness', 'upperleg-fat', 'Lean', 'Full'),
  t('lowerLegMuscle', 'Calf muscle', 'lowerleg-muscle', 'Slim', 'Built'),
  t('lowerLegFat', 'Calf fullness', 'lowerleg-fat', 'Lean', 'Full'),
  t('upperLegLength', 'Thigh length', 'upperlegs-height', 'Short', 'Long'),
  t('lowerLegLength', 'Lower leg length', 'lowerlegs-height', 'Short', 'Long'),
  t('handSize', 'Hand size', 'hand-scale', 'Small', 'Large'),
  t('footSize', 'Foot size', 'foot-scale', 'Small', 'Large'),
];

export const SLIDERS: SliderDef[] = [...HEAD, ...CHEEKS, ...JAW, ...NECK, ...EARS, ...EYES, ...BROWS, ...NOSE, ...MOUTH, ...BODY_MAIN, ...CHEST, ...TORSO, ...LIMBS];
export const SLIDER_IDS = SLIDERS.map((d) => d.id);
const BY_ID = new Map(SLIDERS.map((d) => [d.id, d]));

export function sliderDef(id: SliderId): SliderDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown slider ${id}`);
  return def;
}

/** A slider's value, 0 when unset. */
export function sv(sliders: Sliders | undefined, id: SliderId): number {
  return sliders?.[id] ?? 0;
}

/** Keep known sliders with sane values; zeros are left out. */
export function sanitizeSliders(raw: unknown): Sliders {
  const out: Sliders = {};
  if (!raw || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  for (const def of SLIDERS) {
    const v = record[def.id];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const clamped = Math.round(Math.max(def.min, Math.min(1, v)) * 100) / 100;
    if (clamped) out[def.id] = clamped;
  }
  return out;
}

const ids = (defs: SliderDef[]) => defs.map((d) => d.id);
export const HEAD_SLIDERS = ids(HEAD);
export const CHEEK_SLIDERS = ids(CHEEKS);
export const JAW_SLIDERS = ids(JAW);
export const NECK_SLIDERS = ids(NECK);
export const EAR_SLIDERS = ids(EARS);
export const FACE_SLIDERS = [...HEAD_SLIDERS, ...CHEEK_SLIDERS, ...JAW_SLIDERS];
export const EYE_SLIDERS = ids(EYES);
export const BROW_SLIDERS = ids(BROWS);
export const NOSE_SLIDERS = ids(NOSE);
export const MOUTH_SLIDERS = ids(MOUTH);
export const BODY_MAIN_SLIDERS = ids(BODY_MAIN);
export const CHEST_SLIDERS = ids(CHEST);
export const TORSO_SLIDERS = ids(TORSO);
export const LIMB_SLIDERS = ids(LIMBS);
export const BODY_SLIDERS = [...BODY_MAIN_SLIDERS, ...CHEST_SLIDERS, ...TORSO_SLIDERS, ...LIMB_SLIDERS];

// ---------------------------------------------------------------- presets

export interface Preset {
  id: string;
  label: string;
  /** Values for the sliders the preset owns; the rest of them go to 0. */
  values: Sliders;
}
const p = (id: string, label: string, values: Sliders = {}): Preset => ({ id, label, values });

export const FACE_PRESETS: Preset[] = [
  p('natural', 'Natural'),
  p('oval', 'Oval', { shapeOval: 1 }),
  p('round', 'Round', { shapeRound: 1, headFat: 0.2 }),
  p('square', 'Square', { shapeSquare: 1 }),
  p('rectangular', 'Rectangular', { shapeRect: 1 }),
  p('heart', 'Heart', { shapeHeart: 1 }),
  p('triangle', 'Triangle', { shapeTriangle: 1 }),
  p('diamond', 'Diamond', { shapeDiamond: 1 }),
  p('long', 'Long', { headHeight: 0.6, shapeRect: 0.3 }),
  p('short', 'Short', { headHeight: -0.6, shapeRound: 0.3 }),
  p('narrow', 'Narrow', { headWidth: -0.6, cheekbones: 0.2 }),
  p('wide', 'Wide', { headWidth: 0.6 }),
  p('soft', 'Soft', { headFat: 0.6, cheekVolume: 0.4, chinWidth: 0.2 }),
  p('lean', 'Lean', { headFat: -0.7, cheekbones: 0.5, cheekVolume: -0.4 }),
  p('sculpted', 'Sculpted', { cheekbones: 0.8, cheekVolume: -0.5, chinBones: 0.3, headFat: -0.3 }),
  p('strong-jaw', 'Strong jaw', { shapeSquare: 0.5, chinBones: 0.7, chinWidth: 0.5, chinProminent: 0.3 }),
  p('pointed-chin', 'Pointed chin', { chinWidth: -0.8, chinTriangle: 0.6, shapeHeart: 0.3 }),
  p('long-chin', 'Long chin', { chinHeight: 0.7, chinProminent: 0.3 }),
  p('baby-face', 'Baby face', { headAge: -0.8, shapeRound: 0.5, cheekVolume: 0.5, chinHeight: -0.4 }),
  p('mature', 'Mature', { headAge: 0.6, cheekVolume: -0.2 }),
  p('high-forehead', 'High forehead', { foreheadHeight: 0.8, shapeOval: 0.4 }),
  p('cleft', 'Cleft chin', { chinCleft: 0.9, chinWidth: 0.3, chinBones: 0.3 }),
];

export const EYE_PRESETS: Preset[] = [
  p('natural', 'Natural'),
  p('large', 'Large', { eyeSize: 0.7 }),
  p('small', 'Small', { eyeSize: -0.6 }),
  p('wide-open', 'Wide open', { eyeOpen: 0.8, eyeSize: 0.2 }),
  p('narrow', 'Narrow', { eyeOpen: -0.7 }),
  p('almond', 'Almond', { eyeOuterCorner: 0.4, eyeOpen: -0.2, eyeInnerCorner: -0.2 }),
  p('upturned', 'Upturned', { eyeOuterCorner: 0.9, eyeOuterHeight: 0.4 }),
  p('downturned', 'Downturned', { eyeOuterCorner: -0.8, eyeOuterHeight: -0.3 }),
  p('round', 'Round', { eyeOpen: 0.6, eyeInnerHeight: 0.4, eyeOuterHeight: 0.4 }),
  p('hooded', 'Hooded', { eyeFold: -0.8, eyeFoldShape: 0.5, eyeOpen: -0.2 }),
  p('monolid', 'Monolid', { epicanthus: -0.9, eyeFold: -0.6, eyeFoldShape: 0.6 }),
  p('deep-set', 'Deep-set', { eyeDepthInner: -0.8, eyeDepthOuter: -0.7, browDepth: 0.4 }),
  p('prominent', 'Prominent', { eyeDepthInner: 0.7, eyeDepthOuter: 0.7 }),
  p('high', 'High-set', { eyeY: 0.7 }),
  p('low', 'Low-set', { eyeY: -0.7 }),
  p('sleepy', 'Sleepy', { eyeOpen: -0.5, eyeBags: 0.5, eyeOuterCorner: -0.3 }),
  p('bright', 'Bright', { eyeOpen: 0.5, eyeBags: -0.6, eyeSize: 0.3 }),
  p('cat', 'Cat', { eyeOuterCorner: 1, eyeInnerCorner: -0.5, eyeOpen: -0.3 }),
  p('doe', 'Doe', { eyeSize: 0.6, eyeOpen: 0.5, eyeInnerCorner: -0.3 }),
  p('tired', 'Tired', { eyeBags: 0.9, eyeBagHeight: 0.4, eyeOpen: -0.3 }),
];

export const BROW_PRESETS: Preset[] = [
  p('natural', 'Natural'),
  p('high', 'High', { browHeight: 0.7 }),
  p('low', 'Low', { browHeight: -0.7 }),
  p('arched', 'Lifted', { browAngle: 0.8, browHeight: 0.2 }),
  p('serious', 'Serious', { browAngle: -0.8, browHeight: -0.3 }),
  p('strong-ridge', 'Strong ridge', { browDepth: 0.8, browHeight: -0.2 }),
  p('soft-ridge', 'Soft ridge', { browDepth: -0.7 }),
];

export const NOSE_PRESETS: Preset[] = [
  p('natural', 'Natural'),
  p('small', 'Small', { noseWidth: -0.5, noseLength: -0.4, noseDepth: -0.3 }),
  p('large', 'Large', { noseWidth: 0.4, noseLength: 0.5, noseDepth: 0.5 }),
  p('narrow', 'Narrow', { noseWidth: -0.8, nostrilWidth: -0.5 }),
  p('wide', 'Wide', { noseWidth: 0.8, nostrilWidth: 0.6, nostrilFlare: 0.4 }),
  p('button', 'Button', { noseLength: -0.6, noseTip: 0.6, noseTipSize: 0.5, noseDepth: -0.4 }),
  p('upturned', 'Upturned', { noseTip: 0.9, noseCurve: -0.5 }),
  p('roman', 'Roman', { noseHump: 0.8, noseCurve: 0.6, noseLength: 0.3 }),
  p('aquiline', 'Aquiline', { noseCurve: 0.9, noseTip: -0.6, noseHump: 0.4 }),
  p('straight', 'Straight', { noseGreek: 0.8, noseCurve: 0 }),
  p('snub', 'Snub', { noseLength: -0.7, noseTip: 0.4, noseDepth: -0.6, nostrilWidth: 0.3 }),
  p('long', 'Long', { noseLength: 0.8 }),
  p('short', 'Short', { noseLength: -0.8 }),
  p('pointed', 'Pointed', { noseDepth: 0.8, noseTipSize: -0.7 }),
  p('flat', 'Flat', { noseDepth: -0.8, noseWidth: 0.4, noseBridgeWidth: 0.5 }),
  p('bulbous', 'Round tip', { noseTipSize: 0.9, noseVolume: 0.5 }),
  p('high-bridge', 'High bridge', { noseGreek: 0.6, noseBridgeWidth: -0.4, noseDepth: 0.4 }),
  p('low-bridge', 'Low bridge', { noseGreek: -0.8, noseCurve: -0.4, noseBridgeWidth: 0.4 }),
  p('flared', 'Flared', { nostrilFlare: 0.9, nostrilWidth: 0.5 }),
  p('refined', 'Refined', { noseWidth: -0.4, noseTipSize: -0.5, nostrilWidth: -0.4, noseVolume: -0.4 }),
];

export const MOUTH_PRESETS: Preset[] = [
  p('natural', 'Natural'),
  p('full', 'Full', { upperLipVolume: 0.7, lowerLipVolume: 0.7, mouthHeight: 0.3 }),
  p('thin', 'Thin', { upperLipVolume: -0.7, lowerLipVolume: -0.7, mouthHeight: -0.4 }),
  p('wide', 'Wide', { mouthWidth: 0.8 }),
  p('small', 'Small', { mouthWidth: -0.7, mouthHeight: -0.2 }),
  p('bow', "Cupid's bow", { cupidsBow: 0.9, upperLipHeight: 0.3 }),
  p('heart', 'Heart', { cupidsBow: 0.7, mouthWidth: -0.4, lowerLipVolume: 0.6, upperLipVolume: 0.3 }),
  p('pouty', 'Pouty', { lowerLipVolume: 0.9, mouthDepth: 0.5, upperLipVolume: 0.4 }),
  p('heavy-lower', 'Fuller lower lip', { lowerLipVolume: 0.8, lowerLipHeight: 0.5, upperLipVolume: -0.2 }),
  p('heavy-upper', 'Fuller upper lip', { upperLipVolume: 0.8, upperLipHeight: 0.5, lowerLipVolume: -0.2 }),
  p('upturned', 'Upturned corners', { mouthCorners: 0.8 }),
  p('downturned', 'Downturned corners', { mouthCorners: -0.8 }),
  p('dimpled', 'Dimpled', { dimples: -0.8, mouthCorners: 0.3 }),
  p('flat', 'Straight', { cupidsBow: -0.8, upperLipMiddle: -0.3 }),
  p('round', 'Round', { mouthWidth: -0.5, upperLipVolume: 0.5, lowerLipVolume: 0.6, mouthHeight: 0.4 }),
  p('high', 'High-set', { mouthY: 0.7 }),
  p('low', 'Low-set', { mouthY: -0.7 }),
  p('forward', 'Forward', { mouthZ: 0.7, mouthDepth: 0.4 }),
  p('defined', 'Defined', { cupidsBow: 0.6, philtrum: 0.6, laughLines: -0.4 }),
  p('soft', 'Soft', { cupidsBow: -0.4, upperLipVolume: 0.3, lowerLipVolume: 0.3, laughLines: 0.4 }),
];

export const BODY_PRESETS: Preset[] = [
  p('average', 'Average'),
  p('slim', 'Slim', { weight: -0.6, muscle: -0.2 }),
  p('skinny', 'Skinny', { weight: -1, muscle: -0.6 }),
  p('lean', 'Lean', { weight: -0.5, muscle: 0.4, stomachTone: 0.5 }),
  p('toned', 'Toned', { weight: -0.2, muscle: 0.5, stomachTone: 0.7, proportions: 0.4 }),
  p('athletic', 'Athletic', { muscle: 0.7, weight: -0.1, vShape: 0.5, shoulderMuscle: 0.4, stomachTone: 0.6, proportions: 0.5 }),
  p('muscular', 'Muscular', { muscle: 1, weight: 0.1, vShape: 0.7, pectorals: 0.6, shoulderMuscle: 0.7, upperArmMuscle: 0.6 }),
  p('bodybuilder', 'Bodybuilder', { muscle: 1, weight: 0.3, vShape: 1, pectorals: 1, dorsi: 0.9, shoulderMuscle: 1, upperArmMuscle: 1, upperLegMuscle: 0.9, lowerLegMuscle: 0.7 }),
  p('swimmer', 'Swimmer', { muscle: 0.5, weight: -0.3, vShape: 0.9, dorsi: 0.6, shoulderMuscle: 0.6, height: 0.3 }),
  p('runner', 'Runner', { muscle: 0.3, weight: -0.6, upperLegMuscle: 0.4, lowerLegMuscle: 0.5, stomachTone: 0.6 }),
  p('curvy', 'Curvy', { weight: 0.3, hipWidth: 0.7, buttocks: 0.6, cup: 0.5, waistHeight: 0.3 }),
  p('hourglass', 'Hourglass', { hipWidth: 0.6, cup: 0.5, torsoWidth: -0.3, buttocks: 0.4, proportions: 0.6 }),
  p('pear', 'Pear', { hipWidth: 0.9, buttocks: 0.7, upperLegFat: 0.6, torsoWidth: -0.3 }),
  p('apple', 'Apple', { weight: 0.5, belly: 0.5, torsoWidth: 0.4, hipWidth: -0.2 }),
  p('stocky', 'Stocky', { weight: 0.5, muscle: 0.5, height: -0.4, torsoWidth: 0.5, neckWidth: 0.5 }),
  p('broad', 'Broad', { torsoWidth: 0.7, shoulderMuscle: 0.6, vShape: 0.4, muscle: 0.3 }),
  p('soft', 'Soft', { weight: 0.5, muscle: -0.5, stomachTone: -0.6 }),
  p('heavy', 'Heavy', { weight: 1, muscle: -0.2, belly: 0.4 }),
  p('petite', 'Petite', { height: -0.8, weight: -0.4 }),
  p('tall-slim', 'Tall and slim', { height: 0.8, weight: -0.5, lowerLegLength: 0.4 }),
  p('tall-strong', 'Tall and strong', { height: 0.8, muscle: 0.6, vShape: 0.5, shoulderMuscle: 0.5 }),
  p('long-legs', 'Long legs', { upperLegLength: 0.7, lowerLegLength: 0.7, torsoLength: -0.3 }),
];

/** The preset whose values the owned sliders hold right now, if any. */
export function matchingPreset(presets: Preset[], owned: SliderId[], sliders: Sliders): string | null {
  for (const preset of presets) {
    if (owned.every((id) => Math.abs(sv(sliders, id) - (preset.values[id] ?? 0)) < 0.005)) return preset.id;
  }
  return null;
}

/** Set the owned sliders to a preset; other sliders are untouched. */
export function applyPreset(sliders: Sliders, owned: SliderId[], preset: Preset): Sliders {
  const out: Sliders = { ...sliders };
  for (const id of owned) {
    const v = preset.values[id] ?? 0;
    if (v) out[id] = v;
    else delete out[id];
  }
  return out;
}

// ---------------------------------------------------------------- expressions

export interface ExpressionDef {
  id: string;
  label: string;
  /** Face-unit targets (without the `expr-` prefix; `eye`/`eyebrows` units name a side). */
  units: Record<string, number>;
}

/** Both sides of a left/right unit. */
const lr = (unit: string, v: number): Record<string, number> => {
  const [head, ...rest] = unit.split('-');
  return { [`${head}-left-${rest.join('-')}`]: v, [`${head}-right-${rest.join('-')}`]: v };
};

export const EXPRESSIONS: ExpressionDef[] = [
  { id: 'auto', label: 'Follows your day', units: {} },
  { id: 'neutral', label: 'Neutral', units: {} },
  { id: 'soft-smile', label: 'Soft smile', units: { 'mouth-corner-puller': 0.45 } },
  { id: 'smile', label: 'Smile', units: { 'mouth-corner-puller': 0.8, ...lr('eye-slit', 0.15) } },
  { id: 'big-smile', label: 'Big smile', units: { 'mouth-corner-puller': 1, 'mouth-open': 0.18, 'mouth-upward-retraction': 0.3, ...lr('eye-slit', 0.3) } },
  { id: 'laugh', label: 'Laughing', units: { 'mouth-corner-puller': 1, 'mouth-open': 0.5, ...lr('eye-slit', 0.55), ...lr('eyebrows-up', 0.2) } },
  { id: 'confident', label: 'Confident', units: { 'mouth-corner-puller': 0.35, ...lr('eyebrows-down', 0.15), ...lr('eye-slit', 0.12) } },
  { id: 'determined', label: 'Determined', units: { ...lr('eyebrows-down', 0.6), 'mouth-compression': 0.5, ...lr('eye-slit', 0.2) } },
  { id: 'calm', label: 'Calm', units: { 'mouth-corner-puller': 0.2, ...lr('eye-slit', 0.25) } },
  { id: 'serious', label: 'Serious', units: { ...lr('eyebrows-down', 0.35), 'mouth-compression': 0.25 } },
  { id: 'surprised', label: 'Surprised', units: { ...lr('eyebrows-up', 0.9), ...lr('eye-opened-up', 0.8), 'mouth-open': 0.35 } },
  { id: 'curious', label: 'Curious', units: { 'eyebrows-left-up': 0.8, 'eyebrows-right-down': 0.2, 'mouth-corner-puller': 0.15 } },
  { id: 'sad', label: 'Sad', units: { ...lr('eyebrows-inner-up', 0.9), 'mouth-depression': 0.6 } },
  { id: 'tired', label: 'Tired', units: { ...lr('eye-slit', 0.55), 'mouth-depression': 0.2, ...lr('eyebrows-inner-up', 0.25) } },
  { id: 'angry', label: 'Angry', units: { ...lr('eyebrows-down', 1), 'mouth-compression': 0.6, 'mouth-depression': 0.3 } },
  { id: 'smirk', label: 'Smirk', units: { 'mouth-corner-puller': 0.3, 'mouth-part-later': 0.5, 'eyebrows-left-up': 0.4 } },
  { id: 'wink', label: 'Wink', units: { 'eye-left-closure': 1, 'mouth-corner-puller': 0.6 } },
  { id: 'pout', label: 'Pout', units: { 'mouth-pursing': 0.8, 'mouth-protusion': 0.5 } },
  { id: 'kiss', label: 'Kiss', units: { 'mouth-pursing': 1, 'mouth-protusion': 0.8, ...lr('eye-slit', 0.3) } },
  { id: 'open', label: 'Mouth open', units: { 'mouth-open': 0.6 } },
  { id: 'eyes-closed', label: 'Eyes closed', units: { ...lr('eye-closure', 1), 'mouth-corner-puller': 0.25 } },
];

/** Expression each mood wears when the choice is "Follows your day". */
export const MOOD_EXPRESSION: Record<string, string> = { tired: 'tired', neutral: 'neutral', happy: 'soft-smile', glowing: 'big-smile' };

/** A random value for one slider, biased toward the middle. */
export function randomSlider(id: SliderId, rand: () => number = Math.random): number {
  const def = sliderDef(id);
  if (def.min === 0) return rand() < 0.7 ? 0 : Math.round(rand() * 80) / 100;
  if (rand() < 0.45) return 0;
  const v = (rand() + rand() + rand()) / 3;
  return Math.round((v * 2 - 1) * 0.9 * 100) / 100;
}
