// Adaptive difficulty + JSON Schema validation for generate-quests.
// Pure module (no Deno APIs) so it is unit-tested with `deno test`.

export const PILLARS = ['health', 'family', 'work', 'fun', 'spirituality'] as const;
export type Pillar = (typeof PILLARS)[number];
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_XP: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 50 };

/** Quests per generated day: 3 per pillar. */
export const QUEST_COUNT = 15;
export const PER_PILLAR_MIN = 2;
export const PER_PILLAR_MAX = 4;

export interface GeneratedQuest {
  pillar: Pillar;
  title: string;
  description: string;
  difficulty: Difficulty;
  xp_reward: number;
  time_estimate_minutes: number;
  why_this_matters: string;
}

// ---------------------------------------------------------------------------
// Difficulty levels (mirror public.calculate_user_difficulty, 1..4)
// ---------------------------------------------------------------------------

export interface DifficultyProfile {
  level: 1 | 2 | 3 | 4;
  label: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  /** The two difficulties the day leans towards, most important first. */
  bias: [Difficulty, Difficulty];
  /** Target mix for 15 quests; the model is told this, the validator only enforces the caps. */
  target: Record<Difficulty, number>;
  maxEasy: number;
  maxHard: number;
}

export const DIFFICULTY_PROFILES: Record<1 | 2 | 3 | 4, DifficultyProfile> = {
  1: {
    level: 1,
    label: 'Beginner',
    bias: ['easy', 'medium'],
    target: { easy: 6, medium: 7, hard: 2 },
    maxEasy: QUEST_COUNT,
    maxHard: 2,
  },
  2: {
    level: 2,
    label: 'Intermediate',
    bias: ['medium', 'hard'],
    target: { easy: 2, medium: 8, hard: 5 },
    maxEasy: 2,
    maxHard: QUEST_COUNT,
  },
  3: {
    level: 3,
    label: 'Advanced',
    bias: ['hard', 'medium'],
    target: { easy: 1, medium: 7, hard: 7 },
    maxEasy: 1,
    maxHard: QUEST_COUNT,
  },
  4: {
    level: 4,
    label: 'Expert',
    bias: ['hard', 'medium'],
    target: { easy: 0, medium: 6, hard: 9 },
    maxEasy: 0,
    maxHard: QUEST_COUNT,
  },
};

/** Missing, broken or out-of-range level -> Beginner (same as a user with no history). */
export function profileForLevel(level: unknown): DifficultyProfile {
  const n = typeof level === 'number' ? level : Number(level);
  if (n === 1 || n === 2 || n === 3 || n === 4) return DIFFICULTY_PROFILES[n];
  return DIFFICULTY_PROFILES[1];
}

function cap(name: string, max: number): string {
  if (max >= QUEST_COUNT) return '';
  if (max === 0) return ` Do not give them any ${name} quests.`;
  return ` Do not give them more than ${max} ${name} quest${max === 1 ? '' : 's'}.`;
}

const title = (d: Difficulty) => d[0].toUpperCase() + d.slice(1);

/** The sentence injected into the Groq system prompt. */
export function difficultyInstruction(p: DifficultyProfile): string {
  const article = /^[AEIOU]/.test(p.label) ? 'an' : 'a';
  return (
    `The user is currently at ${article} ${p.label} level. ` +
    `Generate ${QUEST_COUNT} quests balanced across the pillars, but bias towards ` +
    `${title(p.bias[0])} and ${title(p.bias[1])} difficulty.` +
    cap('Easy', p.maxEasy) +
    cap('Hard', p.maxHard) +
    ` Aim for about ${p.target.easy} easy, ${p.target.medium} medium and ${p.target.hard} hard.`
  );
}

// ---------------------------------------------------------------------------
// JSON Schema (draft 2020-12) for the model's answer
// ---------------------------------------------------------------------------

export const QUEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['quests'],
  properties: {
    quests: {
      type: 'array',
      minItems: QUEST_COUNT,
      maxItems: QUEST_COUNT,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pillar', 'title', 'description', 'difficulty', 'xp_reward', 'time_estimate_minutes', 'why_this_matters'],
        properties: {
          pillar: { type: 'string', enum: [...PILLARS] },
          title: { type: 'string', minLength: 4, maxLength: 80 },
          description: { type: 'string', minLength: 1, maxLength: 240 },
          difficulty: { type: 'string', enum: [...DIFFICULTIES] },
          xp_reward: { type: 'integer', enum: [10, 20, 50] },
          time_estimate_minutes: { type: 'integer', minimum: 5, maximum: 480 },
          why_this_matters: { type: 'string', maxLength: 200 },
        },
      },
    },
  },
} as const;

/** The subset of JSON Schema keywords QUEST_SCHEMA uses. */
export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  enum?: readonly (string | number)[];
  required?: readonly string[];
  properties?: Readonly<Record<string, JsonSchema>>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/**
 * Validate `value` against a JSON Schema (the keywords in JsonSchema).
 * Returns a list of errors as "<json pointer>: <problem>"; empty = valid.
 */
export function validateSchema(value: unknown, schema: JsonSchema, path = ''): string[] {
  const at = path || '/';
  const errors: string[] = [];

  if (schema.type) {
    const ok =
      schema.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : schema.type === 'array' ? Array.isArray(value)
      : schema.type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
      : schema.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : typeof value === schema.type;
    if (!ok) return [`${at}: expected ${schema.type}`];
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) {
    errors.push(`${at}: must be one of ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string') {
    const len = [...value].length;
    if (schema.minLength !== undefined && len < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && len > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validateSchema(item, schema.items as JsonSchema, `${path}/${i}`)));
    }
  }
  if (schema.type === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}/${key}: required`);
    }
    for (const [key, v] of Object.entries(obj)) {
      const sub = schema.properties?.[key];
      if (sub) errors.push(...validateSchema(v, sub, `${path}/${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}/${key}: not allowed`);
    }
  }
  return errors;
}

export type QuestValidation =
  | { ok: true; quests: GeneratedQuest[] }
  | { ok: false; errors: string[] };

/**
 * Full gate before anything is inserted: JSON Schema first, then the rules
 * a schema cannot express (XP matches difficulty, pillar balance, the
 * level's Easy/Hard caps, no duplicate titles).
 */
export function validateGenerated(raw: unknown, profile: DifficultyProfile): QuestValidation {
  const errors = validateSchema(raw, QUEST_SCHEMA as unknown as JsonSchema);
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 10) };

  const quests = (raw as { quests: GeneratedQuest[] }).quests.map((q) => ({
    ...q,
    title: q.title.trim(),
    description: q.description.trim(),
    why_this_matters: q.why_this_matters.trim(),
  }));

  const rule: string[] = [];
  quests.forEach((q, i) => {
    if (DIFFICULTY_XP[q.difficulty] !== q.xp_reward) {
      rule.push(`/quests/${i}/xp_reward: ${q.difficulty} must be ${DIFFICULTY_XP[q.difficulty]}`);
    }
    if (q.title.length < 4) rule.push(`/quests/${i}/title: too short after trimming`);
  });

  const perPillar = Object.fromEntries(PILLARS.map((p) => [p, 0])) as Record<Pillar, number>;
  const perDifficulty: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const q of quests) {
    perPillar[q.pillar] += 1;
    perDifficulty[q.difficulty] += 1;
  }
  for (const p of PILLARS) {
    if (perPillar[p] < PER_PILLAR_MIN || perPillar[p] > PER_PILLAR_MAX) {
      rule.push(`balance: ${p} has ${perPillar[p]} quests (want ${PER_PILLAR_MIN}-${PER_PILLAR_MAX})`);
    }
  }
  if (perDifficulty.easy > profile.maxEasy) {
    rule.push(`level: ${perDifficulty.easy} easy quests, ${profile.label} allows ${profile.maxEasy}`);
  }
  if (perDifficulty.hard > profile.maxHard) {
    rule.push(`level: ${perDifficulty.hard} hard quests, ${profile.label} allows ${profile.maxHard}`);
  }

  const seen = new Set<string>();
  for (const q of quests) {
    const key = q.title.toLowerCase();
    if (seen.has(key)) rule.push(`duplicate title: ${q.title}`);
    seen.add(key);
  }

  return rule.length > 0 ? { ok: false, errors: rule } : { ok: true, quests };
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
