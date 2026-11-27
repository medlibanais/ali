// deno test supabase/functions/_shared/__tests__/patternInsights_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  type BehavioralPatterns,
  buildPrompt,
  extractJsonArray,
  hasEnoughData,
  patternSignature,
  ruleBasedInsights,
  validateInsights,
} from '../patternInsights.ts';

const base: BehavioralPatterns = {
  user_id: 'u1',
  timezone: 'Africa/Casablanca',
  window_start: '2026-09-22',
  window_end: '2026-11-16',
  skip_weekday: 2,
  skip_weekday_name: 'Tuesday',
  skip_rate: 28,
  skip_missed: 11,
  skip_total: 40,
  skip_top_pillar: 'family',
  morning_count: 29,
  afternoon_count: 56,
  evening_count: 138,
  peak_time_of_day: 'evening',
  neglected_pillar: 'spirituality',
  neglected_rate: 15,
  neglected_done: 2,
  neglected_total: 13,
  neglected_days_since: 1,
};

const empty: BehavioralPatterns = {
  ...base,
  skip_weekday: null,
  skip_weekday_name: null,
  skip_rate: null,
  skip_missed: null,
  skip_total: null,
  skip_top_pillar: null,
  morning_count: 0,
  afternoon_count: 0,
  evening_count: 0,
  peak_time_of_day: null,
  neglected_pillar: null,
  neglected_rate: null,
  neglected_done: null,
  neglected_total: null,
  neglected_days_since: null,
};

Deno.test('prompt carries only the view facts', () => {
  const prompt = buildPrompt(base);
  assert(prompt.includes('Tuesday, 11 of 40 quests missed (28%)'));
  assert(prompt.includes('Family quests'));
  assert(prompt.includes('morning 29, afternoon 56, evening 138. Peak: evening (62%)'));
  assert(prompt.includes('Spirituality, 2 of 13 quests done (15%)'));
});

Deno.test('accepts 2 grounded insights', () => {
  const text = `Sure! [{"kind":"skip_day","observation":"You tend to skip Family quests on Tuesdays.","suggestion":"Try scheduling a quick call on Monday night."},{"kind":"neglected_pillar","observation":"Spirituality got 2 of 13 quests done in two weeks.","suggestion":"Take five quiet minutes this evening."}]`;
  const out = validateInsights(extractJsonArray(text), base);
  assertEquals(out?.length, 2);
  assertEquals(out?.[0].kind, 'skip_day');
});

Deno.test('rejects off-data, duplicate or oversized insights', () => {
  const offData = [
    { kind: 'skip_day', observation: 'You skip Work on Fridays.', suggestion: 'Plan Thursday.' },
    { kind: 'neglected_pillar', observation: 'Spirituality is low.', suggestion: 'Pray.' },
  ];
  assertEquals(validateInsights(offData, base), null);
  const dup = [
    { kind: 'neglected_pillar', observation: 'Spirituality is low.', suggestion: 'Reflect.' },
    { kind: 'neglected_pillar', observation: 'Spirituality again.', suggestion: 'Reflect.' },
  ];
  assertEquals(validateInsights(dup, base), null);
  const long = [
    { kind: 'skip_day', observation: `Tuesday ${'x'.repeat(200)}`, suggestion: 'ok' },
    { kind: 'time_of_day', observation: 'Evening person.', suggestion: 'Evening.' },
  ];
  assertEquals(validateInsights(long, base), null);
  assertEquals(validateInsights('not json', base), null);
});

Deno.test('rule fallback names the real facts', () => {
  const out = ruleBasedInsights(base);
  assertEquals(out.length, 2);
  assert(out[0].observation.includes('Family quests on Tuesdays'));
  assert(out[0].suggestion.includes('Monday night'));
  assert(out[1].observation.startsWith('Spirituality'));
  assert(out[1].suggestion.includes('evening'));
});

Deno.test('no data, no insights', () => {
  assertEquals(hasEnoughData(empty), false);
  assertEquals(ruleBasedInsights(empty), []);
  assertEquals(hasEnoughData({ ...empty, morning_count: 5, peak_time_of_day: 'morning' }), true);
});

Deno.test('signature ignores counts, follows the facts', () => {
  assertEquals(patternSignature(base), patternSignature({ ...base, evening_count: 999 }));
  assert(patternSignature(base) !== patternSignature({ ...base, neglected_pillar: 'fun' }));
});
