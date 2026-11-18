// Realtime friends leaderboard (migration 0026), end to end on a local
// Supabase: view RLS, private xp:<user> topic joins, live XP events,
// forged broadcasts, cheers and their rate limits. Creates throwaway users.
import { createRequire } from 'module';
const require = createRequire(new URL('../../mobile/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Run against a local stack: npx supabase start, then
//   ANON=<anon key> SR=<service role key> node supabase/tests/friends_realtime_e2e.mjs
const ANON = process.env.ANON, SR = process.env.SR;
const admin = createClient(URL_, SR, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mkUser(tag) {
  const email = `${tag}${Date.now()}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!x', email_confirm: true });
  if (error) throw error;
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password: 'Passw0rd!x' });
  if (s.error) throw s.error;
  await admin.from('profiles').update({ username: `${tag}${Date.now() % 100000}`, first_name: tag, onboarding_completed: true }).eq('id', data.user.id);
  return { id: data.user.id, c };
}
const A = await mkUser('ana'), B = await mkUser('bob'), C = await mkUser('cara'), D = await mkUser('dan');
await admin.from('profiles').update({ stats_visibility: 'private' }).eq('id', D.id);
for (const [x, y] of [[A, B], [A, D]]) {
  const { error } = await admin.from('friendships').insert({ requester: x.id, addressee: y.id, status: 'accepted', responded_at: new Date().toISOString() });
  if (error) throw error;
}

// 1. view
const v = await A.c.from('friends_weekly_xp').select('*');
const ids = (v.data ?? []).map((r) => r.id);
check('view: A sees self + friends only', !v.error && ids.includes(A.id) && ids.includes(B.id) && ids.includes(D.id) && !ids.includes(C.id), v.error?.message ?? '');
const dRow = v.data.find((r) => r.id === D.id);
check('view: private friend has null XP', dRow && dRow.weekly_xp === null && dRow.stats_shared === false);
const cv = await C.c.from('friends_weekly_xp').select('id');
check('view: stranger sees only self', cv.data?.length === 1 && cv.data[0].id === C.id);
const rpc = await A.c.rpc('friend_leaderboard');
check('friend_leaderboard RPC still works', !rpc.error && rpc.data.length === 3, rpc.error?.message ?? '');

// 2. channel joins
async function join(user, topic) {
  await user.c.realtime.setAuth();
  const events = [];
  const ch = user.c.channel(topic, { config: { private: true } }).on('broadcast', { event: 'xp_changed' }, (m) => events.push(m.payload));
  const status = await new Promise((res) => { ch.subscribe((s, err) => { if (s !== 'CLOSED') res(s); }); setTimeout(() => res('TIMEOUT'), 8000); });
  return { ch, status, events };
}
const aB = await join(A, `xp:${B.id}`);
check('realtime: friend A can join xp:B', aB.status === 'SUBSCRIBED', aB.status);
const cB = await join(C, `xp:${B.id}`);
check('realtime: stranger C is refused on xp:B', cB.status !== 'SUBSCRIBED', cB.status);
const aD = await join(A, `xp:${D.id}`);
check('realtime: A refused on private-stats friend D', aD.status !== 'SUBSCRIBED', aD.status);
const bB = await join(B, `xp:${B.id}`);
check('realtime: B can join own topic', bB.status === 'SUBSCRIBED', bB.status);

// 3. B completes a quest
const assigned = await B.c.rpc('assign_daily_quests', { p_date: new Date().toISOString().slice(0, 10) });
const quest = (assigned.data ?? [])[0];
check('B has assigned quests', !!quest, assigned.error?.message ?? '');
const comp = await B.c.rpc('complete_quest', { p_quest_id: quest.id });
check('B completes a quest', !comp.error, comp.error?.message ?? '');
const t0 = Date.now();
while (aB.events.length < 1 && Date.now() - t0 < 10000) await sleep(100);
console.log(`  first event after ${Date.now() - t0} ms`);
check('realtime: A received xp_changed for B', aB.events.length === 1 && aB.events[0].user_id === B.id && aB.events[0].xp_delta > 0, JSON.stringify(aB.events));
check('realtime: payload has no quest details', aB.events[0] && !('quest_id' in aB.events[0]));
check('realtime: C received nothing', cB.events.length === 0);
const v2 = await A.c.from('friends_weekly_xp').select('id, weekly_xp').eq('id', B.id).single();
check('view: B weekly XP updated', v2.data?.weekly_xp > 0, JSON.stringify(v2.data));

// undo
const undo = await B.c.rpc('undo_quest_completion', { p_quest_id: quest.id });
const t1 = Date.now();
while (aB.events.length < 2 && Date.now() - t1 < 10000) await sleep(100);
console.log(`  undo event after ${Date.now() - t1} ms`);
check('realtime: undo sends a negative delta', !undo.error && aB.events.length === 2 && aB.events[1].xp_delta < 0, undo.error?.message ?? JSON.stringify(aB.events));

// 4. quest_completions stays private
const qc = await A.c.from('quest_completions').select('*').eq('user_id', B.id);
check('RLS: A cannot read B quest_completions', (qc.data ?? []).length === 0);

// 5. forged broadcast
const forged = await aB.ch.send({ type: 'broadcast', event: 'xp_changed', payload: { user_id: B.id, xp_delta: 9999 } });
await sleep(1500);
check('realtime: A cannot publish fake XP on xp:B', [...bB.events, ...aB.events].every((e) => e.xp_delta !== 9999), `send=${forged}`);

// 6. cheers
const ch1 = await A.c.rpc('send_cheer', { p_friend: B.id });
check('cheer: A cheers B', !ch1.error, ch1.error?.message ?? '');
const ch2 = await A.c.rpc('send_cheer', { p_friend: B.id });
check('cheer: second cheer within 3h is refused', ch2.error?.message === 'cheer_cooldown', ch2.error?.message);
const ch3 = await C.c.rpc('send_cheer', { p_friend: B.id });
check('cheer: stranger cannot cheer', ch3.error?.message === 'not_friends', ch3.error?.message);
const ch4 = await A.c.from('cheers').insert({ from_user: A.id, to_user: C.id });
check('cheer: direct insert refused', !!ch4.error, ch4.error?.message);
const seenB = await B.c.from('cheers').select('id');
const seenC = await C.c.from('cheers').select('id');
check('cheer: recipient sees it, outsider does not', seenB.data?.length === 1 && seenC.data?.length === 0);
const v3 = await A.c.from('friends_weekly_xp').select('last_cheered_at').eq('id', B.id).single();
check('view: last_cheered_at set for B', !!v3.data?.last_cheered_at);

// blocked pair can't cheer
await admin.from('friendships').update({ status: 'blocked', blocked_by: B.id }).match({ requester: A.id, addressee: B.id });
await admin.from('cheers').delete().eq('from_user', A.id);
const ch5 = await A.c.rpc('send_cheer', { p_friend: B.id });
check('cheer: blocked pair refused', ch5.error?.message === 'not_friends', ch5.error?.message);

for (const u of [A, B, C, D]) await u.c.removeAllChannels();
const fails = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
