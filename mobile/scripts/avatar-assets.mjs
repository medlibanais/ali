// The avatar asset budget: one place that measures, fingerprints and
// size-checks the split avatar model (assets/avatar3d).
//
//   node scripts/avatar-assets.mjs            prints the breakdown (what the
//                                             bytes are: morph targets,
//                                             meshes, textures, per kind)
//   node scripts/avatar-assets.mjs --write    also rewrites the manifest
//                                             (src/avatar/modelManifest.ts)
//   node scripts/avatar-assets.mjs --check    CI: fails if the manifest is
//                                             stale (a file changed without
//                                             it) or a file is over budget
//                                             (assets/avatar3d/budget.json)
//   node scripts/avatar-assets.mjs --json F   writes the breakdown as JSON
//
// The manifest lists the byte size and SHA-256 of the core and every pack.
// The viewer checks each download against it, so a cut-off or corrupted
// file is retried instead of drawn (see avatar3d/viewer.ts). The
// per-look "first render" budget is checked in Jest
// (src/avatar/__tests__/assetBudget.test.ts), which knows the looks.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(root, 'assets/avatar3d');
const CORE = join(ASSETS, 'models/core.bin');
const PARTS = join(ASSETS, 'parts');
const VIEWER = join(ASSETS, 'viewer.html');
const MANIFEST_TS = join(root, 'src/avatar/modelManifest.ts');
const BUDGET = join(ASSETS, 'budget.json');
/** Bump when the manifest's shape changes (not when files change). */
const MANIFEST_SCHEMA = 1;

const SIZE = { f32: 4, u16: 2, u32: 4, i16: 2, u8: 1 };
const bytesOf = (v) => (v.t ? v.n * SIZE[v.t] : v.n);
const isView = (v) => v && typeof v === 'object' && typeof v.o === 'number' && typeof v.n === 'number';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function readAssets() {
  const core = readFileSync(CORE);
  const headerLen = core.readUInt32LE(0);
  const header = JSON.parse(core.subarray(4, 4 + headerLen).toString('utf8'));
  const packs = {};
  for (const f of readdirSync(PARTS).filter((n) => n.endsWith('.bin')).sort()) {
    packs[f.slice(0, -4)] = readFileSync(join(PARTS, f));
  }
  return { core, headerLen, header, packs, viewerBytes: statSync(VIEWER).size };
}

// ------------------------------------------------------------ breakdown

/** Bytes by what they are, and by which file they ship in. */
export function breakdown({ core, headerLen, header, packs }) {
  const rows = new Map(); // category -> { core, packs, count }
  const add = (cat, view, count = 1) => {
    const r = rows.get(cat) ?? { core: 0, packs: 0, count: 0 };
    if (view.b) r.packs += bytesOf(view);
    else r.core += bytesOf(view);
    r.count += count;
    rows.set(cat, r);
  };
  for (const v of Object.values(header.base)) add('base body mesh', v, 0);
  for (const v of Object.values(header.skeleton)) if (isView(v)) add('skeleton + skin weights', v, 0);
  const targetSizes = [];
  for (const [name, t] of Object.entries(header.targets)) {
    add('morph targets (shape deltas)', t.i);
    add('morph targets (shape deltas)', t.d, 0);
    targetSizes.push([name, bytesOf(t.i) + bytesOf(t.d)]);
  }
  const textureOwner = new Map();
  for (const [id, p] of Object.entries(header.proxies)) {
    let meshBytes = 0;
    for (const [k, v] of Object.entries(p)) if (isView(v)) {
      add(`${p.kind} meshes`, v, 0);
      meshBytes += bytesOf(v);
    }
    rows.get(`${p.kind} meshes`).count += 1;
    for (const i of [p.map, p.normalMap]) if (i !== undefined && !textureOwner.has(i)) textureOwner.set(i, p.kind);
  }
  for (const s of Object.values(header.skins)) if (!textureOwner.has(s.map)) textureOwner.set(s.map, 'skin');
  const textureSizes = [];
  header.textures.forEach((t, i) => {
    const kind = textureOwner.get(i) ?? 'unused';
    add(`${kind} textures`, t);
    textureSizes.push([`#${i} ${kind} ${t.w}x${t.h} ${t.mime.replace('image/', '')}`, bytesOf(t)]);
  });
  const gzCore = gzipSync(core, { level: 9 }).length;
  const packTotal = Object.values(packs).reduce((s, b) => s + b.length, 0);
  const gzPacks = Object.values(packs).reduce((s, b) => s + gzipSync(b, { level: 9 }).length, 0);
  const viewsTotal = [...rows.values()].reduce((s, r) => s + r.core + r.packs, 0);
  return {
    header: headerLen + 4,
    rows: [...rows.entries()].map(([cat, r]) => ({ cat, ...r })).sort((a, b) => b.core + b.packs - (a.core + a.packs)),
    targets: targetSizes.sort((a, b) => b[1] - a[1]),
    textures: textureSizes.sort((a, b) => b[1] - a[1]),
    coreBytes: core.length,
    coreGzip: gzCore,
    packCount: Object.keys(packs).length,
    packBytes: packTotal,
    packGzip: gzPacks,
    // Alignment padding between views, the difference to the file sizes.
    padding: core.length + packTotal - headerLen - 4 - viewsTotal,
  };
}

// ------------------------------------------------------------- manifest

export function manifest({ core, packs }) {
  const files = { core: { bytes: core.length, sha256: sha256(core) } };
  const packEntries = Object.fromEntries(
    Object.entries(packs).map(([name, buf]) => [name, { bytes: buf.length, sha256: sha256(buf) }]),
  );
  const version = createHash('sha256')
    .update(JSON.stringify([MANIFEST_SCHEMA, files.core, packEntries]))
    .digest('hex')
    .slice(0, 16);
  return { schema: MANIFEST_SCHEMA, version, core: files.core, packs: packEntries };
}

function manifestTs(m) {
  return `// GENERATED by scripts/avatar-assets.mjs --write. Do not edit.
// Byte size and SHA-256 of every avatar model file the app can load. The
// viewer checks each download against it (a cut-off or corrupted file is
// fetched again), and CI fails when a file changes without this manifest.
/* eslint-disable */

export interface ModelFile {
  bytes: number;
  sha256: string;
}

export interface ModelManifest {
  schema: number;
  /** Changes whenever any file changes. */
  version: string;
  core: ModelFile;
  packs: Record<string, ModelFile>;
}

export const MODEL_MANIFEST: ModelManifest = ${JSON.stringify(m, null, 2)};
`;
}

/** Writes src/avatar/modelManifest.ts. */
export function writeManifest(m) {
  writeFileSync(MANIFEST_TS, manifestTs(m));
}

// --------------------------------------------------------------- budget

export function checkBudget(assets, m, budget) {
  const errors = [];
  const over = (what, have, max) => {
    if (have > max) errors.push(`${what}: ${have} B is over the budget of ${max} B (+${(((have - max) / max) * 100).toFixed(1)}%)`);
  };
  over('viewer.html', assets.viewerBytes, budget.viewerBytes);
  over('core.bin', m.core.bytes, budget.coreBytes);
  const packTotal = Object.values(m.packs).reduce((s, p) => s + p.bytes, 0);
  over('all packs', packTotal, budget.allPacksBytes);
  over('pack count', Object.keys(m.packs).length, budget.maxPacks);
  for (const [name, p] of Object.entries(m.packs)) over(`pack ${name}`, p.bytes, budget.packBytes[name] ?? budget.newPackBytes);
  return errors;
}

// ------------------------------------------------------------------ CLI

const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;

function printBreakdown(b) {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (n) => String(n.toLocaleString('en-US')).padStart(12);
  console.log(`core.bin ${mb(b.coreBytes)} (${mb(b.coreGzip)} gzip), ${b.packCount} packs ${mb(b.packBytes)} (${mb(b.packGzip)} gzip)`);
  console.log(`\n${pad('what', 34)}${'in core'.padStart(12)}${'in packs'.padStart(12)}  items`);
  console.log(`${pad('JSON header', 34)}${num(b.header)}${num(0)}`);
  for (const r of b.rows) console.log(`${pad(r.cat, 34)}${num(r.core)}${num(r.packs)}  ${r.count || ''}`);
  console.log(`${pad('alignment padding', 34)}${num(b.padding)}`);
  console.log('\nlargest morph targets:');
  for (const [n, s] of b.targets.slice(0, 5)) console.log(`  ${pad(n, 40)}${num(s)}`);
  console.log('largest textures:');
  for (const [n, s] of b.textures.slice(0, 8)) console.log(`  ${pad(n, 40)}${num(s)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const assets = readAssets();
  const m = manifest(assets);
  if (args.includes('--check')) {
    let failed = false;
    let committed = '';
    try {
      committed = readFileSync(MANIFEST_TS, 'utf8');
    } catch {
      // reported below
    }
    if (committed !== manifestTs(m)) {
      console.error('Avatar model files changed but src/avatar/modelManifest.ts did not.');
      console.error('Run: cd mobile && node scripts/avatar-assets.mjs --write  (and check the sizes it prints)');
      failed = true;
    }
    const errors = checkBudget(assets, m, JSON.parse(readFileSync(BUDGET, 'utf8')));
    for (const e of errors) console.error(`Over budget: ${e}`);
    if (errors.length) {
      console.error('If the growth is intended, raise the number in assets/avatar3d/budget.json in the same PR and say why.');
      failed = true;
    }
    const packTotal = Object.values(m.packs).reduce((s, p) => s + p.bytes, 0);
    console.log(`avatar assets: core ${m.core.bytes} B, ${Object.keys(m.packs).length} packs ${packTotal} B, viewer ${assets.viewerBytes} B, manifest ${m.version}`);
    process.exit(failed ? 1 : 0);
  }
  const b = breakdown(assets);
  printBreakdown(b);
  const jsonAt = args.indexOf('--json');
  if (jsonAt >= 0) writeFileSync(args[jsonAt + 1], JSON.stringify({ breakdown: b, manifest: m }, null, 2));
  if (args.includes('--write')) {
    writeManifest(m);
    console.log(`\nwrote ${MANIFEST_TS} (version ${m.version})`);
  }
}
