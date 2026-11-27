// Durable Coach turns, end to end against a local Supabase, the real coach
// function and the mock provider (no paid calls):
//   1. send -> disconnect mid-reply -> reopen -> the saved reply is there
//   2. resending the same turn replays it (no new provider call, no new count)
//   3. rapid retry: 3 parallel sends of one turn = 1 message, 1 provider call
//   4. provider timeout -> 'uncertain', no automatic second call;
//      a plain resend does not call; an explicit retry calls once more
//   5. another account cannot read or reuse the turn id
//   6. older apps (no turn id) still get a reply
// Prints time to first text and provider calls per turn.
//
// Run:
//   node supabase/tests/mock_groq.mjs &
//   (serve the coach function with GROQ_BASE_URL=http://127.0.0.1:54399/openai/v1)
//   ANON=<anon key> SR=<service role key> COACH_URL=<.../functions/v1/coach> \
//     node supabase/tests/coach_turns_e2e.mjs
import { randomUUID } from 'node:crypto';
import { createRequire } from 'module';
const require = createRequire(new URL('../../mobile/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const COACH = process.env.COACH_URL ?? `${URL_}/functions/v1/coach`;
const MOCK = process.env.MOCK_GROQ_URL ?? 'http://127.0.0.1:54399';
const ANON = process.env.ANON, SR = process.env.SR;
if (!ANON || !SR) {
  console.error('Set ANON and SR (from `npx supabase status`).');
  process.exit(2);
}
const admin = createClient(URL_, SR, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, extra = '') => {
  results.push([ok, name]);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Math.random().toString(36).slice(2, 7);
const mockCalls = async () => (await (await fetch(`${MOCK}/calls`)).json()).total;

async function mkUser(tag) {
  const email = `${tag}${run}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!x', email_confirm: true });
  if (error) throw error;
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password: 'Passw0rd!x' });
  if (s.error) throw s.error;
  await admin.from('profiles')
    .update({ username: `${tag}${run}`, first_name: tag, onboarding_completed: true, timezone: 'UTC' })
    .eq('id', data.user.id);
  const { data: conv } = await admin.from('conversations').insert({ user_id: data.user.id }).select('id').single();
  return { id: data.user.id, token: s.data.session.access_token, conv: conv.id };
}

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  apikey: ANON,
  'Content-Type': 'application/json',
});

/**
 * Streams one send. `dropAfterText` closes the connection once that many
 * text events arrived (a lost signal). Returns the events seen.
 */
async function send(user, body, { dropAfterText = Infinity } = {}) {
  const started = Date.now();
  const ctl = new AbortController();
  const res = await fetch(COACH, {
    method: 'POST',
    headers: headers(user.token),
    body: JSON.stringify({ stream: true, conversation_id: user.conv, ...body }),
    signal: ctl.signal,
  });
  const out = { status: res.status, events: [], firstTextMs: null, dropped: false };
  if (!res.ok || !res.body) {
    out.body = await res.text();
    return out;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let texts = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = frame.match(/^event: (.*)$/m)?.[1];
        const data = JSON.parse(frame.match(/^data: (.*)$/m)?.[1] ?? 'null');
        out.events.push({ event, data });
        if (event === 'delta') {
          texts += 1;
          out.firstTextMs ??= Date.now() - started;
          if (texts >= dropAfterText) {
            out.dropped = true;
            ctl.abort();
            return out;
          }
        }
      }
    }
  } catch (e) {
    if (!out.dropped) throw e;
  }
  return out;
}

async function turnStatus(user, turnId) {
  const res = await fetch(COACH, {
    method: 'POST',
    headers: headers(user.token),
    body: JSON.stringify({ turn_status: turnId }),
  });
  return { status: res.status, body: await res.json() };
}

async function waitSaved(user, turnId, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const s = await turnStatus(user, turnId);
    if (s.body?.turn?.status === 'saved') return s.body.turn;
    await sleep(300);
  }
  return null;
}

const countRows = async (turnId, role) =>
  (await admin.from('messages').select('id', { count: 'exact', head: true }).eq('turn_id', turnId).eq('role', role)).count;

const metrics = { firstText: {}, turns: {} };
const event = (r, name) => r.events.find((e) => e.event === name)?.data;

// ---------------------------------------------------------------------------
const a = await mkUser('turna');
const b = await mkUser('turnb');
// Something real to be grounded in.
await admin.from('user_goals').upsert({ user_id: a.id, career_goal: 'ship GROW' });
const today = new Date().toISOString().slice(0, 10);
const questInsert = await admin.from('quests').insert({
  user_id: a.id, title: 'Walk 20 minutes', pillar: 'health', xp_reward: 20, difficulty: 'medium',
  assigned_date: today, priority: 1,
});
if (questInsert.error) throw questInsert.error;
await fetch(`${MOCK}/reset`, { method: 'POST' });

// 1. thin slice ---------------------------------------------------------------
const t1 = randomUUID();
const calls0 = await mockCalls();
const first = await send(a, { message: '[slow] Plan my workout', turn_id: t1 }, { dropAfterText: 1 });
check('stream opens and the message is saved before any text', first.status === 200 && event(first, 'meta')?.turn_id === t1);
check('the line drops mid-reply', first.dropped);
metrics.firstText.slowProviderDropped = first.firstTextMs;
const saved = await waitSaved(a, t1);
check('reopen: the turn is saved after the disconnect', saved?.status === 'saved');
check('reopen: the saved reply is the whole reply, not the part shown',
  /together\.$/.test(saved?.assistant_message?.content ?? ''), JSON.stringify(saved?.assistant_message?.content));
const { data: history } = await createClient(URL_, ANON, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${a.token}` } },
}).from('messages').select('role, content, turn_id').eq('conversation_id', a.conv).order('created_at');
check('reopen: chat history (RLS, as the app reads it) has message then reply',
  history?.length === 2 && history[0].role === 'user' && history[1].role === 'assistant'
    && history.every((m) => m.turn_id === t1));
check('grounded: the reply names a real quest', /Walk 20 minutes/.test(saved?.assistant_message?.content ?? ''));
metrics.turns.thinSlice = (await mockCalls()) - calls0;

// 2. replay -------------------------------------------------------------------
const calls1 = await mockCalls();
const replay = await send(a, { message: '[slow] Plan my workout', turn_id: t1 });
check('resend of a saved turn is replayed', event(replay, 'done')?.replayed === true);
check('replay made no provider call', (await mockCalls()) === calls1);
check('replay saved nothing new', (await countRows(t1, 'user')) === 1 && (await countRows(t1, 'assistant')) === 1);
check('replay did not use another message', event(replay, 'meta')?.remaining_today === 19);
metrics.firstText.replayOfSavedTurn = replay.firstTextMs;

// 2b. a normal fresh turn: time to first text with a fast provider ----------------
{
  const tf = randomUUID();
  const callsF = await mockCalls();
  const times = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await send(a, { message: `How do we keep going ${i}`, turn_id: i === 0 ? tf : randomUUID() });
    times.push(r.firstTextMs);
  }
  metrics.firstText.freshTurn = times;
  metrics.turns.freshTurn = ((await mockCalls()) - callsF) / 3;
  const { data: row } = await admin.from('coach_turns').select('first_text_ms, provider_calls').eq('id', tf).single();
  metrics.firstText.freshTurnServerSide = row?.first_text_ms;
  check('fresh turn: one provider call each', metrics.turns.freshTurn === 1);
}

// 3. rapid retry ----------------------------------------------------------------
const t3 = randomUUID();
const calls2 = await mockCalls();
const burst = await Promise.all([1, 2, 3].map(() => send(a, { message: 'Quick question', turn_id: t3 })));
const doneTexts = burst.map((r) => event(r, 'done')?.text).filter(Boolean);
check('rapid retry: every request gets the reply', doneTexts.length === 3 && new Set(doneTexts).size === 1);
check('rapid retry: one provider call', (await mockCalls()) - calls2 === 1, `calls=${(await mockCalls()) - calls2}`);
check('rapid retry: one user message, one reply', (await countRows(t3, 'user')) === 1 && (await countRows(t3, 'assistant')) === 1);
metrics.turns.rapidRetry = (await mockCalls()) - calls2;
metrics.firstText.rapidRetry = burst.map((r) => r.firstTextMs);

// 4. provider timeout -------------------------------------------------------------
const t4 = randomUUID();
const calls3 = await mockCalls();
const slow = await send(a, { message: '[timeout] are you there', turn_id: t4 });
check('timeout: the turn is uncertain with Try again', event(slow, 'turn')?.status === 'uncertain' && event(slow, 'turn')?.can_retry === true,
  JSON.stringify(event(slow, 'turn')));
check('timeout: exactly one provider call (no automatic retry)', (await mockCalls()) - calls3 === 1, `calls=${(await mockCalls()) - calls3}`);
check('timeout: no reply saved', (await countRows(t4, 'assistant')) === 0);
const again = await send(a, { message: '[timeout] are you there', turn_id: t4 });
check('timeout: a plain resend does not call the provider', (await mockCalls()) - calls3 === 1 && event(again, 'turn')?.status === 'uncertain');
// The person taps Try again (the mock answers when the tag is gone).
await admin.from('messages').update({ content: 'are you there' }).eq('turn_id', t4).eq('role', 'user');
const retried = await send(a, { message: 'are you there', turn_id: t4, retry: true });
check('timeout: explicit Try again answers', Boolean(event(retried, 'done')?.text));
check('timeout: Try again made one more call', (await mockCalls()) - calls3 === 2);
const quota = await (await fetch(COACH, { method: 'POST', headers: headers(a.token), body: JSON.stringify({ status: true }) })).json();
check('quota: 6 turns used 6 messages (resends and retries counted once)', quota.sent_today === 6, `sent_today=${quota.sent_today}`);
metrics.turns.timeoutThenRetry = (await mockCalls()) - calls3;

// 5. ownership ---------------------------------------------------------------------
const steal = await send(b, { message: 'mine now', turn_id: t1 });
check('another account cannot reuse a turn id', steal.status === 409, `status=${steal.status}`);
const peek = await turnStatus(b, t1);
check('another account cannot read the turn', peek.status === 404);
const { data: bRows } = await createClient(URL_, ANON, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${b.token}` } },
}).from('coach_turns').select('id');
check('RLS: another account sees none of the turns', (bRows ?? []).length === 0);

// 6. older app (no turn id, JSON) -------------------------------------------------------
const legacy = await fetch(COACH, {
  method: 'POST', headers: headers(b.token),
  body: JSON.stringify({ message: 'hello', conversation_id: b.conv }),
});
const legacyBody = await legacy.json();
check('older apps still get a JSON reply with a server-made turn id',
  legacy.status === 200 && typeof legacyBody.ai_message?.content === 'string' && typeof legacyBody.turn_id === 'string');

// ---------------------------------------------------------------------------
console.log('\nMETRICS', JSON.stringify({
  time_to_first_text_ms: metrics.firstText,
  provider_calls_per_turn: metrics.turns,
}));
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
