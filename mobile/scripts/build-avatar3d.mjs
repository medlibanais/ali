// Builds avatar3d/viewer.ts (three.js + three-vrm) into one self-contained
// HTML file the app loads in a WebView: assets/avatar3d/viewer.html.
// Run after changing the viewer: npm run build:avatar3d
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  entryPoints: [join(root, 'avatar3d/viewer.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}canvas{display:block}</style></head><body><script>${js}</script></body></html>`;
writeFileSync(join(root, 'assets/avatar3d/viewer.html'), html);
console.log(`viewer.html: ${(html.length / 1024).toFixed(0)} KB`);
