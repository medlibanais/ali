// Splits the avatar model (tools/human/build.py output, human.bin) into a
// small core the first render always needs and one "pack" per wardrobe
// item, so the app only loads the hair, clothes, shoes, glasses and skin
// a person is actually wearing.
//
//   core.bin      header + base body, skeleton, shape targets, eyes, teeth,
//                 tongue, lashes, brows (and the textures only they use)
//   parts/*.bin   one file per hair/clothes/shoes/glasses item, per skin
//                 texture, and per texture shared by several items
//   src/avatar/modelParts.ts   generated: which packs each item needs and
//                 the asset module of each pack
//
// The header keeps every view; a view stored in a pack carries `b` (the
// pack name) and its offset counts from the start of that pack.
//
// Usage (from mobile/): node scripts/split-human.mjs [path/to/human.bin]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] ?? join(root, 'assets/avatar3d/models/human.bin');
const outCore = join(root, 'assets/avatar3d/models/core.bin');
const outParts = join(root, 'assets/avatar3d/parts');
const outManifest = join(root, 'src/avatar/modelParts.ts');

const CORE_KINDS = new Set(['eyes', 'teeth', 'tongue', 'lashes', 'brows']);
const SIZE = { f32: 4, u16: 2, u32: 4, i16: 2, u8: 1 };

const src = readFileSync(input);
const headerLen = src.readUInt32LE(0);
const header = JSON.parse(src.subarray(4, 4 + headerLen).toString('utf8'));
const dataStart = 4 + headerLen;
const bytesOf = (v) => (v.t ? v.n * SIZE[v.t] : v.n);
const slice = (v) => src.subarray(dataStart + v.o, dataStart + v.o + bytesOf(v));
const isView = (v) => v && typeof v === 'object' && typeof v.o === 'number' && typeof v.n === 'number';

/** Collects views per pack and lays them out 4-byte aligned. */
class Pack {
  constructor() {
    this.chunks = [];
    this.size = 0;
  }
  add(view) {
    const pad = (4 - (this.size % 4)) % 4;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.size += pad;
    }
    const bytes = slice(view);
    const o = this.size;
    this.chunks.push(bytes);
    this.size += bytes.length;
    return o;
  }
  bytes() {
    return Buffer.concat(this.chunks, this.size);
  }
}

const packs = new Map(); // name -> Pack ('' is the core)
const packFor = (name) => {
  if (!packs.has(name)) packs.set(name, new Pack());
  return packs.get(name);
};
const place = (view, name) => {
  const o = packFor(name).add(view);
  view.o = o;
  if (name) view.b = name;
  else delete view.b;
};

// Who uses each texture.
const users = new Map();
const use = (i, who) => {
  if (i === undefined) return;
  if (!users.has(i)) users.set(i, new Set());
  users.get(i).add(who);
};
for (const [id, p] of Object.entries(header.proxies)) {
  const who = CORE_KINDS.has(p.kind) ? '' : id;
  use(p.map, who);
  use(p.normalMap, who);
}
for (const [id, s] of Object.entries(header.skins)) use(s.map, `skin_${id}`);

const textureHome = (i) => {
  const who = users.get(i);
  if (!who || who.has('')) return ''; // unused or needed by the core
  if (who.size === 1) return [...who][0];
  return `tex${i}`;
};

// Core geometry first (base, skeleton, targets, core proxies).
for (const v of Object.values(header.base)) place(v, '');
for (const v of Object.values(header.skeleton)) if (isView(v)) place(v, '');
for (const t of Object.values(header.targets)) {
  place(t.i, '');
  place(t.d, '');
}
for (const [id, p] of Object.entries(header.proxies)) {
  const name = CORE_KINDS.has(p.kind) ? '' : id;
  for (const v of Object.values(p)) if (isView(v)) place(v, name);
}
header.textures.forEach((t, i) => place(t, textureHome(i)));

// Packs each item needs.
const needs = (own, textures) => {
  const set = new Set();
  if (own && packs.has(own)) set.add(own);
  for (const i of textures) {
    const home = textureHome(i);
    if (home) set.add(home);
  }
  return [...set].sort();
};
const partPacks = {};
for (const [id, p] of Object.entries(header.proxies)) {
  if (CORE_KINDS.has(p.kind)) continue;
  partPacks[id] = needs(id, [p.map, p.normalMap].filter((i) => i !== undefined));
  p.packs = partPacks[id];
}
for (const [id, s] of Object.entries(header.skins)) {
  partPacks[`skin:${id}`] = needs('', [s.map]);
  s.packs = partPacks[`skin:${id}`];
}
header.split = 1;

// Core file: header padded so the data starts 4-byte aligned.
let json = JSON.stringify(header);
while ((4 + Buffer.byteLength(json)) % 4) json += ' ';
const jsonBuf = Buffer.from(json, 'utf8');
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32LE(jsonBuf.length, 0);
const core = Buffer.concat([lenBuf, jsonBuf, packFor('').bytes()]);
writeFileSync(outCore, core);

rmSync(outParts, { recursive: true, force: true });
mkdirSync(outParts, { recursive: true });
const names = [...packs.keys()].filter(Boolean).sort();
const hash = createHash('sha256').update(core);
let partBytes = 0;
for (const name of names) {
  const bytes = packs.get(name).bytes();
  partBytes += bytes.length;
  hash.update(name).update(bytes);
  writeFileSync(join(outParts, `${name}.bin`), bytes);
}
const fileName = (n) => n.replace(/[^a-zA-Z0-9_-]/g, '_');
if (names.some((n) => fileName(n) !== n)) throw new Error('pack name needs escaping');

const ts = `// GENERATED by scripts/split-human.mjs. Do not edit.
// Which model packs each wardrobe item and skin needs, and their assets.
/* eslint-disable */

/** Changes whenever the core or any pack changes (render cache key). */
export const MODEL_PARTS_VERSION = '${hash.digest('hex').slice(0, 16)}';

/** Item id (or 'skin:<id>') -> pack names. Core items are not listed. */
export const PART_PACKS: Record<string, readonly string[]> = ${JSON.stringify(partPacks, null, 2)};

/** Pack name -> bundled asset module. */
export const PACK_ASSETS: Record<string, number> = {
${names.map((n) => `  ${JSON.stringify(n)}: require('../../assets/avatar3d/parts/${n}.bin'),`).join('\n')}
};
`;
writeFileSync(outManifest, ts);

const mb = (n) => (n / 1e6).toFixed(2);
console.log(`core.bin ${mb(core.length)} MB, ${names.length} packs ${mb(partBytes)} MB, source ${mb(src.length)} MB`);
console.log(`parts dir: ${readdirSync(outParts).length} files`);
