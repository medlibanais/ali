// deno test supabase/functions/_shared/__tests__/quest_schema_test.ts
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  DIFFICULTY_PROFILES,
  difficultyInstruction,
  extractJson,
  type GeneratedQuest,
  PILLARS,
  profileForLevel,
  validateGenerated,
  validateSchema,
} from '../../generate-quests/questSchema.ts';

const XP = { easy: 10, medium: 20, hard: 50 } as const;

// 15 quests, 3 per pillar, with the given difficulty mix.
function day(mix: { easy: number; medium: number; hard: number }): { quests: GeneratedQuest[] } {
  const diffs = [
    ...Array(mix.easy).fill('easy'),
    ...Array(mix.medium).fill('medium'),
    ...Array(mix.hard).fill('hard'),
  ] as ('easy' | 'medium' | 'hard')[];
  return {
    quests: diffs.map((d, i) => ({
      pillar: PILLARS[i % 5],
      title: `Do quest number ${i + 1}`,
      description: 'Specific and measurable.',
      difficulty: d,
      xp_reward: XP[d],
      time_estimate_minutes: 30,
      why_this_matters: 'Because it helps.',
    })),
  };
}

Deno.test('prompt sentence matches the requested wording at Intermediate', () => {
  const s = difficultyInstruction(DIFFICULTY_PROFILES[2]);
  assertStringIncludes(
    s,
    'The user is currently at an Intermediate level. Generate 15 quests balanced across the pillars, but bias towards Medium and Hard difficulty. Do not give them more than 2 Easy quests.',
  );
});

Deno.test('Beginner caps Hard, Expert forbids Easy', () => {
  assertStringIncludes(difficultyInstruction(DIFFICULTY_PROFILES[1]), 'at a Beginner level');
  assertStringIncludes(difficultyInstruction(DIFFICULTY_PROFILES[1]), 'more than 2 Hard quests');
  assertStringIncludes(difficultyInstruction(DIFFICULTY_PROFILES[4]), 'any Easy quests');
});

Deno.test('missing or bad level falls back to Beginner', () => {
  assertEquals(profileForLevel(undefined).label, 'Beginner');
  assertEquals(profileForLevel(null).label, 'Beginner');
  assertEquals(profileForLevel(9).label, 'Beginner');
  assertEquals(profileForLevel('3').label, 'Advanced');
});

Deno.test('every profile target is 15 quests and within its own caps', () => {
  for (const p of Object.values(DIFFICULTY_PROFILES)) {
    assertEquals(p.target.easy + p.target.medium + p.target.hard, 15);
    const r = validateGenerated(day(p.target), p);
    assert(r.ok, `${p.label}: ${!r.ok && r.errors.join('; ')}`);
  }
});

Deno.test('valid day passes and is trimmed', () => {
  const d = day({ easy: 2, medium: 8, hard: 5 });
  d.quests[0].title = '  Walk 20 minutes  ';
  const r = validateGenerated(d, DIFFICULTY_PROFILES[2]);
  assert(r.ok);
  if (r.ok) assertEquals(r.quests[0].title, 'Walk 20 minutes');
});

Deno.test('schema: wrong count, extra keys, bad enum, non-integer, missing field', () => {
  const p = DIFFICULTY_PROFILES[1];
  const short = day({ easy: 6, medium: 7, hard: 2 });
  short.quests.pop();
  assert(!validateGenerated(short, p).ok);

  const extra = day({ easy: 6, medium: 7, hard: 2 }) as unknown as { quests: Record<string, unknown>[] };
  extra.quests[3].secret = 'x';
  const e1 = validateGenerated(extra, p);
  assert(!e1.ok && e1.errors.some((e) => e.includes('/quests/3/secret')));

  const badPillar = day({ easy: 6, medium: 7, hard: 2 }) as unknown as { quests: Record<string, unknown>[] };
  badPillar.quests[0].pillar = 'money';
  assert(!validateGenerated(badPillar, p).ok);

  const frac = day({ easy: 6, medium: 7, hard: 2 }) as unknown as { quests: Record<string, unknown>[] };
  frac.quests[0].time_estimate_minutes = 12.5;
  assert(!validateGenerated(frac, p).ok);

  const missing = day({ easy: 6, medium: 7, hard: 2 }) as unknown as { quests: Record<string, unknown>[] };
  delete missing.quests[0].why_this_matters;
  assert(!validateGenerated(missing, p).ok);

  assert(!validateGenerated([], p).ok, 'top level must be an object');
  assert(!validateGenerated(null, p).ok);
});

Deno.test('rules: XP must match difficulty', () => {
  const d = day({ easy: 6, medium: 7, hard: 2 });
  d.quests[0].xp_reward = 50; // easy worth 50
  const r = validateGenerated(d, DIFFICULTY_PROFILES[1]);
  assert(!r.ok && r.errors[0].includes('xp_reward'));
});

Deno.test('rules: level caps', () => {
  const tooEasy = validateGenerated(day({ easy: 3, medium: 7, hard: 5 }), DIFFICULTY_PROFILES[2]);
  assert(!tooEasy.ok && tooEasy.errors.some((e) => e.includes('3 easy')));
  const tooHard = validateGenerated(day({ easy: 5, medium: 7, hard: 3 }), DIFFICULTY_PROFILES[1]);
  assert(!tooHard.ok && tooHard.errors.some((e) => e.includes('3 hard')));
  assert(!validateGenerated(day({ easy: 1, medium: 6, hard: 8 }), DIFFICULTY_PROFILES[4]).ok);
});

Deno.test('rules: pillar balance and duplicate titles', () => {
  const lopsided = day({ easy: 2, medium: 8, hard: 5 });
  lopsided.quests.forEach((q, i) => {
    if (i < 6) q.pillar = 'health';
  });
  const r = validateGenerated(lopsided, DIFFICULTY_PROFILES[2]);
  assert(!r.ok && r.errors.some((e) => e.startsWith('balance: health')));

  const dup = day({ easy: 2, medium: 8, hard: 5 });
  dup.quests[1].title = dup.quests[0].title.toUpperCase();
  const r2 = validateGenerated(dup, DIFFICULTY_PROFILES[2]);
  assert(!r2.ok && r2.errors.some((e) => e.startsWith('duplicate title')));
});

Deno.test('validateSchema reports JSON pointers', () => {
  const errs = validateSchema({ a: 'x' }, {
    type: 'object',
    required: ['b'],
    properties: { a: { type: 'integer' } },
  });
  assertEquals(errs.sort(), ['/a: expected integer', '/b: required']);
});

Deno.test('extractJson tolerates code fences and rejects junk', () => {
  assertEquals(extractJson('```json\n{"quests": []}\n```'), { quests: [] });
  assertEquals(extractJson('no json here'), null);
  assertEquals(extractJson('{broken'), null);
});
