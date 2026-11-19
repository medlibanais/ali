#!/usr/bin/env node
// PostToolUse hook (Edit/Write/MultiEdit): after a .ts/.tsx change under
// mobile/src, runs `npx tsc --noEmit` in mobile/ and reports errors back to
// Claude (exit 2) so they are fixed right away.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readStdinJson } from './lib.mjs';

const input = await readStdinJson();
const filePath = String(input?.tool_input?.file_path ?? '');
const projectDir = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
const rel = path.relative(projectDir, path.resolve(projectDir, filePath)).split(path.sep).join('/');
if (!/^mobile\/src\/.+\.tsx?$/.test(rel)) process.exit(0);

const mobileDir = path.join(projectDir, 'mobile');
if (!existsSync(path.join(mobileDir, 'node_modules', 'typescript'))) {
  // Dependencies not installed in this checkout: nothing to check against.
  process.exit(0);
}

const res = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
  cwd: mobileDir,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  timeout: 170_000,
});
if (res.status === 0) process.exit(0);

const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
const lines = out.split(/\r?\n/);
const shown = lines.slice(0, 40).join('\n');
const more = lines.length > 40 ? `\n... and ${lines.length - 40} more lines` : '';
process.stderr.write(`npx tsc --noEmit failed after editing ${rel}:\n${shown}${more}\n`);
process.exit(2);
