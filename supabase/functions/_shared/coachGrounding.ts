// Deterministic checks of a Coach reply against what we actually know about
// the person (their goals, today's quests, streak, XP, level, scores).
// Used by the Coach test suite (synthetic EN / FR / AR conversations) and
// cheap enough to log in production later. Pure: no I/O.
//
// The written rubric lives in docs/coach-reply-rubric.md; scoreReply() is its
// machine-checkable part.

import type { CoachContext } from './coachText.ts';
import { HARD_BANNED_RE } from './coachText.ts';

export type Lang = 'en' | 'fr' | 'ar';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Lower case, no accents, Arabic-Indic digits as 0-9, plain quotes. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Arabic short vowels and hamza marks: أ / إ / آ read as ا.
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0660-\u0669]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[«»“”„]/g, '"')
    .replace(/[’‘]/g, "'")
    .toLowerCase();
}

/** Goal strings in the person's own words (numbers and lists included). */
export function goalPhrases(ctx: CoachContext): string[] {
  const out: string[] = [];
  for (const value of Object.values(ctx.goals ?? {})) {
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
    else if (Array.isArray(value)) {
      for (const v of value) if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
  }
  return out;
}

function realTitles(ctx: CoachContext): string[] {
  return [
    ...ctx.quests.map((q) => q.title),
    ...ctx.recentCompletions.map((c) => c.title),
  ];
}

function doneTitles(ctx: CoachContext): string[] {
  return [
    ...ctx.quests.filter((q) => q.status === 'done').map((q) => q.title),
    ...ctx.recentCompletions.filter((c) => c.daysAgo <= 1).map((c) => c.title),
  ];
}

const has = (hay: string, needle: string) => normalize(hay).includes(normalize(needle));

/** Words that claim something was finished, in the three languages. */
// (Text is normalize()d first: no accents, Arabic without hamza marks.)
const COMPLETION_RE =
  /(finished|completed|\bdid\b|\bdone\b|crushed|nailed|ticked off|(avons|a|ai|as)\s+(fini|termine|fait|accompli|reussi)|c'est fait|deja fait|انجز|اكمل|اتمم|انهي|فعلنا)/i;

export interface GroundingReport {
  /** Names at least one real quest or goal. */
  mentionsRealItem: boolean;
  /** Claims that do not match the person's data. Empty is good. */
  invented: string[];
}

export function checkGrounding(reply: string, ctx: CoachContext): GroundingReport {
  const text = normalize(reply);
  const invented: string[] = [];
  const titles = realTitles(ctx);
  const goals = goalPhrases(ctx);
  const mentionsRealItem =
    titles.some((t) => has(reply, t)) || goals.some((g) => g.length >= 3 && has(reply, g));

  // Streak / day counts: "5-day streak", "5 jours d'affilée", "٥ أيام".
  for (const m of text.matchAll(/(\d+)\s*-?\s*(day|days|jour|jours|يوم|ايام|أيام)/g)) {
    const n = Number(m[1]);
    if (![ctx.streak, ctx.bestStreak].includes(n)) invented.push(`streak ${n} (real ${ctx.streak})`);
  }
  // XP amounts.
  const xpKnown = new Set<number>([
    ctx.totalXp,
    ...(ctx.xpToNextLevel !== null ? [ctx.xpToNextLevel] : []),
    ...ctx.quests.map((q) => q.xp),
    ...ctx.recentCompletions.map((c) => c.xp),
  ]);
  for (const m of text.matchAll(/(\d+)\s*(xp|نقطة|نقاط)/g)) {
    const n = Number(m[1]);
    if (!xpKnown.has(n)) invented.push(`xp ${n}`);
  }
  // Level.
  for (const m of text.matchAll(/(level|niveau|المستوى|مستوى)\s*(\d+)/g)) {
    const n = Number(m[2]);
    if (n !== ctx.level && n !== ctx.level + 1) invented.push(`level ${n} (real ${ctx.level})`);
  }
  // Percent scores.
  const pctKnown = new Set<number>([ctx.today.overall, ...Object.values(ctx.today.pillars)]);
  for (const d of ctx.week) {
    pctKnown.add(d.overall);
    for (const v of Object.values(d.pillars)) pctKnown.add(v);
  }
  for (const m of text.matchAll(/(\d+)\s*%/g)) {
    const n = Number(m[1]);
    if (!pctKnown.has(n)) invented.push(`score ${n}%`);
  }
  // Quoted quests: must exist; if said to be finished, must be finished.
  let prevEnd = 0;
  for (const m of text.matchAll(/"([^"]{3,80})"/g)) {
    const quoted = m[1];
    const start = m.index ?? 0;
    // Only the words between the previous quote and this one.
    const before = text.slice(Math.max(prevEnd, start - 40), start);
    prevEnd = start + m[0].length;
    const real = titles.find((t) => normalize(t) === quoted.trim());
    const isGoal = goals.some((g) => normalize(g) === quoted.trim());
    if (!real && !isGoal) {
      invented.push(`unknown quest "${quoted}"`);
      continue;
    }
    if (real && COMPLETION_RE.test(before) && !doneTitles(ctx).some((t) => normalize(t) === quoted.trim())) {
      invented.push(`claims "${quoted}" is done`);
    }
  }
  return { mentionsRealItem, invented };
}

/** Best guess of the language a short text is written in. */
export function detectLang(text: string): Lang {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (arabic > latin) return 'ar';
  const t = ` ${normalize(text)} `;
  const fr = (t.match(/ (le|la|les|un|une|des|on|nous|notre|est|et|pour|avec|aujourd'hui|je|tu|c'est|qu|pas) /g) ?? []).length;
  const en = (t.match(/ (the|a|an|we|our|is|and|for|with|today|i|you|it's|let's|not) /g) ?? []).length;
  return fr > en ? 'fr' : 'en';
}

const WE_RE: Record<Lang, RegExp> = {
  en: /\b(we|us|our|let's|let us|i remember)\b/i,
  fr: /\b(on|nous|notre|nos|allons|je me souviens)\b/i,
  // First person plural: نحن / لنا / معًا / دعنا, or a verb ending in نا.
  ar: /(نحن|لنا|معًا|معا|دعنا|لن\S+|\S+نا\b)/,
};

export interface RubricScore {
  grounded: boolean;
  noInventedProgress: boolean;
  futureSelfVoice: boolean;
  short: boolean;
  sameLanguage: boolean;
  safe: boolean;
  /** 0 to 6, one point per line above. */
  score: number;
  /** No invented progress, safe, same language, and at least 5 of 6. */
  pass: boolean;
  invented: string[];
}

export function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?؟。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^\p{L}\p{N}]/gu, '').length > 1).length;
}

export function scoreReply(reply: string, ctx: CoachContext, userLang: Lang): RubricScore {
  const g = checkGrounding(reply, ctx);
  const lang = detectLang(reply);
  const words = reply.split(/\s+/).filter(Boolean).length;
  const r = {
    grounded: g.mentionsRealItem,
    noInventedProgress: g.invented.length === 0,
    futureSelfVoice: WE_RE[userLang].test(reply),
    short: countSentences(reply) <= 3 && words <= 60,
    sameLanguage: lang === userLang,
    safe: !HARD_BANNED_RE.test(reply) && !/\byou (should|must)\b/i.test(reply),
  };
  const score = Object.values(r).filter(Boolean).length;
  return {
    ...r,
    score,
    pass: r.noInventedProgress && r.safe && r.sameLanguage && score >= 5,
    invented: g.invented,
  };
}
