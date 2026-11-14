// Fine-grained avatar customization: proportion sliders, the presets built
// from them, expressions and painted details. Pure data with no React
// Native imports, so the 3D viewer (avatar3d/viewer.ts) bundles the same
// definitions the editor shows.
//
// Every slider runs from -1 to 1 (or 0 to 1 for amounts), 0 is the
// model as VRoid made it. A preset is a named set of slider values: picking
// "Heart-shaped" moves the face sliders, and the sliders stay free to tweak.

export type SliderId =
  // Face
  | 'faceWidth' | 'faceLength' | 'jawWidth' | 'jawAngle' | 'chinWidth' | 'chinLength'
  | 'cheekbones' | 'cheekFull'
  // Eyes and brows
  | 'eyeSize' | 'eyeWidth' | 'eyeHeight' | 'eyeSpacing' | 'eyeTilt' | 'eyeY' | 'eyelid' | 'irisSize'
  | 'browY' | 'browSpacing' | 'browTilt' | 'browThick' | 'browLength'
  // Nose and mouth
  | 'noseLength' | 'noseWidth' | 'noseBridge' | 'noseTip' | 'noseProjection'
  | 'mouthWidth' | 'mouthHeight' | 'mouthY' | 'mouthCorners'
  // Skin details (amounts, 0..1)
  | 'freckles' | 'blush' | 'underEye'
  // Hair
  | 'hairVolume' | 'hairLength'
  // Body
  | 'height' | 'shoulders' | 'chest' | 'waist' | 'hips' | 'armLength' | 'legLength'
  | 'torsoLength' | 'neckLength' | 'neckThick' | 'headSize' | 'muscle' | 'bodyFat' | 'posture'
  // Clothes
  | 'topFit' | 'bottomFit';

export type Sliders = Partial<Record<SliderId, number>>;

export interface SliderDef {
  id: SliderId;
  label: string;
  /** Words at the two ends of the track. */
  low: string;
  high: string;
  /** 0 for amounts (freckles), -1 for everything else. */
  min: 0 | -1;
}

const s = (id: SliderId, label: string, low = 'Less', high = 'More', min: 0 | -1 = -1): SliderDef => ({ id, label, low, high, min });

export const SLIDERS: SliderDef[] = [
  s('faceWidth', 'Face width', 'Narrow', 'Wide'),
  s('faceLength', 'Face length', 'Short', 'Long'),
  s('jawWidth', 'Jaw width', 'Narrow', 'Wide'),
  s('jawAngle', 'Jaw angle', 'Soft', 'Square'),
  s('chinWidth', 'Chin width', 'Pointed', 'Broad'),
  s('chinLength', 'Chin length', 'Short', 'Long'),
  s('cheekbones', 'Cheekbones', 'Flat', 'High'),
  s('cheekFull', 'Cheek fullness', 'Hollow', 'Full'),

  s('eyeSize', 'Eye size', 'Small', 'Large'),
  s('eyeWidth', 'Eye width', 'Narrow', 'Wide'),
  s('eyeHeight', 'Eye height', 'Slim', 'Tall'),
  s('eyeSpacing', 'Distance between eyes', 'Close', 'Wide'),
  s('eyeTilt', 'Eye angle', 'Down', 'Up'),
  s('eyeY', 'Eye position', 'Low', 'High'),
  s('eyelid', 'Upper eyelid', 'Open', 'Heavy'),
  s('irisSize', 'Iris size', 'Small', 'Large'),
  s('browY', 'Brow height', 'Low', 'High'),
  s('browSpacing', 'Distance between brows', 'Close', 'Far'),
  s('browTilt', 'Brow angle', 'Down', 'Up'),
  s('browThick', 'Brow thickness', 'Thin', 'Thick'),
  s('browLength', 'Brow length', 'Short', 'Long'),

  s('noseLength', 'Nose length', 'Short', 'Long'),
  s('noseWidth', 'Nose width', 'Narrow', 'Wide'),
  s('noseBridge', 'Bridge height', 'Low', 'High'),
  s('noseTip', 'Tip rotation', 'Down', 'Up'),
  s('noseProjection', 'Nose projection', 'Flat', 'Pointed'),
  s('mouthWidth', 'Mouth width', 'Narrow', 'Wide'),
  s('mouthHeight', 'Mouth height', 'Thin', 'Full'),
  s('mouthY', 'Mouth position', 'Low', 'High'),
  s('mouthCorners', 'Mouth corners', 'Down', 'Up'),

  s('freckles', 'Freckles', 'None', 'Lots', 0),
  s('blush', 'Blush', 'None', 'Rosy', 0),
  s('underEye', 'Under-eye circles', 'None', 'Deep', 0),

  s('hairVolume', 'Hair volume', 'Flat', 'Full'),
  s('hairLength', 'Hair length', 'Shorter', 'Longer'),

  s('height', 'Height', 'Short', 'Tall'),
  s('shoulders', 'Shoulder width', 'Narrow', 'Broad'),
  s('chest', 'Chest size', 'Small', 'Large'),
  s('waist', 'Waist size', 'Slim', 'Wide'),
  s('hips', 'Hip width', 'Narrow', 'Wide'),
  s('armLength', 'Arm length', 'Short', 'Long'),
  s('legLength', 'Leg length', 'Short', 'Long'),
  s('torsoLength', 'Torso length', 'Short', 'Long'),
  s('neckLength', 'Neck length', 'Short', 'Long'),
  s('neckThick', 'Neck thickness', 'Thin', 'Thick'),
  s('headSize', 'Head-to-body ratio', 'Smaller head', 'Bigger head'),
  s('muscle', 'Muscle mass', 'Lean', 'Muscular'),
  s('bodyFat', 'Body fat', 'Low', 'High'),
  s('posture', 'Posture', 'Slouched', 'Upright'),

  s('topFit', 'Top fit', 'Fitted', 'Oversized'),
  s('bottomFit', 'Bottoms fit', 'Fitted', 'Relaxed'),
];

export const SLIDER_IDS = SLIDERS.map((d) => d.id);

export function sliderDef(id: SliderId): SliderDef {
  const d = SLIDERS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown slider ${id}`);
  return d;
}

/** Read a slider, clamped to its range; missing is 0. */
export function sv(sliders: Sliders | undefined, id: SliderId): number {
  const v = sliders?.[id];
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  const min = id === 'freckles' || id === 'blush' || id === 'underEye' ? 0 : -1;
  return Math.max(min, Math.min(1, v));
}

/** Coerce stored JSON into sliders: known ids, numbers in range, 2 decimals, zeros dropped. */
export function sanitizeSliders(raw: unknown): Sliders {
  const out: Sliders = {};
  if (!raw || typeof raw !== 'object') return out;
  const rec = raw as Record<string, unknown>;
  for (const id of SLIDER_IDS) {
    if (typeof rec[id] !== 'number') continue;
    const v = Math.round(sv(rec as Sliders, id) * 100) / 100;
    if (v !== 0) out[id] = v;
  }
  return out;
}

// ---------------------------------------------------------------- presets

export interface Preset {
  id: string;
  label: string;
  values: Sliders;
}

/** Slider groups a preset family owns: picking a preset resets these first. */
export const FACE_SLIDERS: SliderId[] = ['faceWidth', 'faceLength', 'jawWidth', 'jawAngle', 'chinWidth', 'chinLength', 'cheekbones', 'cheekFull'];
export const EYE_SLIDERS: SliderId[] = ['eyeSize', 'eyeWidth', 'eyeHeight', 'eyeSpacing', 'eyeTilt', 'eyeY', 'eyelid', 'irisSize'];
export const BROW_SLIDERS: SliderId[] = ['browY', 'browSpacing', 'browTilt', 'browThick', 'browLength'];
export const NOSE_SLIDERS: SliderId[] = ['noseLength', 'noseWidth', 'noseBridge', 'noseTip', 'noseProjection'];
export const MOUTH_SLIDERS: SliderId[] = ['mouthWidth', 'mouthHeight', 'mouthY', 'mouthCorners'];
export const SKIN_SLIDERS: SliderId[] = ['freckles', 'blush', 'underEye'];
export const HAIR_SLIDERS: SliderId[] = ['hairVolume', 'hairLength'];
export const BODY_SLIDERS: SliderId[] = ['height', 'shoulders', 'chest', 'waist', 'hips', 'armLength', 'legLength', 'torsoLength', 'neckLength', 'neckThick', 'headSize', 'muscle', 'bodyFat'];
export const CLOTHES_SLIDERS: SliderId[] = ['topFit', 'bottomFit'];

const p = (id: string, label: string, values: Sliders): Preset => ({ id, label, values });

export const FACE_PRESETS: Preset[] = [
  p('balanced', 'Balanced', {}),
  p('oval', 'Oval', { faceLength: 0.3, jawWidth: -0.3, chinWidth: -0.2 }),
  p('round', 'Round', { faceWidth: 0.5, faceLength: -0.4, jawAngle: -0.6, cheekFull: 0.6, chinLength: -0.3 }),
  p('square', 'Square', { faceWidth: 0.3, jawWidth: 0.6, jawAngle: 0.9, chinWidth: 0.6 }),
  p('oblong', 'Oblong', { faceLength: 0.8, faceWidth: -0.3, jawAngle: 0.3 }),
  p('heart', 'Heart-shaped', { cheekbones: 0.6, jawWidth: -0.6, chinWidth: -0.7, chinLength: 0.2 }),
  p('diamond', 'Diamond', { cheekbones: 0.9, jawWidth: -0.5, chinWidth: -0.6, faceLength: 0.2 }),
  p('triangle', 'Triangle', { jawWidth: 0.7, jawAngle: 0.4, cheekbones: -0.5, chinWidth: 0.3 }),
  p('inverted-triangle', 'Inverted triangle', { cheekbones: 0.7, faceWidth: 0.2, jawWidth: -0.7, chinWidth: -0.5 }),
  p('long-oval', 'Long oval', { faceLength: 0.9, jawWidth: -0.3, chinLength: 0.4 }),
  p('wide-oval', 'Wide oval', { faceWidth: 0.6, jawWidth: -0.1, cheekFull: 0.3 }),
  p('soft-square', 'Soft square', { jawWidth: 0.4, jawAngle: 0.4, cheekFull: 0.3 }),
  p('angular-square', 'Angular square', { jawWidth: 0.6, jawAngle: 1, cheekbones: 0.4, cheekFull: -0.5 }),
  p('narrow', 'Narrow', { faceWidth: -0.7, jawWidth: -0.3 }),
  p('broad', 'Broad', { faceWidth: 0.8, jawWidth: 0.4, cheekbones: 0.3 }),
  p('tapered', 'Tapered', { jawWidth: -0.4, chinWidth: -0.9, chinLength: 0.5 }),
  p('chubby', 'Chubby', { faceWidth: 0.5, cheekFull: 1, jawAngle: -0.7, chinLength: -0.2 }),
  p('slim', 'Slim', { faceWidth: -0.5, cheekFull: -0.7, cheekbones: 0.3 }),
  p('baby', 'Baby face', { faceLength: -0.6, cheekFull: 0.7, chinLength: -0.6, jawAngle: -0.5 }),
  p('defined-jaw', 'Defined jaw', { jawAngle: 1, jawWidth: 0.3, cheekFull: -0.6, chinLength: 0.2 }),
  p('v-shaped', 'V-shaped', { jawWidth: -0.8, chinWidth: -0.8, chinLength: 0.5, cheekFull: -0.3 }),
  p('u-shaped', 'U-shaped', { jawWidth: 0.1, jawAngle: -0.4, chinWidth: 0.4 }),
  p('pear', 'Pear-shaped', { jawWidth: 0.9, cheekFull: 0.5, cheekbones: -0.6, chinWidth: 0.4 }),
  p('high-cheekbone', 'High-cheekbone', { cheekbones: 1, cheekFull: -0.4 }),
];

export const EYE_PRESETS: Preset[] = [
  p('balanced', 'Balanced', {}),
  p('almond', 'Almond', { eyeWidth: 0.3, eyeHeight: -0.3, eyeTilt: 0.2 }),
  p('round', 'Round', { eyeHeight: 0.6, eyeWidth: -0.1, irisSize: 0.2 }),
  p('hooded', 'Hooded', { eyelid: 0.55, eyeHeight: -0.2 }),
  p('monolid', 'Monolid', { eyeHeight: -0.6, eyeWidth: 0.2, eyelid: 0.3 }),
  p('upturned', 'Upturned', { eyeTilt: 0.7 }),
  p('downturned', 'Downturned', { eyeTilt: -0.7 }),
  p('deep-set', 'Deep-set', { eyeSize: -0.3, eyelid: 0.3, eyeY: -0.2 }),
  p('protruding', 'Protruding', { eyeSize: 0.3, eyeHeight: 0.3, eyelid: -0.5 }),
  p('wide-set', 'Wide-set', { eyeSpacing: 0.8 }),
  p('close-set', 'Close-set', { eyeSpacing: -0.8 }),
  p('narrow', 'Narrow', { eyeHeight: -0.8 }),
  p('large', 'Large', { eyeSize: 0.8 }),
  p('small', 'Small', { eyeSize: -0.7 }),
  p('doe', 'Doe eyes', { eyeSize: 0.6, eyeHeight: 0.5, irisSize: 0.4, eyeTilt: -0.2 }),
  p('cat', 'Cat eyes', { eyeTilt: 0.8, eyeWidth: 0.4, eyeHeight: -0.3 }),
  p('fox', 'Fox eyes', { eyeTilt: 1, eyeWidth: 0.6, eyeHeight: -0.6, eyelid: 0.2 }),
  p('sleepy', 'Sleepy eyes', { eyelid: 0.8, eyeTilt: -0.2 }),
  p('droopy', 'Droopy', { eyeTilt: -1, eyelid: 0.4 }),
  p('slanted', 'Slanted', { eyeTilt: 0.5, eyeHeight: -0.4 }),
  p('straight', 'Straight', { eyeTilt: 0, eyeWidth: 0.4, eyeHeight: -0.2 }),
  p('tapered', 'Tapered', { eyeWidth: 0.6, eyeHeight: -0.5, eyeTilt: 0.3 }),
  p('prominent', 'Prominent', { eyeSize: 0.5, irisSize: 0.5, eyelid: -0.4 }),
  p('heavy-lidded', 'Heavy-lidded', { eyelid: 1 }),
];

export const BROW_PRESETS: Preset[] = [
  p('natural', 'Natural', {}),
  p('straight', 'Straight', { browTilt: 0, browLength: 0.2 }),
  p('soft-arch', 'Soft arch', { browTilt: 0.25 }),
  p('high-arch', 'High arch', { browTilt: 0.5, browY: 0.4 }),
  p('low-arch', 'Low arch', { browTilt: 0.15, browY: -0.4 }),
  p('angled', 'Angled', { browTilt: 0.7 }),
  p('sharp-angled', 'Sharp angled', { browTilt: 1, browThick: 0.2 }),
  p('thick-straight', 'Thick straight', { browThick: 0.9, browLength: 0.3 }),
  p('thin-straight', 'Thin straight', { browThick: -0.8, browLength: 0.2 }),
  p('bushy', 'Bushy', { browThick: 1, browLength: 0.4, browSpacing: -0.3 }),
  p('feathered', 'Feathered', { browThick: 0.4, browY: 0.2 }),
  p('tapered', 'Tapered', { browThick: -0.3, browLength: 0.5 }),
  p('flat', 'Flat', { browTilt: -0.2, browLength: 0.3 }),
  p('dramatic', 'Dramatic', { browThick: 0.7, browTilt: 0.8, browLength: 0.5 }),
  p('raised', 'Raised', { browY: 0.9 }),
  p('drooping', 'Drooping', { browTilt: -0.8, browY: -0.2 }),
  p('close', 'Close together', { browSpacing: -0.9 }),
  p('far', 'Far apart', { browSpacing: 0.9 }),
  p('short', 'Short', { browLength: -0.8 }),
  p('low', 'Low and heavy', { browY: -0.9, browThick: 0.5 }),
];

export const NOSE_PRESETS: Preset[] = [
  p('balanced', 'Balanced', {}),
  p('straight', 'Straight', { noseBridge: 0.4, noseTip: 0 }),
  p('roman', 'Roman', { noseBridge: 0.9, noseLength: 0.4, noseTip: -0.3 }),
  p('greek', 'Greek', { noseBridge: 0.8, noseProjection: 0.4 }),
  p('nubian', 'Nubian', { noseWidth: 0.8, noseLength: 0.3, noseBridge: -0.2 }),
  p('aquiline', 'Aquiline', { noseBridge: 1, noseTip: -0.6, noseProjection: 0.5 }),
  p('button', 'Button', { noseLength: -0.6, noseProjection: -0.3, noseWidth: 0.2 }),
  p('snub', 'Snub', { noseTip: 0.8, noseLength: -0.5 }),
  p('upturned', 'Upturned', { noseTip: 0.6 }),
  p('downturned', 'Downturned', { noseTip: -0.7 }),
  p('broad', 'Broad', { noseWidth: 0.9 }),
  p('narrow', 'Narrow', { noseWidth: -0.8 }),
  p('long', 'Long', { noseLength: 0.9 }),
  p('short', 'Short', { noseLength: -0.8 }),
  p('flat', 'Flat', { noseProjection: -0.9, noseBridge: -0.6 }),
  p('pointed', 'Pointed', { noseProjection: 0.9, noseWidth: -0.4 }),
];

export const MOUTH_PRESETS: Preset[] = [
  p('balanced', 'Balanced', {}),
  p('full', 'Full lips', { mouthHeight: 0.8 }),
  p('thin', 'Thin lips', { mouthHeight: -0.7 }),
  p('wide', 'Wide mouth', { mouthWidth: 0.8 }),
  p('narrow', 'Narrow mouth', { mouthWidth: -0.7 }),
  p('small', 'Small mouth', { mouthWidth: -0.6, mouthHeight: -0.4 }),
  p('large', 'Large mouth', { mouthWidth: 0.6, mouthHeight: 0.6 }),
  p('upturned', 'Upturned', { mouthCorners: 0.7 }),
  p('downturned', 'Downturned', { mouthCorners: -0.7 }),
  p('wide-smile', 'Wide smile', { mouthWidth: 0.7, mouthCorners: 0.8 }),
  p('subtle-smile', 'Subtle smile', { mouthCorners: 0.35 }),
  p('high', 'Set high', { mouthY: 0.7 }),
  p('low', 'Set low', { mouthY: -0.7 }),
];

/**
 * Body types. Muscle and body fat are separate sliders, so a slim
 * athletic build and a large muscular one never share a preset.
 */
export const BODY_PRESETS: (Preset & { build: 'slim' | 'athletic' | 'average' | 'curvy' | 'broad' })[] = [
  { ...p('balanced', 'Balanced', {}), build: 'average' },
  { ...p('very-slim', 'Very slim', { bodyFat: -1, muscle: -0.6, waist: -0.5, shoulders: -0.3, hips: -0.3 }), build: 'slim' },
  { ...p('slim', 'Slim', { bodyFat: -0.6, muscle: -0.3, waist: -0.3 }), build: 'slim' },
  { ...p('lean', 'Lean', { bodyFat: -0.7, muscle: 0.2, waist: -0.3 }), build: 'slim' },
  { ...p('athletic', 'Athletic', { muscle: 0.5, shoulders: 0.4, bodyFat: -0.4, waist: -0.2 }), build: 'athletic' },
  { ...p('toned', 'Toned', { muscle: 0.35, bodyFat: -0.5 }), build: 'athletic' },
  { ...p('fit', 'Fit', { muscle: 0.4, bodyFat: -0.3, shoulders: 0.2 }), build: 'athletic' },
  { ...p('muscular', 'Muscular', { muscle: 0.8, shoulders: 0.6, chest: 0.5, neckThick: 0.4, waist: -0.1 }), build: 'broad' },
  { ...p('bodybuilder', 'Bodybuilder', { muscle: 1, shoulders: 1, chest: 0.9, neckThick: 0.8, waist: -0.3, bodyFat: -0.4 }), build: 'broad' },
  { ...p('broad-shoulders', 'Broad-shouldered', { shoulders: 0.9 }), build: 'broad' },
  { ...p('narrow-shoulders', 'Narrow-shouldered', { shoulders: -0.8 }), build: 'slim' },
  { ...p('average', 'Average', { bodyFat: 0.1 }), build: 'average' },
  { ...p('soft', 'Soft build', { bodyFat: 0.5, muscle: -0.3, waist: 0.3 }), build: 'average' },
  { ...p('stocky', 'Stocky', { bodyFat: 0.4, muscle: 0.4, height: -0.5, legLength: -0.3, neckThick: 0.4 }), build: 'broad' },
  { ...p('compact', 'Compact', { height: -0.6, torsoLength: -0.3, muscle: 0.2 }), build: 'average' },
  { ...p('heavyset', 'Heavyset', { bodyFat: 0.8, waist: 0.7, chest: 0.4, neckThick: 0.5 }), build: 'broad' },
  { ...p('plus-size', 'Plus-size', { bodyFat: 1, waist: 0.9, hips: 0.6, chest: 0.5 }), build: 'curvy' },
  { ...p('curvy', 'Curvy', { hips: 0.8, chest: 0.5, waist: -0.4, bodyFat: 0.2 }), build: 'curvy' },
  { ...p('pear', 'Pear-shaped', { hips: 1, shoulders: -0.4, waist: 0.1 }), build: 'curvy' },
  { ...p('apple', 'Apple-shaped', { waist: 1, chest: 0.3, hips: -0.2, bodyFat: 0.4 }), build: 'average' },
  { ...p('rectangle', 'Rectangle-shaped', { waist: 0.3, hips: -0.2, shoulders: -0.1 }), build: 'average' },
  { ...p('hourglass', 'Hourglass', { chest: 0.7, hips: 0.7, waist: -0.8 }), build: 'curvy' },
  { ...p('inverted-triangle', 'Inverted triangle', { shoulders: 0.9, chest: 0.4, hips: -0.6 }), build: 'broad' },
  { ...p('v-shaped', 'V-shaped', { shoulders: 1, muscle: 0.6, waist: -0.6, hips: -0.3 }), build: 'athletic' },
];

/** The preset whose values match the sliders exactly, if any. */
export function matchingPreset(presets: Preset[], owned: SliderId[], sliders: Sliders): string | null {
  for (const preset of presets) {
    if (owned.every((id) => Math.abs(sv(sliders, id) - (preset.values[id] ?? 0)) < 0.005)) return preset.id;
  }
  return null;
}

/** Sliders with one family replaced by a preset's values. */
export function applyPreset(sliders: Sliders, owned: SliderId[], preset: Preset): Sliders {
  const next: Sliders = { ...sliders };
  for (const id of owned) delete next[id];
  for (const [id, v] of Object.entries(preset.values) as [SliderId, number][]) if (v) next[id] = v;
  return next;
}

// ---------------------------------------------------------------- expressions

/**
 * Facial expressions from the model's own blend shapes: VRM presets
 * (happy, angry, sad, relaxed, surprised, blink) and VRoid's per-part
 * shapes (brows, eyes, mouth). 'auto' follows the day's mood.
 */
export interface ExpressionDef {
  id: string;
  label: string;
  /** VRM expression preset weights. */
  vrm?: Record<string, number>;
  /** VRoid morph weights by short name (Fcl_BRW_Angry → BRW_Angry). */
  morphs?: Record<string, number>;
}

export const EXPRESSIONS: ExpressionDef[] = [
  { id: 'auto', label: 'Follows your day' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'happy', label: 'Happy', vrm: { happy: 0.6 } },
  { id: 'big-smile', label: 'Big smile', vrm: { happy: 1 } },
  { id: 'slight-smile', label: 'Slight smile', vrm: { relaxed: 0.3 }, morphs: { MTH_Fun: 0.35 } },
  { id: 'laughing', label: 'Laughing', vrm: { happy: 0.9, aa: 0.5 } },
  { id: 'sad', label: 'Sad', vrm: { sad: 0.7 } },
  { id: 'angry', label: 'Angry', vrm: { angry: 0.8 } },
  { id: 'confident', label: 'Confident', vrm: { relaxed: 0.2 }, morphs: { BRW_Angry: 0.35, MTH_Fun: 0.4 } },
  { id: 'surprised', label: 'Surprised', vrm: { surprised: 0.8 } },
  { id: 'shocked', label: 'Shocked', vrm: { surprised: 1, aa: 0.4 } },
  { id: 'serious', label: 'Serious', vrm: { angry: 0.35 } },
  { id: 'focused', label: 'Focused', morphs: { BRW_Angry: 0.5, EYE_Angry: 0.3, MTH_Close: 0.4 } },
  { id: 'relaxed', label: 'Relaxed', vrm: { relaxed: 0.7 } },
  { id: 'sleepy', label: 'Sleepy', vrm: { relaxed: 0.3 }, morphs: { EYE_Close: 0.55, BRW_Sorrow: 0.3 } },
  { id: 'tired', label: 'Tired', vrm: { relaxed: 0.6, sad: 0.25 } },
  { id: 'excited', label: 'Excited', vrm: { happy: 0.7, surprised: 0.3 } },
  { id: 'determined', label: 'Determined', morphs: { BRW_Angry: 0.6, MTH_Close: 0.6, EYE_Angry: 0.15 } },
  { id: 'shy', label: 'Shy', vrm: { relaxed: 0.4 }, morphs: { BRW_Sorrow: 0.5, MTH_Small: 0.5 } },
  { id: 'worried', label: 'Worried', morphs: { BRW_Sorrow: 0.8, MTH_Sorrow: 0.3 } },
  { id: 'curious', label: 'Curious', morphs: { BRW_Surprised: 0.6, MTH_Small: 0.3 } },
  { id: 'proud', label: 'Proud', morphs: { EYE_Joy: 0.6, MTH_Fun: 0.6, BRW_Fun: 0.4 } },
  { id: 'peaceful', label: 'Peaceful', vrm: { relaxed: 0.5 }, morphs: { EYE_Close: 0.8 } },
];

// ---------------------------------------------------------------- painted details

/** Facial hair, painted on the face's skin in the hair color. */
export const FACIAL_HAIR_3D: { id: string; label: string }[] = [
  { id: 'none', label: 'Clean-shaven' },
  { id: 'stubble-light', label: 'Light stubble' },
  { id: 'stubble', label: 'Medium stubble' },
  { id: 'stubble-heavy', label: 'Heavy stubble' },
  { id: 'short-beard', label: 'Short beard' },
  { id: 'beard', label: 'Full beard' },
  { id: 'boxed', label: 'Boxed beard' },
  { id: 'faded', label: 'Faded beard' },
  { id: 'goatee', label: 'Goatee' },
  { id: 'extended-goatee', label: 'Extended goatee' },
  { id: 'van-dyke', label: 'Van Dyke' },
  { id: 'anchor', label: 'Anchor' },
  { id: 'balbo', label: 'Balbo' },
  { id: 'circle', label: 'Circle beard' },
  { id: 'chin-strap', label: 'Chin strap' },
  { id: 'mutton-chops', label: 'Mutton chops' },
  { id: 'mustache', label: 'Mustache only' },
  { id: 'pencil', label: 'Pencil mustache' },
  { id: 'horseshoe', label: 'Horseshoe mustache' },
  { id: 'chevron', label: 'Chevron mustache' },
  { id: 'soul-patch', label: 'Soul patch' },
];

export const BEAUTY_MARKS: { id: string; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'cheek', label: 'Cheek' },
  { id: 'cheekbone', label: 'Cheekbone' },
  { id: 'lip', label: 'Above the lip' },
  { id: 'chin', label: 'Chin' },
  { id: 'eye', label: 'Under the eye' },
  { id: 'scar-cheek', label: 'Cheek scar' },
  { id: 'scar-brow', label: 'Eyebrow scar' },
  { id: 'scar-chin', label: 'Chin scar' },
];

export const PATTERNS: { id: string; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'stripes', label: 'Striped' },
  { id: 'wide-stripes', label: 'Wide stripes' },
  { id: 'pinstripe', label: 'Pinstripe' },
  { id: 'checks', label: 'Checked' },
  { id: 'gingham', label: 'Gingham' },
  { id: 'dots', label: 'Polka dots' },
  { id: 'camo', label: 'Camouflage' },
  { id: 'colorblock', label: 'Color block' },
  { id: 'raglan', label: 'Raglan sleeves' },
];

// ---------------------------------------------------------------- random

/** A gentle random value for a slider: mostly near the middle. */
export function randomSlider(id: SliderId, rand: () => number = Math.random): number {
  const min = sliderDef(id).min;
  if (min === 0) return Math.round(Math.max(0, rand() * 1.2 - 0.4) * 100) / 100;
  const v = (rand() + rand() - 1) * 0.8;
  return Math.round(v * 100) / 100;
}
