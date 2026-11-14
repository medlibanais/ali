// deno test supabase/functions/_shared/__tests__/coach_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { classifyIntent } from '../intents.ts';
import {
  buildCompactSystemPrompt,
  buildSystemPrompt,
  type CoachContext,
  fallbackReply,
  pillarAverages,
  postFilter,
  suggestions,
} from '../coachText.ts';
import type { ChatTurn } from '../llm.ts';
import {
  DEFAULT_PROMPT_TOKEN_BUDGET,
  estimateTurns,
  fitToBudget,
  promptBudget,
} from '../tokenBudget.ts';

const zero = { health: 0, family: 0, work: 0, fun: 0, spirituality: 0 };

const ctx: CoachContext = {
  firstName: 'Merill',
  localTime: { hour: 9, weekday: 'Tuesday' },
  goals: { workouts_per_week: 4, career_goal: 'ship GROW', hobbies: ['football'] },
  level: 3,
  totalXp: 2600,
  xpToNextLevel: 2400,
  streak: 5,
  bestStreak: 9,
  streakFreezes: 1,
  today: { date: '2026-10-21', overall: 40, pillars: { ...zero, health: 100, work: 60 } },
  week: [{ date: '2026-10-20', overall: 55, pillars: { ...zero, health: 80, work: 90, spirituality: 50 } }],
  quests: [
    { title: '20-minute run', pillar: 'health', status: 'done', xp: 20 },
    { title: 'Call Mom for 10 minutes', pillar: 'family', status: 'pending', xp: 10 },
  ],
  missedThisWeek: 1,
  badges: ['First Step'],
  recentCompletions: [
    { title: '20-minute run', pillar: 'health', xp: 20, daysAgo: 0 },
    { title: 'Family dinner, phones away', pillar: 'family', xp: 20, daysAgo: 1 },
  ],
  yesterday: {
    health: { done: 0, skipped: 1, missed: 1 },
    family: { done: 2, skipped: 0, missed: 0 },
  },
};

Deno.test('everyday messages reach the model', () => {
  for (const m of ['yes', 'thanks', 'hi', 'I want to invest more time in my family', 'salam, labas?']) {
    assertEquals(classifyIntent(m), 'general', m);
  }
  assertEquals(classifyIntent("I'm so tired today"), 'wellbeing');
  assertEquals(classifyIntent('I have a headache, skip gym?'), 'wellbeing');
});

Deno.test('safety paths stay deterministic', () => {
  assertEquals(classifyIntent('I want to die'), 'crisis');
  assertEquals(classifyIntent('I feel hopeless and I want to give up on everything'), 'crisis');
  assertEquals(classifyIntent("I can't go on like this"), 'crisis');
  assertEquals(classifyIntent('I feel hopeless lately'), 'wellbeing');
  assertEquals(classifyIntent('I have chest pain right now'), 'health_symptom');
  assertEquals(classifyIntent('what dosage of ibuprofen'), 'out_of_scope');
  assertEquals(classifyIntent('which stocks should I buy'), 'out_of_scope');
});

Deno.test('postFilter softens instead of discarding', () => {
  assertEquals(postFilter('You should call Mom today.'), 'We could call Mom today.');
  assertEquals(postFilter('**Nice!**\n- one more quest'), 'Nice! one more quest');
  assertEquals(postFilter('You are weak.'), null);
  assert((postFilter('a. '.repeat(400)) ?? '').length <= 420);
});

Deno.test('prompt and fallback use real data', () => {
  const p = buildSystemPrompt(ctx);
  assert(p.includes('Call Mom for 10 minutes'));
  assert(p.includes('ship GROW'));
  assert(p.includes('Family'));
  assert(fallbackReply(ctx).includes('Call Mom for 10 minutes'));
  assertEquals(suggestions(ctx)[0], 'Help me start "Call Mom for 10 minutes"');
});

Deno.test('prompt carries memory: yesterday, recent completions, two weakest pillars', () => {
  const p = buildSystemPrompt(ctx);
  assert(p.includes('Yesterday: Health 0 of 2 done (1 skipped, 1 not done), Family 2 of 2 done.'), p);
  assert(p.includes('"Family dinner, phones away" (Family, yesterday)'));
  assert(p.includes('"20-minute run" (Health, today)'));
  // family and fun both average 0; ties keep pillar order.
  assertEquals(pillarAverages(ctx).weakestTwo, ['family', 'fun']);
  assert(p.includes('Weakest pillars over the last 7 days: Family (0%) and Fun (0%).'));
  // Rules sit before the data, so a cut prompt keeps them.
  assert(p.indexOf('HOW YOU TALK') < p.indexOf('WHAT I REMEMBER'));
  const c = buildCompactSystemPrompt(ctx);
  assert(c.length < p.length);
  assert(c.includes('HOW YOU TALK') && c.includes('Yesterday:') && c.includes('Weakest pillars'));
});

Deno.test('new users get a calm memory section', () => {
  const fresh: CoachContext = {
    ...ctx,
    today: { date: '2026-10-21', overall: 0, pillars: zero },
    week: [],
    recentCompletions: [],
    yesterday: {},
  };
  const p = buildSystemPrompt(fresh);
  assert(p.includes('Yesterday: no quests.'));
  assert(p.includes('Last completed quests: none yet.'));
  assert(p.includes('not enough data yet'));
});

const chat = (n: number, len: number): ChatTurn[] =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `${i} `.padEnd(len, 'x'),
  }));

Deno.test('token budget: small requests pass through untouched', () => {
  const system = buildSystemPrompt(ctx);
  const tail: ChatTurn[] = [{ role: 'user', content: 'what now?' }];
  const fit = fitToBudget({
    system,
    compactSystem: buildCompactSystemPrompt(ctx),
    history: chat(10, 200),
    tail,
    budget: DEFAULT_PROMPT_TOKEN_BUDGET,
  });
  assertEquals(fit.droppedTurns, 0);
  assertEquals(fit.compacted, false);
  assertEquals(fit.turns.length, 12);
  assert(fit.estimatedTokens <= DEFAULT_PROMPT_TOKEN_BUDGET);
});

Deno.test('token budget: drops oldest turns first, then compacts, never loses the new message', () => {
  const system = buildSystemPrompt(ctx);
  const compactSystem = buildCompactSystemPrompt(ctx);
  const tail: ChatTurn[] = [{ role: 'user', content: 'what now?' }];
  const history = chat(10, 600);

  // Room for the full prompt plus a few turns.
  const roomy = estimateTurns([{ role: 'system', content: system }, ...tail]) + 500;
  const a = fitToBudget({ system, compactSystem, history, tail, budget: roomy });
  assert(a.droppedTurns > 0 && a.droppedTurns < 10);
  assertEquals(a.compacted, false);
  assert(a.estimatedTokens <= roomy);
  // Kept turns are the newest ones, and never start with an orphan reply.
  assertEquals(a.turns.at(-2)?.content, history[9].content);
  assertEquals(a.turns[1].role, 'user');
  assertEquals(a.turns.at(-1)?.content, 'what now?');

  // Too tight for the full prompt: switch to the compact one.
  const tight = estimateTurns([{ role: 'system', content: compactSystem }, ...tail]) + 50;
  const b = fitToBudget({ system, compactSystem, history, tail, budget: tight });
  assertEquals(b.compacted, true);
  assertEquals(b.truncated, false);
  assert(b.estimatedTokens <= tight);
  assertEquals(b.turns[0].content, compactSystem);
  assertEquals(b.turns.at(-1)?.content, 'what now?');

  // Absurdly tight: the system prompt is cut from the end, rules first.
  const c = fitToBudget({ system, compactSystem, history, tail, budget: 400 });
  assertEquals(c.truncated, true);
  assert(c.estimatedTokens <= 400);
  assert(c.turns[0].content.includes('HOW YOU TALK'));
  assertEquals(c.turns.at(-1)?.content, 'what now?');
});

Deno.test('token budget env value is validated', () => {
  assertEquals(promptBudget(undefined), DEFAULT_PROMPT_TOKEN_BUDGET);
  assertEquals(promptBudget('abc'), DEFAULT_PROMPT_TOKEN_BUDGET);
  assertEquals(promptBudget('-5'), DEFAULT_PROMPT_TOKEN_BUDGET);
  assertEquals(promptBudget('100'), 800);
  assertEquals(promptBudget('6000'), 6000);
});

Deno.test('full prompt with 10 long messages fits the default budget', () => {
  const big: CoachContext = {
    ...ctx,
    quests: Array.from({ length: 8 }, (_, i) => ({
      title: `Quest number ${i} with a fairly long descriptive title here`,
      pillar: 'work' as const,
      status: 'pending' as const,
      xp: 20,
    })),
  };
  const fit = fitToBudget({
    system: buildSystemPrompt(big),
    compactSystem: buildCompactSystemPrompt(big),
    history: chat(10, 600),
    tail: [{ role: 'user', content: 'x'.repeat(500) }],
    budget: DEFAULT_PROMPT_TOKEN_BUDGET,
  });
  assert(fit.estimatedTokens <= DEFAULT_PROMPT_TOKEN_BUDGET);
  console.log('worst-case estimate', fit.estimatedTokens, 'dropped', fit.droppedTurns);
});
