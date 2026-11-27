// Coach: synthetic conversations in English, French and Arabic, run through
// the real turn logic (runTurn) with mocked providers and an in-memory copy of
// the 0046 rules. No database, no network, no paid calls: this runs in CI.
//
// Deterministic checks: message order, ownership, quota use, provider calls
// per turn, recovery. Reply quality: the rubric in docs/coach-reply-rubric.md
// (scoreReply). Prints time to first text and provider calls per turn.
//
//   deno test --allow-env --allow-read supabase/functions/_shared/__tests__/coachConversations_test.ts

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { buildSystemPrompt, type CoachContext } from '../coachText.ts';
import { checkGrounding, detectLang, type Lang, scoreReply } from '../coachGrounding.ts';
import { safetyResponse } from '../intents.ts';
import {
  futureSelfProvider,
  inventingProvider,
  MemoryCoach,
  type ProviderSpy,
  refusedProvider,
  sendTurn,
  STALE_MS,
  textProvider,
  timeoutProvider,
} from './memoryCoach.ts';

// ---- synthetic people ------------------------------------------------------------

const zero = { health: 0, family: 0, work: 0, fun: 0, spirituality: 0 };

function person(over: Partial<CoachContext>): CoachContext {
  return {
    firstName: 'friend',
    localTime: { hour: 9, weekday: 'Tuesday' },
    goals: {},
    level: 3,
    totalXp: 2600,
    xpToNextLevel: 2400,
    streak: 4,
    bestStreak: 9,
    streakFreezes: 1,
    today: { date: '2026-11-25', overall: 40, pillars: { ...zero, health: 50, work: 70 } },
    week: [],
    quests: [],
    missedThisWeek: 1,
    badges: [],
    recentCompletions: [],
    yesterday: {},
    ...over,
  };
}

interface Conversation {
  lang: Lang;
  user: string;
  ctx: CoachContext;
  messages: string[];
}

const CONVERSATIONS: Conversation[] = [
  {
    lang: 'en',
    user: 'user-en',
    ctx: person({
      firstName: 'Sam',
      goals: { career_goal: 'ship my side project', hobbies: ['guitar'] },
      quests: [
        { title: 'Walk 20 minutes', pillar: 'health', xp: 20, status: 'pending' },
        { title: 'Call Mom', pillar: 'family', xp: 10, status: 'done' },
      ],
      recentCompletions: [{ title: 'Call Mom', pillar: 'family', xp: 10, daysAgo: 0 }],
    }),
    messages: ['What should I do next?', 'Am I on track this week?', 'Thanks, I will try'],
  },
  {
    lang: 'fr',
    user: 'user-fr',
    ctx: person({
      firstName: 'Camille',
      streak: 6,
      goals: { career_goal: 'finir mon mémoire', hobbies: ['piano'] },
      quests: [
        { title: 'Lire 10 pages', pillar: 'work', xp: 20, status: 'pending' },
        { title: 'Dîner en famille', pillar: 'family', xp: 20, status: 'pending' },
      ],
    }),
    messages: ["Qu'est-ce que je fais maintenant ?", 'Je suis fatiguée aujourd’hui, on fait quoi ?', 'Merci pour ton aide'],
  },
  {
    lang: 'ar',
    user: 'user-ar',
    ctx: person({
      firstName: 'Yasmine',
      streak: 2,
      bestStreak: 5,
      goals: { spiritual_goal: 'الصلاة في وقتها', hobbies: ['القراءة'] },
      quests: [
        { title: 'قراءة صفحتين من القرآن', pillar: 'spirituality', xp: 10, status: 'pending' },
        { title: 'المشي 15 دقيقة', pillar: 'health', xp: 20, status: 'pending' },
      ],
    }),
    messages: ['ماذا أفعل الآن؟', 'هل أنا على الطريق الصحيح؟', 'شكرا لك'],
  },
];

// ---- metrics collected across the suite ----------------------------------------

const metrics: { scenario: string; providerCalls: number; firstTextMs: number | null }[] = [];
function record(scenario: string, calls: number, firstTextMs: number | null) {
  metrics.push({ scenario, providerCalls: calls, firstTextMs });
}

let n = 0;
const uuid = () => crypto.randomUUID();
function setup(user: string) {
  const coach = new MemoryCoach();
  const conv = `conv-${user}-${(n += 1)}`;
  coach.addConversation(conv, user);
  return { coach, conv };
}
const textOf = (s: { events: { event: string; data: Record<string, unknown> }[] }) =>
  (s.events.find((e) => e.event === 'done')?.data.text as string | undefined) ?? null;
const turnEvent = (s: { events: { event: string; data: Record<string, unknown> }[] }) =>
  s.events.find((e) => e.event === 'turn')?.data;

// ---- conversations: grounding, rubric, order, quota --------------------------------

for (const c of CONVERSATIONS) {
  Deno.test(`[${c.lang}] a 3-turn conversation is grounded, in order, and counts 3 messages`, async () => {
    const { coach, conv } = setup(c.user);
    const spy: ProviderSpy = { calls: 0 };
    const system = buildSystemPrompt(c.ctx);
    const turnIds: string[] = [];
    for (const text of c.messages) {
      const turnId = uuid();
      turnIds.push(turnId);
      const before = spy.calls;
      const sent = await sendTurn(coach, {
        user: c.user, conversationId: conv, turnId, text, system, spy,
        provider: futureSelfProvider({ firstMs: 30, gapMs: 2 }),
      });
      const reply = textOf(sent);
      assert(reply, `no reply for "${text}"`);
      record(`${c.lang} conversation turn`, spy.calls - before, sent.result?.firstTextMs ?? null);
      const score = scoreReply(reply, c.ctx, c.lang);
      assert(score.pass, `rubric failed for ${c.lang}: ${JSON.stringify(score)} reply=${reply}`);
      assert(score.grounded, `not grounded: ${reply}`);
      assertEquals(detectLang(text), c.lang, 'fixture language');
    }
    // Order: user, reply, user, reply... each pair shares its turn id.
    const rows = coach.messages.filter((m) => m.conversationId === conv);
    assertEquals(rows.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    assertEquals(rows.map((m) => m.turnId), turnIds.flatMap((t) => [t, t]));
    assertEquals(rows.filter((m) => m.role === 'user').map((m) => m.content), c.messages);
    // Quota and paid calls: one each per turn.
    assertEquals(coach.sentToday(c.user), 3);
    assertEquals(spy.calls, 3);
  });

  Deno.test(`[${c.lang}] invented progress is caught by the rubric`, async () => {
    const { coach, conv } = setup(c.user);
    const spy: ProviderSpy = { calls: 0 };
    const sent = await sendTurn(coach, {
      user: c.user, conversationId: conv, turnId: uuid(), text: c.messages[0],
      system: buildSystemPrompt(c.ctx), spy, provider: inventingProvider(),
    });
    const reply = textOf(sent)!;
    const score = scoreReply(reply, c.ctx, c.lang);
    assertFalse(score.noInventedProgress, `should flag: ${reply}`);
    assertFalse(score.pass);
    assert(score.invented.some((x) => x.startsWith('streak 42')), JSON.stringify(score.invented));
    assert(score.invented.some((x) => x.includes('is done')), JSON.stringify(score.invented));
  });
}

Deno.test('grounding: hand-written good and bad replies in three languages', () => {
  const [en, fr, ar] = CONVERSATIONS.map((c) => c.ctx);
  // Good
  assert(scoreReply(`We already did "Call Mom" today. Let's take "Walk 20 minutes" next and keep our 4-day streak.`, en, 'en').pass);
  assert(scoreReply(`On garde nos 6 jours d'affilée : on commence par « Lire 10 pages », pour finir mon mémoire.`, fr, 'fr').pass);
  assert(scoreReply('لنبدأ بـ «قراءة صفحتين من القرآن» ونحافظ على سلسلتنا من 2 أيام معًا.', ar, 'ar').pass);
  // Generic: no real item
  assertFalse(scoreReply('Stay hydrated and believe in yourself, we can do it.', en, 'en').grounded);
  // Invented numbers / quests
  assert(checkGrounding('We are at level 7 with 9999 XP.', en).invented.length === 2);
  assert(checkGrounding('Let\'s do "Run 10 km" today.', en).invented[0].startsWith('unknown quest'));
  assert(checkGrounding('On a terminé « Lire 10 pages », bravo !', fr).invented.some((x) => x.includes('is done')));
  assert(checkGrounding('Health is at 99% today.', en).invented.includes('score 99%'));
  // Wrong language and lecturing
  assertFalse(scoreReply(`Let's do "Lire 10 pages" now, we can.`, fr, 'fr').sameLanguage);
  assertFalse(scoreReply(`You should do "Walk 20 minutes" now.`, en, 'en').safe);
});

// ---- recovery and duplicate-call rules ---------------------------------------------------

const EN = CONVERSATIONS[0];
const sys = buildSystemPrompt(EN.ctx);

Deno.test('provider timeout: uncertain, no automatic second call, explicit Try again calls once more', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  const first = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hi', system: sys, spy, provider: timeoutProvider(5) });
  assertEquals(turnEvent(first)?.status, 'uncertain');
  assertEquals(turnEvent(first)?.can_retry, true);
  assertEquals(spy.calls, 1);
  assertEquals(coach.messages.filter((m) => m.role === 'assistant').length, 0, 'nothing invented as a reply');

  // App reconnects / restarts and resends the same turn: no call.
  const resend = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hi', system: sys, spy, provider: futureSelfProvider() });
  assertEquals(turnEvent(resend)?.status, 'uncertain');
  assertEquals(spy.calls, 1);

  // The person taps Try again.
  const retry = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hi', system: sys, spy, provider: futureSelfProvider(), explicitRetry: true });
  assert(textOf(retry));
  assertEquals(spy.calls, 2);
  assertEquals(coach.sentToday('u'), 1, 'still one message used');
  record('timeout then Try again', 2, retry.result?.firstTextMs ?? null);
});

Deno.test('provider timeout cap: at most 3 paid calls per turn', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  for (let i = 0; i < 5; i += 1) {
    await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hi', system: sys, spy, provider: timeoutProvider(), explicitRetry: i > 0 });
  }
  assertEquals(spy.calls, 3);
  assertEquals((await coach.store('u').get(turnId))?.can_retry, false);
});

Deno.test('older apps (no turn id): a timeout still gives the saved fallback reply', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const sent = await sendTurn(coach, { user: 'u', conversationId: conv, turnId: uuid(), text: 'hi', system: sys, spy, provider: timeoutProvider(), onUncertain: 'fallback' });
  assert(textOf(sent)?.startsWith('Today is still wide open'));
  assertEquals(sent.result?.view.degraded, true);
  assertEquals(spy.calls, 1);
});

Deno.test('provider refused before any text: rule-based fallback, saved and marked degraded', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const sent = await sendTurn(coach, { user: 'u', conversationId: conv, turnId: uuid(), text: 'hi', system: sys, spy, provider: refusedProvider() });
  assertEquals(sent.result?.view.status, 'saved');
  assertEquals(sent.result?.view.degraded, true);
  assertEquals(spy.calls, 1);
});

Deno.test('dropped stream mid-reply: the whole reply is still saved', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  const sent = await sendTurn(coach, {
    user: 'u', conversationId: conv, turnId, text: 'What should I do next?', system: sys, spy,
    provider: futureSelfProvider({ gapMs: 2 }), goneAfterText: 1,
  });
  assertEquals(sent.events.filter((e) => e.event === 'delta').length, 1, 'the app saw only the first words');
  const view = await coach.store('u').get(turnId);
  assertEquals(view?.status, 'saved');
  assert(view?.assistant_message?.content.includes('Walk 20 minutes'), view?.assistant_message?.content);
});

Deno.test('dropped stream after save: reopening replays the reply with no provider call', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  const first = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hey', system: sys, spy, provider: futureSelfProvider() });
  // The 'done' event was lost on the way; the app resends the turn.
  const again = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hey', system: sys, spy, provider: futureSelfProvider() });
  assertEquals(textOf(again), textOf(first));
  assertEquals(again.events.find((e) => e.event === 'done')?.data.replayed, true);
  assertEquals(spy.calls, 1);
  assertEquals(coach.messages.length, 2);
  assertEquals(coach.sentToday('u'), 1);
  record('replay of a saved turn', 0, again.result?.firstTextMs ?? null);
});

Deno.test('rapid retry: three parallel sends of one turn make one provider call', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  const send = () => sendTurn(coach, {
    user: 'u', conversationId: conv, turnId, text: 'quick', system: sys, spy,
    provider: futureSelfProvider({ firstMs: 40, gapMs: 3 }),
  });
  const all = await Promise.all([send(), send(), send()]);
  const texts = all.map(textOf);
  assert(texts.every((t) => t && t === texts[0]), JSON.stringify(texts));
  assertEquals(spy.calls, 1);
  assertEquals(coach.messages.map((m) => m.role), ['user', 'assistant']);
  assertEquals(coach.sentToday('u'), 1);
  record('rapid retry x3', spy.calls, all[0].result?.firstTextMs ?? null);
});

Deno.test('app restart: a turn whose worker died before the AI call is resumed for free', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  coach.begin('u', conv, turnId, 'hello'); // saved and counted, then the worker died
  const resumed = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hello', system: sys, spy, provider: futureSelfProvider() });
  assert(textOf(resumed));
  assertEquals(spy.calls, 1);
  assertEquals(coach.sentToday('u'), 1);
});

Deno.test('app restart: a turn whose worker died during the AI call is uncertain, never auto-retried', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  coach.begin('u', conv, turnId, 'hello');
  await coach.store('u').claimProviderCall(turnId, false); // call started, worker died
  coach.skewMs = STALE_MS + 1000;
  const reopen = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hello', system: sys, spy, provider: futureSelfProvider() });
  assertEquals(turnEvent(reopen)?.status, 'uncertain');
  assertEquals(spy.calls, 0);
  const retry = await sendTurn(coach, { user: 'u', conversationId: conv, turnId, text: 'hello', system: sys, spy, provider: futureSelfProvider(), explicitRetry: true });
  assert(textOf(retry));
  assertEquals(spy.calls, 1);
});

Deno.test('switching accounts mid-stream: the turn stays with its owner', async () => {
  const coach = new MemoryCoach();
  coach.addConversation('conv-a', 'alice');
  coach.addConversation('conv-b', 'badr');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  // Alice's reply is still streaming when Badr signs in on the same phone.
  const aliceSend = sendTurn(coach, {
    user: 'alice', conversationId: 'conv-a', turnId, text: 'private', system: sys, spy,
    provider: futureSelfProvider({ firstMs: 30, gapMs: 3 }), goneAfterText: 1,
  });
  await new Promise((r) => setTimeout(r, 10));
  // Badr's app (wrongly) reuses the id, in his chat and in hers.
  const stealOwn = await sendTurn(coach, { user: 'badr', conversationId: 'conv-b', turnId, text: 'x', system: sys, spy, provider: futureSelfProvider() });
  const stealHers = await sendTurn(coach, { user: 'badr', conversationId: 'conv-a', turnId, text: 'x', system: sys, spy, provider: futureSelfProvider() });
  assertEquals(stealOwn.status, 409);
  assertEquals(stealHers.status, 409);
  assertEquals(await coach.store('badr').get(turnId), null, 'Badr cannot read it');
  await aliceSend;
  // Alice's reply was saved in Alice's chat; Badr has nothing and used nothing.
  assertEquals((await coach.store('alice').get(turnId))?.status, 'saved');
  assertEquals(coach.messages.filter((m) => m.conversationId === 'conv-b').length, 0);
  assertEquals(coach.sentToday('badr'), 0);
  assertEquals(spy.calls, 1);
});

Deno.test('Stop: only the words already on screen are saved', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const turnId = uuid();
  const store = coach.store('u');
  const sent = await sendTurn(coach, {
    user: 'u', conversationId: conv, turnId, system: sys, spy,
    text: 'tell me a long story',
    provider: textProvider('One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two.', { gapMs: 1 }),
    goneAfterText: 1,
    onGone: async () => {
      await store.settle(turnId, 'stopped', 'stopped_by_user');
    },
  });
  const shown = sent.events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('').trim();
  const saved = (await store.get(turnId))?.assistant_message?.content;
  assertEquals(saved, shown);
});

Deno.test('crisis words never reach the provider', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const sent = await sendTurn(coach, {
    user: 'u', conversationId: conv, turnId: uuid(), text: 'I want to end it all', system: sys, spy,
    provider: futureSelfProvider(), safetyReply: safetyResponse('crisis'),
  });
  assertEquals(spy.calls, 0);
  assertEquals(textOf(sent), safetyResponse('crisis'));
});

Deno.test('daily quota: the 21st new turn is refused, resends of old turns are not', async () => {
  const { coach, conv } = setup('u');
  const spy: ProviderSpy = { calls: 0 };
  const ids: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const id = uuid();
    ids.push(id);
    await sendTurn(coach, { user: 'u', conversationId: conv, turnId: id, text: `m${i}`, system: sys, spy, provider: textProvider('We got this, one step at a time.') });
  }
  const over = await sendTurn(coach, { user: 'u', conversationId: conv, turnId: uuid(), text: 'one more', system: sys, spy, provider: futureSelfProvider() });
  assertEquals(over.status, 429);
  const resend = await sendTurn(coach, { user: 'u', conversationId: conv, turnId: ids[3], text: 'm3', system: sys, spy, provider: futureSelfProvider() });
  assertEquals(resend.status, 200);
  assertEquals(coach.sentToday('u'), 20);
  assertEquals(spy.calls, 20);
});

Deno.test('report: time to first text and provider calls per turn (mocked provider)', () => {
  const by = new Map<string, { calls: number[]; ttft: number[] }>();
  for (const m of metrics) {
    const row = by.get(m.scenario) ?? { calls: [], ttft: [] };
    row.calls.push(m.providerCalls);
    if (m.firstTextMs !== null) row.ttft.push(m.firstTextMs);
    by.set(m.scenario, row);
  }
  const median = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
  console.log('\nscenario | provider calls per turn | median time to first text (ms)');
  for (const [k, v] of by) {
    console.log(`${k} | ${Math.max(...v.calls)} | ${median(v.ttft)}`);
  }
  // Never more than one paid call per turn without an explicit retry.
  for (const m of metrics) {
    if (!m.scenario.includes('Try again')) assert(m.providerCalls <= 1, m.scenario);
  }
});
