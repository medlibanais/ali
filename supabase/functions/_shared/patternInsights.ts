// Prompt, validation and rule-based fallback for generate-insights.
// Pure functions only (no I/O), so they are easy to test with `deno test`.

export type Pillar = 'health' | 'family' | 'work' | 'fun' | 'spirituality';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/** One row of public.user_behavioral_patterns. */
export interface BehavioralPatterns {
  user_id: string;
  timezone: string;
  window_start: string;
  window_end: string;
  skip_weekday: number | null;
  skip_weekday_name: string | null;
  skip_rate: number | null;
  skip_missed: number | null;
  skip_total: number | null;
  skip_top_pillar: Pillar | null;
  morning_count: number;
  afternoon_count: number;
  evening_count: number;
  peak_time_of_day: TimeOfDay | null;
  neglected_pillar: Pillar | null;
  neglected_rate: number | null;
  neglected_done: number | null;
  neglected_total: number | null;
  neglected_days_since: number | null;
}

export type InsightKind = 'skip_day' | 'time_of_day' | 'neglected_pillar';

export interface PatternInsight {
  kind: InsightKind;
  /** What the data shows, one sentence. */
  observation: string;
  /** One concrete thing to try, one sentence. */
  suggestion: string;
}

const LABEL: Record<Pillar, string> = {
  health: 'Health',
  family: 'Family',
  work: 'Work',
  fun: 'Fun',
  spirituality: 'Spirituality',
};

const SMALL_STEP: Record<Pillar, string> = {
  health: 'a 10-minute walk',
  family: 'a quick call home',
  work: '25 minutes of focused work',
  fun: '15 minutes on something you enjoy',
  spirituality: 'five quiet minutes of reflection',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MAX_OBSERVATION = 160;
export const MAX_SUGGESTION = 180;

export function totalCompletions(p: BehavioralPatterns): number {
  return p.morning_count + p.afternoon_count + p.evening_count;
}

/** Below this there is nothing honest to say yet. */
export function hasEnoughData(p: BehavioralPatterns): boolean {
  return totalCompletions(p) >= 5 || p.skip_weekday !== null || p.neglected_pillar !== null;
}

/** Which facts the view found, strongest first. */
export function availableKinds(p: BehavioralPatterns): InsightKind[] {
  const out: InsightKind[] = [];
  if (p.skip_weekday !== null && (p.skip_rate ?? 0) >= 20) out.push('skip_day');
  if (p.neglected_pillar !== null && (p.neglected_rate ?? 100) < 70) out.push('neglected_pillar');
  if (p.peak_time_of_day !== null && totalCompletions(p) >= 5) out.push('time_of_day');
  // Weaker signals still beat saying nothing.
  if (p.skip_weekday !== null && !out.includes('skip_day')) out.push('skip_day');
  if (p.neglected_pillar !== null && !out.includes('neglected_pillar')) out.push('neglected_pillar');
  return out;
}

/** Stable key of what was detected; the cache is reused while it holds. */
export function patternSignature(p: BehavioralPatterns): string {
  return [p.skip_weekday, p.skip_top_pillar, p.peak_time_of_day, p.neglected_pillar].join('|');
}

function peakShare(p: BehavioralPatterns): number {
  const total = totalCompletions(p);
  if (!p.peak_time_of_day || total === 0) return 0;
  return Math.round((100 * p[`${p.peak_time_of_day}_count`]) / total);
}

/** The facts, as plain lines for the model. Only numbers from the view. */
export function factLines(p: BehavioralPatterns): string[] {
  const lines: string[] = [];
  if (p.skip_weekday !== null) {
    lines.push(
      `Most-skipped weekday (last 8 weeks): ${p.skip_weekday_name}, ${p.skip_missed} of ${p.skip_total} quests missed (${p.skip_rate}%)` +
        (p.skip_top_pillar ? `; most of those were ${LABEL[p.skip_top_pillar]} quests.` : '.'),
    );
  }
  if (totalCompletions(p) > 0) {
    lines.push(
      `Quests completed by time of day (last 8 weeks, their timezone): morning ${p.morning_count}, afternoon ${p.afternoon_count}, evening ${p.evening_count}. Peak: ${p.peak_time_of_day} (${peakShare(p)}%).`,
    );
  }
  if (p.neglected_pillar !== null) {
    const since =
      p.neglected_days_since === null
        ? 'none completed in the last 8 weeks'
        : `last one done ${p.neglected_days_since} day(s) ago`;
    lines.push(
      `Most neglected pillar (last 14 days): ${LABEL[p.neglected_pillar]}, ${p.neglected_done} of ${p.neglected_total} quests done (${p.neglected_rate}%), ${since}.`,
    );
  }
  return lines;
}

export function buildPrompt(p: BehavioralPatterns): string {
  return `You write short behavioral insights for a habit app called GROW. The user earns XP by finishing daily quests in 5 pillars: Health, Family, Work, Fun, Spirituality.

FACTS (computed from their own data, nothing else is known):
${factLines(p).map((l) => `- ${l}`).join('\n')}

Write exactly 2 insights, each about a different fact above. Prefer the most-skipped weekday and the most neglected pillar when they exist.

Each insight is a JSON object:
{"kind": "skip_day" | "time_of_day" | "neglected_pillar", "observation": "<what the data shows, speaking to them as 'you', max ${MAX_OBSERVATION} chars>", "suggestion": "<one small, concrete action with a when, max ${MAX_SUGGESTION} chars>"}

Example: {"kind":"skip_day","observation":"You tend to skip Family quests on Tuesdays.","suggestion":"Try scheduling a quick call on Monday night so Tuesday starts done."}

RULES
- Name the real weekday, pillar or time of day from the facts. Never invent numbers or facts that are not listed.
- Warm and specific. No guilt, no shame, no generic motivation, no emojis, no markdown.
- Write in English.
- Output a JSON array of 2 objects and nothing else.`;
}

export function extractJsonArray(text: string): unknown {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[*_#`]/g, '').trim();
}

/** Words that tie an insight to its fact, so the model can't drift off-data. */
function anchors(kind: InsightKind, p: BehavioralPatterns): string[] {
  switch (kind) {
    case 'skip_day':
      return p.skip_weekday_name ? [p.skip_weekday_name.toLowerCase()] : [];
    case 'neglected_pillar':
      return p.neglected_pillar ? [p.neglected_pillar] : [];
    case 'time_of_day':
      return p.peak_time_of_day ? [p.peak_time_of_day] : [];
  }
}

/**
 * Accepts the model output only if it is exactly what the screen needs:
 * 2 insights, different kinds, each one a fact the view actually found
 * and naming it. Anything else returns null and the caller falls back.
 */
export function validateInsights(raw: unknown, p: BehavioralPatterns): PatternInsight[] | null {
  if (!Array.isArray(raw)) return null;
  const allowed = new Set(availableKinds(p));
  const out: PatternInsight[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind;
    if (kind !== 'skip_day' && kind !== 'time_of_day' && kind !== 'neglected_pillar') continue;
    if (!allowed.has(kind) || out.some((i) => i.kind === kind)) continue;
    if (typeof o.observation !== 'string' || typeof o.suggestion !== 'string') continue;
    const observation = clean(o.observation);
    const suggestion = clean(o.suggestion);
    if (!observation || !suggestion) continue;
    if (observation.length > MAX_OBSERVATION || suggestion.length > MAX_SUGGESTION) continue;
    const words = anchors(kind, p);
    const haystack = `${observation} ${suggestion}`.toLowerCase();
    if (words.length === 0 || !words.some((w) => haystack.includes(w))) continue;
    out.push({ kind, observation, suggestion });
    if (out.length === 2) break;
  }
  const wanted = Math.min(2, allowed.size);
  return out.length === wanted && wanted > 0 ? out : null;
}

function ruleInsight(kind: InsightKind, p: BehavioralPatterns): PatternInsight | null {
  switch (kind) {
    case 'skip_day': {
      if (p.skip_weekday === null || !p.skip_weekday_name) return null;
      const before = WEEKDAYS[(p.skip_weekday + 6) % 7];
      const pillar = p.skip_top_pillar;
      return {
        kind,
        observation: pillar
          ? `You tend to skip ${LABEL[pillar]} quests on ${p.skip_weekday_name}s (${p.skip_missed} of ${p.skip_total} quests missed that day lately).`
          : `${p.skip_weekday_name} is the day you miss the most quests (${p.skip_missed} of ${p.skip_total} lately).`,
        suggestion: pillar
          ? `Try ${SMALL_STEP[pillar]} on ${before} night so ${p.skip_weekday_name} starts with one done.`
          : `On ${before} night, pick the one quest you'll do first on ${p.skip_weekday_name}.`,
      };
    }
    case 'neglected_pillar': {
      if (!p.neglected_pillar) return null;
      const pillar = p.neglected_pillar;
      const when = p.peak_time_of_day ? ` in the ${p.peak_time_of_day}, when you finish the most` : '';
      return {
        kind,
        observation: `${LABEL[pillar]} has been quiet: ${p.neglected_done} of ${p.neglected_total} quests done in the last 14 days.`,
        suggestion: `Do the easiest ${LABEL[pillar]} quest tomorrow${when}. Even ${SMALL_STEP[pillar]} counts.`,
      };
    }
    case 'time_of_day': {
      if (!p.peak_time_of_day) return null;
      return {
        kind,
        observation: `You finish most of your quests in the ${p.peak_time_of_day} (${peakShare(p)}% of them).`,
        suggestion: `Put your hardest quest in the ${p.peak_time_of_day} slot, while your energy is there.`,
      };
    }
  }
}

/** Template insights used when Groq is off, rate-limited, or off-data. */
export function ruleBasedInsights(p: BehavioralPatterns): PatternInsight[] {
  return availableKinds(p)
    .map((k) => ruleInsight(k, p))
    .filter((i): i is PatternInsight => i !== null)
    .slice(0, 2);
}
