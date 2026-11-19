#!/usr/bin/env node
// PreToolUse hook (Bash): blocks `npm audit fix --force`.
// Golden rule: forced audit fixes break the Expo SDK 51 / RN 0.74 dependency set.
import { readStdinJson, block } from './lib.mjs';

const input = await readStdinJson();
const cmd = String(input?.tool_input?.command ?? '');

if (/\bnpm\s+audit\s+fix\b[^\n;&|]*(--force|\s-f)\b/.test(cmd)) {
  block(
    'Blocked: `npm audit fix --force` breaks Expo/React Native dependencies (project golden rule). ' +
      'Ignore npm audit warnings, or upgrade one package with `npx expo install <pkg>`.',
  );
}
process.exit(0);
