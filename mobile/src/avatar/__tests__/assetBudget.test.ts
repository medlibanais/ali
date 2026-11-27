// The avatar asset budget (assets/avatar3d/budget.json) and manifest
// (modelManifest.ts): every model file matches its size and hash, the
// first full render of any built-in look stays under budget, and avatars
// saved by older versions of the app still resolve to files that exist.
// File sizes on their own are checked by `node scripts/avatar-assets.mjs
// --check` in CI.

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { LOOKS, VALID_OPTION_IDS, randomAvatarConfig } from '../options';
import { partsFor, skinFor } from '../shape';
import { DEFAULT_AVATAR, readAvatarDoc, type AvatarConfig } from '../types';
import { PACK_ASSETS, PART_PACKS } from '../modelParts';
import { MODEL_MANIFEST } from '../modelManifest';
import { expectedFiles, packsFor } from '../Avatar3D';

jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ hash: 'h', uri: 'u', localUri: 'u', downloadAsync: () => Promise.resolve() }) },
}));
jest.mock('../../../assets/avatar3d/viewer.html', () => 1, { virtual: true });

const ASSETS = path.join(__dirname, '../../../assets/avatar3d');
const budget = JSON.parse(fs.readFileSync(path.join(ASSETS, 'budget.json'), 'utf8')) as { firstRenderBytes: number; anyLookFirstRenderBytes: number };
const OLD_MODEL_BYTES = 46_198_384;

function firstRenderBytes(config: AvatarConfig): number {
  const names = packsFor({ parts: partsFor(config), skin: skinFor(config) });
  return MODEL_MANIFEST.core.bytes + names.reduce((sum, n) => sum + MODEL_MANIFEST.packs[n].bytes, 0);
}

describe('avatar model manifest', () => {
  const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

  it('matches core.bin and every pack on disk', () => {
    const core = path.join(ASSETS, 'models/core.bin');
    expect(fs.statSync(core).size).toBe(MODEL_MANIFEST.core.bytes);
    expect(sha(core)).toBe(MODEL_MANIFEST.core.sha256);
    const onDisk = fs.readdirSync(path.join(ASSETS, 'parts')).filter((f) => f.endsWith('.bin')).map((f) => f.slice(0, -4)).sort();
    expect(Object.keys(MODEL_MANIFEST.packs).sort()).toEqual(onDisk);
    for (const name of onDisk) {
      const file = path.join(ASSETS, `parts/${name}.bin`);
      expect([name, fs.statSync(file).size]).toEqual([name, MODEL_MANIFEST.packs[name].bytes]);
      expect([name, sha(file)]).toEqual([name, MODEL_MANIFEST.packs[name].sha256]);
    }
  });

  it('covers every pack the app can ask for', () => {
    for (const name of Object.keys(PACK_ASSETS)) expect(MODEL_MANIFEST.packs[name]).toBeDefined();
    for (const names of Object.values(PART_PACKS)) for (const n of names) expect(MODEL_MANIFEST.packs[n]).toBeDefined();
  });

  it('tells the viewer what to expect for exactly the files it loads', () => {
    const names = packsFor({ parts: partsFor(DEFAULT_AVATAR), skin: skinFor(DEFAULT_AVATAR) });
    const want = expectedFiles(names);
    expect(Object.keys(want).sort()).toEqual(['core', ...names].sort());
    expect(want.core).toEqual(MODEL_MANIFEST.core);
  });
});

describe('first full render budget', () => {
  const builtIn: [string, AvatarConfig][] = [
    ['default', DEFAULT_AVATAR],
    ...LOOKS.map((l): [string, AvatarConfig] => [l.id, { ...DEFAULT_AVATAR, ...l.config }]),
  ];
  const random = Array.from({ length: 400 }, (_, i): [string, AvatarConfig] => [`random${i}`, randomAvatarConfig(1 + i)]);
  const over = (list: [string, AvatarConfig][], max: number) =>
    list.map(([id, c]) => [id, firstRenderBytes(c)] as const).filter(([, b]) => b > max);

  it('keeps the default and built-in looks under budget', () => {
    expect(over(builtIn, budget.firstRenderBytes)).toEqual([]);
  });

  it('keeps any mix of items under budget, and at least 30% under the old single model', () => {
    expect(over(random, budget.anyLookFirstRenderBytes)).toEqual([]);
    expect(budget.anyLookFirstRenderBytes).toBeLessThan(OLD_MODEL_BYTES * 0.7);
  });
});

describe('avatars saved by older app versions', () => {
  // What profiles.avatar_config held at each stage (see types.ts).
  const SAVED: [string, unknown][] = [
    ['nothing saved', null],
    ['v1 toon colours', { skin: 'tan', hairColor: 'brown', outfitColor: 'navy', pantsColor: 'black', hair: 'short', eyes: 'round' }],
    ['v2 anime', { look: 'anime', hair: 'anime-swoop', hairColor: 'copper', outfitColor: 'teal', pantsColor: 'black', facialHair: 'beard', sliders: { faceWidth: 0.5 }, v: 2 }],
    ['v3 dropped items', { v: 3, sex: 'male', hair: 'afro01', outfit: 'separates', top: 'polo', bottom: 'harem_pants', shoes: 'shoes3', glasses: 'none' }],
    ['v3 full doc', {
      v: 3, sex: 'female', hair: 'braid01', skin: 'deep-1', outfit: 'f_sport', expression: 'smile', pose: 'wave',
      future: { sex: 'female', hair: 'long01', outfit: 'f_blouse_skirt' },
      looks: [{ name: 'Work', config: { sex: 'male', hair: 'short04', outfit: 'm_suit', glasses: 'glasses_bold' } }],
    }],
  ];

  it.each(SAVED)('%s: loads and every item it wears has its packs', (_name, raw) => {
    const doc = readAvatarDoc(raw, VALID_OPTION_IDS);
    for (const config of [doc.current, ...(doc.future ? [doc.future] : []), ...doc.looks.map((l) => l.config)]) {
      const names = packsFor({ parts: partsFor(config), skin: skinFor(config) });
      for (const n of names) expect(MODEL_MANIFEST.packs[n]).toBeDefined();
      expect(firstRenderBytes(config)).toBeLessThanOrEqual(budget.anyLookFirstRenderBytes);
    }
  });
});
