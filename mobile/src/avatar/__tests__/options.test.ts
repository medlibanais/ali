import { CATEGORIES, EDITOR_TABS, randomAvatarConfig, randomizeTab, resetTab, tabFields, VALID_OPTION_IDS } from '../options';
import { DEFAULT_AVATAR, readAvatarDoc, sanitizeAvatarConfig, suggestFuture, writeAvatarDoc } from '../types';
import {
  applyPreset,
  BODY_PRESETS,
  EYE_PRESETS,
  EYE_SLIDERS,
  FACE_PRESETS,
  FACE_SLIDERS,
  matchingPreset,
  sanitizeSliders,
  SLIDER_IDS,
} from '../custom';

describe('avatar editor tabs', () => {
  it('are the ten tabs, Face to Personality', () => {
    expect(EDITOR_TABS.map((t) => t.label)).toEqual([
      'Face', 'Eyes', 'Nose & mouth', 'Skin', 'Hair', 'Body', 'Clothing', 'Accessories', 'Details', 'Personality',
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
    const face = EDITOR_TABS[0];
    const config = { ...DEFAULT_AVATAR, skin: 'deep-2', sliders: { faceWidth: 0.5, muscle: 0.8 } };
    const reset = resetTab(config, face, DEFAULT_AVATAR);
    expect(reset.sliders.faceWidth).toBeUndefined();
    expect(reset.sliders.muscle).toBe(0.8);
    expect(reset.skin).toBe('deep-2');
  });

  it('randomize one tab without touching the others', () => {
    const body = EDITOR_TABS.find((t) => t.key === 'body')!;
    const config = { ...DEFAULT_AVATAR, sliders: { faceWidth: 0.5 } };
    const rolled = randomizeTab(config, body, 1);
    expect(rolled.sliders.faceWidth).toBe(0.5);
    expect(rolled.skin).toBe(config.skin);
  });

  it('never roll a level-locked option', () => {
    for (let i = 0; i < 20; i++) expect(['standing', 'hands-hips', 'arms-raised', 'look-side', 'look-up']).toContain(randomAvatarConfig(1).pose);
  });
});

describe('presets and sliders', () => {
  it('give every preset its own look', () => {
    for (const presets of [FACE_PRESETS, EYE_PRESETS, BODY_PRESETS]) {
      const seen = new Set(presets.map((p) => JSON.stringify(Object.entries(p.values).sort())));
      expect(seen.size).toBe(presets.length);
    }
  });

  it('offer at least 20 face, eye and body presets', () => {
    expect(FACE_PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(EYE_PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(BODY_PRESETS.length).toBeGreaterThanOrEqual(20);
  });

  it('a preset replaces its own sliders and leaves the rest', () => {
    const heart = FACE_PRESETS.find((p) => p.id === 'heart')!;
    const next = applyPreset({ faceWidth: 0.9, eyeSize: 0.4 }, FACE_SLIDERS, heart);
    expect(next.faceWidth).toBeUndefined();
    expect(next.eyeSize).toBe(0.4);
    expect(matchingPreset(FACE_PRESETS, FACE_SLIDERS, next)).toBe('heart');
    expect(matchingPreset(EYE_PRESETS, EYE_SLIDERS, next)).toBeNull();
  });

  it('keep muscle and body fat apart', () => {
    const lean = BODY_PRESETS.find((p) => p.id === 'athletic')!.values;
    const big = BODY_PRESETS.find((p) => p.id === 'bodybuilder')!.values;
    expect(lean.muscle).toBeGreaterThan(0);
    expect(lean.bodyFat).toBeLessThan(0);
    expect(big.muscle).toBeGreaterThan(lean.muscle!);
  });

  it('clean stored sliders', () => {
    expect(sanitizeSliders({ faceWidth: 4, nope: 1, freckles: -1, jawWidth: 'x', eyeSize: 0.123 })).toEqual({ faceWidth: 1, eyeSize: 0.12 });
  });
});

describe('sanitizeAvatarConfig', () => {
  it('fills the new bottoms field for configs saved before it existed', () => {
    const old = { ...DEFAULT_AVATAR } as Record<string, unknown>;
    delete old.bottoms;
    expect(sanitizeAvatarConfig(old, VALID_OPTION_IDS).bottoms).toBe('pants');
  });

  it('drops the art style field configs saved during the style picker had', () => {
    const saved = { ...DEFAULT_AVATAR, artStyle: 'crimson' } as Record<string, unknown>;
    expect('artStyle' in sanitizeAvatarConfig(saved, VALID_OPTION_IDS)).toBe(false);
  });

  it('keeps a valid bottoms choice', () => {
    expect(sanitizeAvatarConfig({ bottoms: 'shorts' }, VALID_OPTION_IDS).bottoms).toBe('shorts');
  });

  it('keeps the body an avatar had before sliders existed', () => {
    const old = { bodyBuild: 'athletic', height: 'tall' };
    const config = sanitizeAvatarConfig(old, VALID_OPTION_IDS);
    expect(config.sliders.muscle).toBeGreaterThan(0);
    expect(config.sliders.height).toBeGreaterThan(0);
    expect(sanitizeAvatarConfig({ ...old, sliders: {} }, VALID_OPTION_IDS).sliders).toEqual({});
  });

  it('accepts custom colors only where a color goes', () => {
    const config = sanitizeAvatarConfig({ skin: '#AABBCC', hairColor: '#12345', pose: '#AABBCC' }, VALID_OPTION_IDS);
    expect(config.skin).toBe('#AABBCC');
    expect(config.hairColor).toBe(DEFAULT_AVATAR.hairColor);
    expect(config.pose).toBe(DEFAULT_AVATAR.pose);
  });

  it('still reads avatars saved with the old palette ids', () => {
    const config = sanitizeAvatarConfig({ skin: 'tan-3', outfitColor: 'clay', hairColor: 'espresso', facialHair: 'goatee' }, VALID_OPTION_IDS);
    expect([config.skin, config.outfitColor, config.hairColor, config.facialHair]).toEqual(['tan-3', 'clay', 'espresso', 'goatee']);
  });
});

describe('Current You and Future You', () => {
  it('reads an avatar saved before Future You as the current one', () => {
    const doc = readAvatarDoc({ ...DEFAULT_AVATAR, skin: 'deep-1' }, VALID_OPTION_IDS);
    expect(doc.current.skin).toBe('deep-1');
    expect(doc.future).toBeNull();
    expect(doc.looks).toEqual([]);
  });

  it('round-trips both avatars and saved looks', () => {
    const current = { ...DEFAULT_AVATAR, sliders: { muscle: -0.2 } };
    const future = suggestFuture(current);
    const stored = writeAvatarDoc({ current, future, looks: [{ name: 'Look 1', config: current }] });
    // The current avatar stays at the top level for everything that reads a plain config.
    expect(sanitizeAvatarConfig(stored, VALID_OPTION_IDS)).toEqual(current);
    const doc = readAvatarDoc(JSON.parse(JSON.stringify(stored)), VALID_OPTION_IDS);
    expect(doc.current).toEqual(current);
    expect(doc.future).toEqual(future);
    expect(doc.looks).toHaveLength(1);
  });

  it('suggests a future self that stands taller, without changing who they are', () => {
    const current = { ...DEFAULT_AVATAR, skin: 'deep-1', sliders: { posture: -0.5 } };
    const future = suggestFuture(current);
    expect(future.skin).toBe('deep-1');
    expect(future.sliders.posture).toBeGreaterThan(-0.5);
  });

  it('ignores junk in the stored document', () => {
    const doc = readAvatarDoc({ future: 'x', looks: [1, { name: 5 }, { name: 'ok', config: {} }] }, VALID_OPTION_IDS);
    expect(doc.future).toBeNull();
    expect(doc.looks.map((l) => l.name)).toEqual(['ok']);
  });
});
