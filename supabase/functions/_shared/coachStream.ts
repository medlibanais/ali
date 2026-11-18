// Live shaping of a streamed coach reply. The same rules as postFilter()
// apply, but on a growing text: only a stable prefix is sent, and the last
// HOLD_BACK characters wait for more text, so a banned phrase is caught
// before any of it reaches the screen. Pure, so it is unit tested.

import { HARD_BANNED_RE, OUTPUT_MAX_CHARS, postFilter } from './coachText.ts';

/** Longer than the longest banned phrase and the "Future self:" prefix. */
export const HOLD_BACK = 40;

/** postFilter() without the final length cut, for a reply still arriving. */
export function liveFilter(raw: string): string {
  let out = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // An unclosed <think> hides everything after it until it closes.
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^(future self|you|assistant)\s*:\s*/i, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/^\s+/, '');
  if (out.startsWith('"')) out = out.slice(1).trimStart();
  out = out
    .replace(/\byou should\b/gi, 'we could')
    .replace(/\byou must\b/gi, "let's")
    .replace(/\byou need to\b/gi, "let's");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export interface ShapeStep {
  /** New text to send to the app now (may be empty). */
  emit: string;
  /** The reply hit a banned phrase: stop and use a safe reply instead. */
  banned: boolean;
  /** The reply is long enough; stop asking the model for more. */
  full: boolean;
}

export class ReplyShaper {
  raw = '';
  sent = '';

  push(delta: string): ShapeStep {
    this.raw += delta;
    const live = liveFilter(this.raw);
    if (HARD_BANNED_RE.test(live)) return { emit: '', banned: true, full: false };
    const stableLength = Math.max(0, live.length - HOLD_BACK);
    let stable = live.slice(0, Math.min(stableLength, OUTPUT_MAX_CHARS));
    // Whole words only, so the app never shows half a word.
    const lastSpace = stable.lastIndexOf(' ');
    stable = lastSpace > 0 ? stable.slice(0, lastSpace + 1) : '';
    let emit = '';
    // Softening can rewrite the tail; only ever extend what was sent.
    if (stable.length > this.sent.length && stable.startsWith(this.sent)) {
      emit = stable.slice(this.sent.length);
      this.sent = stable;
    }
    return { emit, banned: false, full: live.length > OUTPUT_MAX_CHARS + HOLD_BACK };
  }

  /** The reply as it will be saved; null means "use the safe fallback". */
  finish(): string | null {
    return postFilter(this.raw);
  }
}

/** One Server-Sent Event frame. */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
