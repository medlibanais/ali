#!/usr/bin/env node
// PreToolUse hook (Edit/Write/MultiEdit/NotebookEdit). Blocks:
//  1. Edits to .env files (secrets). .env.example files stay editable.
//  2. Edits to migrations that are already on origin/main. Every migration on
//     main is applied to the cloud DB, so changing one silently diverges the
//     schema. Write a new migration instead (/new-migration).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readStdinJson, block } from './lib.mjs';

const input = await readStdinJson();
const ti = input?.tool_input ?? {};
const filePath = String(ti.file_path ?? ti.notebook_path ?? '');
if (!filePath) process.exit(0);

const base = path.basename(filePath);
const isEnv = /^\.env(\..+)?$/.test(base) || /\.env$/.test(base);
const isExample = /example|sample|template/i.test(base);
if (isEnv && !isExample) {
  block(
    `Blocked: ${base} holds secrets and must not be edited by Claude. ` +
      'Edit .env.example instead, or ask merill to change the real file. ' +
      'Groq/FAL keys belong only in Supabase Edge Function secrets.',
  );
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
const rel = path.relative(projectDir, path.resolve(projectDir, filePath)).split(path.sep).join('/');
if (/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) {
  let onMain = false;
  try {
    execFileSync('git', ['cat-file', '-e', `origin/main:${rel}`], { cwd: projectDir, stdio: 'ignore' });
    onMain = true;
  } catch {
    onMain = false; // new file, or git/origin unavailable: allow
  }
  if (onMain) {
    block(
      `Blocked: ${rel} is already on main, so it is applied to the cloud database. ` +
        'Do not edit applied migrations. Create a new one with /new-migration.',
    );
  }
}
process.exit(0);
