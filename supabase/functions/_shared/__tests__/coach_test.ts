// deno test supabase/functions/_shared/__tests__/coach_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { classifyIntent } from '../intents.ts';
import {
  buildSystemPrompt,
  type CoachContext,
  fallbackReply,
  postFilter,
  suggestions,
} from '../coachText.ts';

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
