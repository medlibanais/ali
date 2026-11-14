import * as fs from 'fs';
import * as path from 'path';

import {
  CATEGORIES,
  EDITOR_TABS,
  fitToSex,
  LOOKS,
  optionsFor,
  randomAvatarConfig,
  randomizeTab,
  resetTab,
  tabFields,
  VALID_OPTION_IDS,
} from '../options';
import { AvatarConfig, DEFAULT_AVATAR, Mood, readAvatarDoc, sanitizeAvatarConfig, suggestFuture, writeAvatarDoc } from '../types';
import {
  applyPreset,
  BODY_PRESETS,
  EXPRESSIONS,
  EYE_PRESETS,
  EYE_SLIDERS,
  FACE_PRESETS,
  FACE_SLIDERS,
  matchingPreset,
  sanitizeSliders,
  SLIDER_IDS,
} from '../custom';
import { partsFor, skinFor, targetsFor, wornOutfit } from '../shape';
import { BOTTOMS, BROW_STYLES, FEATURES, fits, GLASSES, HAIR_STYLES, LASH_STYLES, OUTFITS, Sex, SHOES, TOPS } from '../wardrobe';

const SEXES: Sex[] = ['female', 'male'];

/** The JSON header of the model file the viewer loads. */
function modelHeader(): { targets: Record<string, unknown>; proxies: Record<string, unknown>; skins: Record<string, unknown> } {
  const file = path.join(__dirname, '../../../assets/avatar3d/models/human.bin');
  const fd = fs.openSync(file, 'r');
  const len = Buffer.alloc(4);
  fs.readSync(fd, len, 0, 4, 0);
  const json = Buffer.alloc(len.readUInt32LE(0));
  fs.readSync(fd, json, 0, json.length, 4);
  fs.closeSync(fd);
  return JSON.parse(json.toString('utf8'));
}

describe('avatar editor tabs', () => {
  it('follow the creator layout, presets first', () => {
    expect(EDITOR_TABS.map((t) => t.key)).toEqual([
      'presets', 'face', 'eyes', 'nose', 'mouth', 'hair', 'skin', 'body', 'outfit', 'accessories', 'style',
    ]);
  });

  it('show each choice and each slider in one place only', () => {
    const choices = EDITOR_TABS.flatMap((t) => tabFields(t).choices);
    const sliders = EDITOR_TABS.flatMap((t) => tabFields(t).sliders);
    expect(new Set(choices).size).toBe(choices.length);
    expect(new Set(sliders).size).toBe(sliders.length);
    expect([...sliders].sort()).toEqual([...SLIDER_IDS].sort());
  });

  it('have a catalog for every config field', () => {
    const fields = Object.keys(DEFAULT_AVATAR).filter((k) => k !== 'sliders').sort();
    expect(CATEGORIES.map((c) => c.key).sort()).toEqual(fields);
  });

  it('reset one tab without touching the others', () => {
    const face = EDITOR_TABS.find((t) => t.key === 'face')!;
    const faceSlider = tabFields(face).sliders[0];
    const config: AvatarConfig = { ...DEFAULT_AVATAR, skin: 'deep-2', sliders: { [faceSlider]: 0.5, muscle: 0.8 } };
    const reset = resetTab(config, face, DEFAULT_AVATAR);
    expect(reset.sliders[faceSlider]).toBeUndefined();
    expect(reset.sliders.muscle).toBe(0.8);
    expect(reset.skin).toBe('deep-2');
  });

  it('randomize one tab without changing the body or other tabs', () => {
    const hair = EDITOR_TABS.find((t) => t.key === 'hair')!;
    for (let i = 0; i < 20; i++) {
      const next = randomizeTab({ ...DEFAULT_AVATAR, sex: 'male', sliders: { muscle: 0.4 } }, hair, 99);
      expect(next.sex).toBe('male');
      expect(next.skin).toBe(DEFAULT_AVATAR.skin);
      expect(next.sliders.muscle).toBe(0.4);
      expect(VALID_OPTION_IDS.hair).toContain(next.hair);
    }
  });

  it('roll whole avatars that are valid and dressed for their body', () => {
    for (let i = 0; i < 40; i++) {
      const config = randomAvatarConfig(99);
      expect(sanitizeAvatarConfig(config, VALID_OPTION_IDS)).toEqual(config);
      for (const v of Object.values(config.sliders)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
      const worn = wornOutfit(config);
      for (const item of [worn.outfit, worn.top, worn.bottom]) if (item) expect(fits(item, config.sex)).toBe(true);
    }
  });
});

describe('body-aware choices', () => {
  it('only offer clothes cut for the body', () => {
    for (const sex of SEXES) {
      const outfits = optionsFor('outfit', sex).map((o) => o.id);
      expect(outfits).toContain('separates');
      expect(outfits.some((id) => id.startsWith(sex === 'male' ? 'f_' : 'm_'))).toBe(false);
      expect(optionsFor('top', sex).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('swap clothes that do not fit when the body changes', () => {
    const male = fitToSex({ ...DEFAULT_AVATAR, sex: 'male', outfit: 'f_sport', top: 'tank' });
    expect(optionsFor('outfit', 'male').map((o) => o.id)).toContain(male.outfit);
    expect(optionsFor('top', 'male').map((o) => o.id)).toContain(male.top);
  });

  it('never leave the avatar bare', () => {
    const bad: AvatarConfig = { ...DEFAULT_AVATAR, sex: 'male', outfit: 'f_blouse_skirt', top: 'tank', bottom: 'nope' };
    const worn = wornOutfit(bad);
    expect(worn.outfit).toBeNull();
    expect(worn.top && fits(worn.top, 'male')).toBe(true);
    expect(worn.bottom).not.toBeNull();
    const ids = partsFor(bad).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['eyes', 'teeth', worn.top!.id, worn.bottom!.id, bad.shoes]));
  });

  it('give every ready-made character a valid config', () => {
    expect(LOOKS.length).toBeGreaterThanOrEqual(12);
    for (const look of LOOKS) {
      expect(sanitizeAvatarConfig(look.config, VALID_OPTION_IDS)).toEqual(look.config);
      expect(fitToSex(look.config)).toEqual(look.config);
    }
  });
});

describe('the model file', () => {
  const header = modelHeader();

  it('has every mesh the wardrobe can ask for', () => {
    const ids = [...HAIR_STYLES, ...BROW_STYLES, ...LASH_STYLES, ...OUTFITS, ...TOPS, ...BOTTOMS, ...SHOES, ...GLASSES]
      .map((i) => i.id)
      .filter((id) => id !== 'none' && id !== 'separates');
    for (const id of ['eyes', 'teeth', 'tongue', ...ids]) expect(Object.keys(header.proxies)).toContain(id);
  });

  it('has a skin for every tone and body', () => {
    for (const sex of SEXES) {
      for (const skin of VALID_OPTION_IDS.skin) {
        expect(Object.keys(header.skins)).toContain(skinFor({ ...DEFAULT_AVATAR, sex, skin }).id);
      }
    }
  });

  it('has every shape a slider, feature, mood or expression can use', () => {
    const used = new Set<string>();
    const collect = (config: AvatarConfig, mood: Mood = 'happy', closed = false) => {
      for (const name of Object.keys(targetsFor(config, mood, closed))) used.add(name);
    };
    for (const sex of SEXES) {
      const base: AvatarConfig = { ...DEFAULT_AVATAR, sex };
      for (const f of FEATURES) collect({ ...base, features: f.id });
      for (const id of SLIDER_IDS) for (const v of [-1, -0.5, 0.5, 1]) collect({ ...base, sliders: { [id]: v } });
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
        collect({ ...base, sliders: { muscle: a, weight: b, height: c, proportions: c, cup: a, firmness: b } });
      }
      for (const e of EXPRESSIONS) collect({ ...base, expression: e.id });
      for (const mood of ['tired', 'neutral', 'happy', 'glowing'] as Mood[]) collect(base, mood, true);
    }
    expect(used.size).toBeGreaterThan(150);
    const missing = [...used].filter((name) => !(name in header.targets));
    expect(missing).toEqual([]);
  });
});

describe('presets', () => {
  it('give 20+ faces, eyes and bodies', () => {
    expect(FACE_PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(EYE_PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(BODY_PRESETS.length).toBeGreaterThanOrEqual(20);
  });

  it('apply to their own sliders only, and are recognised afterwards', () => {
    const start = { muscle: 0.6 };
    const preset = FACE_PRESETS[3];
    const next = applyPreset(start, FACE_SLIDERS, preset);
    expect(next.muscle).toBe(0.6);
    expect(matchingPreset(FACE_PRESETS, FACE_SLIDERS, next)).toBe(preset.id);
    expect(matchingPreset(EYE_PRESETS, EYE_SLIDERS, next)).toBe(EYE_PRESETS[0].id);
  });
});

describe('saved avatars', () => {
  it('drop unknown values and clamp sliders', () => {
    const config = sanitizeAvatarConfig({ hair: 'mohawk-9000', skin: '#aabbcc', sex: 'male', sliders: { muscle: 7, bogus: 1, weight: 'x' } }, VALID_OPTION_IDS);
    expect(config.hair).toBe(DEFAULT_AVATAR.hair);
    expect(config.skin).toBe('#aabbcc');
    expect(config.sex).toBe('male');
    expect(config.sliders).toEqual({ muscle: 1 });
    expect(sanitizeSliders(null)).toEqual({});
  });

  it('load an avatar saved before the realistic model', () => {
    const old = { look: 'anime', hair: 'spiky', hairColor: 'copper', outfitColor: 'teal', pantsColor: 'black', facialHair: 'beard', sliders: { faceWidth: 0.5 }, v: 2 };
    const doc = readAvatarDoc(old, VALID_OPTION_IDS);
    expect(doc.current.hairColor).toBe('copper');
    expect(doc.current.topColor).toBe('teal');
    expect(doc.current.bottomColor).toBe('black');
    expect(doc.current.hair).toBe(DEFAULT_AVATAR.hair);
    expect(doc.current.sliders).toEqual({});
    expect(doc.future).toBeNull();
  });

  it('round-trip Current You, Future You and saved looks', () => {
    const current: AvatarConfig = { ...DEFAULT_AVATAR, sex: 'male', hair: 'short02', sliders: { weight: 0.3 } };
    const future = suggestFuture(current);
    expect(future.sex).toBe('male');
    expect(future.sliders.muscle).toBeGreaterThan(0);
    const looks = Array.from({ length: 9 }, (_, i) => ({ name: `Look ${i}`, config: current }));
    const saved = writeAvatarDoc({ current, future, looks });
    // The current avatar stays at the top level for plain readers.
    expect(sanitizeAvatarConfig(saved, VALID_OPTION_IDS)).toEqual(current);
    const back = readAvatarDoc(JSON.parse(JSON.stringify(saved)), VALID_OPTION_IDS);
    expect(back.current).toEqual(current);
    expect(back.future).toEqual(future);
    expect(back.looks).toHaveLength(6);
  });
});
