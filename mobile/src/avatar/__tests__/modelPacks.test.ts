// The split avatar model: every item the app can put on an avatar has its
// packs on disk, and the first full render of a look downloads far less
// than the old single 46.2 MB file.

import fs from 'fs';
import path from 'path';
import { LOOKS, randomAvatarConfig } from '../options';
import { partsFor, skinFor } from '../shape';
import { DEFAULT_AVATAR, type AvatarConfig } from '../types';
import { PACK_ASSETS, PART_PACKS } from '../modelParts';
import { packsFor } from '../Avatar3D';

jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ hash: 'h', uri: 'u', localUri: 'u', downloadAsync: () => Promise.resolve() }) },
}));
jest.mock('../../../assets/avatar3d/viewer.html', () => 1, { virtual: true });

const ASSETS = path.join(__dirname, '../../../assets/avatar3d');
const OLD_MODEL_BYTES = 46_198_384;
const coreBytes = fs.statSync(path.join(ASSETS, 'models/core.bin')).size;
const packBytes = (name: string) => fs.statSync(path.join(ASSETS, `parts/${name}.bin`)).size;

function header(): { proxies: Record<string, { kind: string; packs?: string[] }>; skins: Record<string, { packs?: string[] }> } {
  const buf = fs.readFileSync(path.join(ASSETS, 'models/core.bin'));
  const len = buf.readUInt32LE(0);
  return JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
}

function firstRenderBytes(config: AvatarConfig): number {
  const command = { parts: partsFor(config), skin: skinFor(config) };
  return coreBytes + packsFor(command).reduce((sum, name) => sum + packBytes(name), 0);
}

describe('split avatar model', () => {
  const h = header();

  it('lists the same packs in the model header and the app manifest', () => {
    for (const [id, p] of Object.entries(h.proxies)) {
      if (!p.packs) continue;
      expect(PART_PACKS[id]).toEqual(p.packs);
    }
    for (const [id, s] of Object.entries(h.skins)) expect(PART_PACKS[`skin:${id}`]).toEqual(s.packs ?? []);
  });

  it('has a file and an asset for every pack', () => {
    const names = new Set(Object.values(PART_PACKS).flat());
    for (const name of names) {
      expect(PACK_ASSETS[name]).toBeDefined();
      expect(packBytes(name)).toBeGreaterThan(0);
    }
  });

  it('can dress every look and random avatars from the packs', () => {
    const configs = [DEFAULT_AVATAR, ...LOOKS.map((l) => ({ ...DEFAULT_AVATAR, ...l.config })), ...Array.from({ length: 40 }, (_, i) => randomAvatarConfig(1 + (i % 30)))];
    for (const config of configs) {
      for (const part of partsFor(config)) {
        const proxy = h.proxies[part.id];
        if (!proxy) continue; // the viewer skips unknown ids, as before
        if (proxy.packs) expect(packsFor({ parts: [part] })).toEqual(expect.arrayContaining(proxy.packs));
      }
    }
  });

  it('cuts the bytes of a first full render by at least 30%', () => {
    const sizes = [DEFAULT_AVATAR, ...LOOKS.map((l) => ({ ...DEFAULT_AVATAR, ...l.config }))].map(firstRenderBytes);
    const worst = Math.max(...sizes);
    // eslint-disable-next-line no-console
    console.log(`first render: core ${coreBytes} B, looks ${Math.min(...sizes)}..${worst} B of ${OLD_MODEL_BYTES} B`);
    expect(worst).toBeLessThan(OLD_MODEL_BYTES * 0.7);
  });
});
