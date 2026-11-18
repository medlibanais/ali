// deno test supabase/functions/_shared/__tests__/coachStream_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { HOLD_BACK, liveFilter, ReplyShaper, sseFrame } from '../coachStream.ts';
import { OUTPUT_MAX_CHARS, postFilter } from '../coachText.ts';
import { parseSseLines } from '../llm.ts';

function feed(pieces: string[]): { shaper: ReplyShaper; sent: string; banned: boolean } {
  const shaper = new ReplyShaper();
  let sent = '';
  let banned = false;
  for (const p of pieces) {
    const step = shaper.push(p);
    if (step.banned) {
      banned = true;
      break;
    }
    sent += step.emit;
  }
  return { shaper, sent, banned };
}

Deno.test('streamed text is a prefix of the saved reply', () => {
  const words = 'We crushed that run this morning. **Next**, let us call Mom for ten minutes before dinner, and you should drink some water too.'
    .split(/(?<= )/);
  const { shaper, sent, banned } = feed(words);
  assert(!banned);
  const final = shaper.finish();
  assert(final);
  assert(final.startsWith(sent), `${final} / ${sent}`);
  assert(!sent.includes('**'));
  assert(final.includes('we could drink'));
});

Deno.test('the last characters wait, so a banned phrase never shows', () => {
  const text = 'Okay, here is the honest truth about this week for us both. You are weak and lazy.';
  const pieces = text.split('');
  const { sent, banned } = feed(pieces);
  assert(banned);
  assert(!/weak/i.test(sent));
  assert(sent.length <= text.length - HOLD_BACK);
});

Deno.test('dosage advice is caught mid-stream', () => {
  const { sent, banned } = feed(['Rest a bit and ', 'take 400', ' mg of ibuprofen.']);
  assert(banned);
  assertEquals(sent, '');
});

Deno.test('think blocks and the name prefix are hidden while streaming', () => {
  assertEquals(liveFilter('<think>plan the reply'), '');
  assertEquals(liveFilter('<think>x</think>Future self: we got this'), 'We got this');
});

Deno.test('a long reply stops the model and is cut at a sentence', () => {
  const sentence = 'We keep showing up for Health and it shows. ';
  const pieces = Array.from({ length: 20 }, () => sentence);
  const shaper = new ReplyShaper();
  let full = false;
  for (const p of pieces) {
    const step = shaper.push(p);
    if (step.full) {
      full = true;
      break;
    }
  }
  assert(full);
  assert(shaper.sent.length <= OUTPUT_MAX_CHARS);
  const final = shaper.finish();
  assert(final && final.length <= OUTPUT_MAX_CHARS && final.endsWith('.'));
  assertEquals(final, postFilter(shaper.raw));
});

Deno.test('parses Groq SSE chunks split anywhere', () => {
  const body =
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"We "}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"got this."}}]}\n\n' +
    'data: [DONE]\n\n';
  const out: string[] = [];
  let buffer = '';
  let done = false;
  for (let i = 0; i < body.length; i += 7) {
    buffer += body.slice(i, i + 7);
    const parsed = parseSseLines(buffer);
    buffer = parsed.rest;
    out.push(...parsed.deltas);
    done ||= parsed.done;
  }
  assertEquals(out.join(''), 'We got this.');
  assert(done);
});

Deno.test('reports an error frame', () => {
  const parsed = parseSseLines('data: {"error":{"message":"rate limited"}}\n');
  assertEquals(parsed.error, 'rate limited');
});

Deno.test('sse frames are one event each', () => {
  assertEquals(sseFrame('delta', { text: 'hi\nthere' }), 'event: delta\ndata: {"text":"hi\\nthere"}\n\n');
});

Deno.test('only whole words are sent', () => {
  const text = 'We showed up for Health today, and that run still counts for a lot more than we think.';
  const shaper = new ReplyShaper();
  for (let i = 0; i < text.length; i += 3) {
    const { emit } = shaper.push(text.slice(i, i + 3));
    if (emit) assert(emit.endsWith(' '), JSON.stringify(emit));
  }
});
