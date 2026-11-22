// Friends, end to end on a local Supabase, the way the app uses it:
// search by username, send / accept / decline / cancel, block and unblock,
// invite codes, friends-only privacy and the weekly XP leaderboard, plus
// the live "friends:<user>" topic from migration 0041 (both sides hear
// requests, answers, unfriends and blocks; nobody else can listen or send).
// Creates throwaway users with random names, so it is safe to re-run.
//
// Run against a local stack (with realtime): npx supabase start, then
//   ANON=<anon key> SR=<service role key> node supabase/tests/friends_flow_e2e.mjs
import { createRequire } from 'module';
const require = createRequire(new URL('../../mobile/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
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

async function mkUser(tag) {
  const email = `${tag}${run}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!x', email_confirm: true });
  if (error) throw error;
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password: 'Passw0rd!x' });
  if (s.error) throw s.error;
  const username = `${tag}${run}`;
  await admin.from('profiles')
    .update({ username, first_name: tag, onboarding_completed: true })
    .eq('id', data.user.id);
  const { data: p } = await admin.from('profiles').select('invite_code').eq('id', data.user.id).single();
  return { id: data.user.id, c, username, invite: p.invite_code };
}

// Listen on a user's private friends topic, like useFriendshipRealtime.
async function listen(user, topic = `friends:${user.id}`) {
  await user.c.realtime.setAuth();
  const events = [];
  const ch = user.c
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'friendship_changed' }, (m) => events.push(m.payload));
  const status = await new Promise((res) => {
    ch.subscribe((s) => { if (s !== 'CLOSED') res(s); });
    setTimeout(() => res('TIMEOUT'), 8000);
  });
  return { ch, status, events };
}
async function waitFor(fn, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return Date.now() - start;
    await sleep(50);
  }
  return -1;
}

const A = await mkUser('fana'), B = await mkUser('fbob'), C = await mkUser('fcara'), D = await mkUser('fdan');

// ---------------------------------------------------------------- topics
const aIn = await listen(A), bIn = await listen(B), cIn = await listen(C);
check('topic: A joins own friends topic', aIn.status === 'SUBSCRIBED', aIn.status);
check('topic: B joins own friends topic', bIn.status === 'SUBSCRIBED', bIn.status);
const cOnB = await listen(C, `friends:${B.id}`);
check('topic: C is refused on friends:B', cOnB.status !== 'SUBSCRIBED', cOnB.status);
await sleep(1500); // first broadcast on a fresh stack can lag; let joins settle

// ---------------------------------------------------------------- search
const s1 = await A.c.rpc('search_users', { p_query: B.username });
check('search: A finds B by exact username', !s1.error && s1.data.length === 1 && s1.data[0].id === B.id && s1.data[0].relation === 'none', s1.error?.message ?? '');
const s2 = await A.c.rpc('search_users', { p_query: `fbob${run}`.slice(0, 5) });
check('search: prefix works', !s2.error && s2.data.some((r) => r.id === B.id));
check('search: result has no invite code or email', s1.data && !('invite_code' in s1.data[0]) && !('email' in s1.data[0]));
const strangerProfile = await A.c.from('profiles').select('id').eq('id', B.id);
check('privacy: stranger profile is not readable', !strangerProfile.error && strangerProfile.data.length === 0);

// ---------------------------------------------------------------- request
const send = await A.c.rpc('send_friend_request', { p_addressee: B.id });
check('request: A sends to B', !send.error && send.data.status === 'pending', send.error?.message ?? '');
let t = await waitFor(() => bIn.events.length > 0);
check('live: B hears the new request', t >= 0, `${t} ms`);
check('live: payload carries no ids or status', bIn.events[0] && Object.keys(bIn.events[0]).every((k) => ['at', 'id'].includes(k)), JSON.stringify(bIn.events[0]));
check('live: C hears nothing', cIn.events.length === 0 && cOnB.events.length === 0);
const dup = await A.c.rpc('send_friend_request', { p_addressee: B.id });
check('request: duplicate refused', dup.error?.message.includes('request_already_pending'), dup.error?.message);
const bReq = await B.c.from('friendships').select('id, requester, status').eq('status', 'pending');
check('request: B sees it as incoming', bReq.data?.length === 1 && bReq.data[0].requester === A.id);
const bSeesA = await B.c.from('profiles').select('id, username').eq('id', A.id);
check('privacy: pending pair can read each other profile', bSeesA.data?.length === 1);
const selfAccept = await A.c.rpc('respond_friend_request', { p_friendship: send.data.id, p_accept: true });
check('request: requester cannot accept own request', !!selfAccept.error, selfAccept.error?.message);
const direct = await A.c.from('friendships').update({ status: 'accepted' }).eq('id', send.data.id).select();
check('request: direct update does nothing', (direct.data ?? []).length === 0);

// ---------------------------------------------------------------- accept
aIn.events.length = 0; bIn.events.length = 0;
const acc = await B.c.rpc('respond_friend_request', { p_friendship: send.data.id, p_accept: true });
check('accept: B accepts', !acc.error && acc.data.status === 'accepted', acc.error?.message ?? '');
t = await waitFor(() => aIn.events.length > 0);
check('live: A hears the accept', t >= 0, `${t} ms`);

// ---------------------------------------------------------------- leaderboard
const { data: bq } = await admin.from('quests').select('id').eq('user_id', B.id).limit(1);
let bQuest = bq?.[0]?.id;
if (!bQuest) {
  const g = await B.c.rpc('assign_daily_quests');
  const again = await admin.from('quests').select('id').eq('user_id', B.id).limit(1);
  bQuest = again.data?.[0]?.id;
  if (!bQuest) console.log('  (no quests:', g.error?.message, ')');
}
if (bQuest) {
  const done = await B.c.rpc('complete_quest', { p_quest_id: bQuest });
  check('leaderboard: B completes a quest', !done.error, done.error?.message ?? '');
}
const lb = await A.c.from('friends_weekly_xp').select('id, is_me, weekly_xp, stats_shared');
const lbIds = (lb.data ?? []).map((r) => r.id);
check('leaderboard: A sees self + B, not C', lbIds.includes(A.id) && lbIds.includes(B.id) && !lbIds.includes(C.id), lb.error?.message ?? '');
const bRow = lb.data?.find((r) => r.id === B.id);
check('leaderboard: B weekly XP counted', bRow && (bQuest ? bRow.weekly_xp > 0 : bRow.weekly_xp === 0), JSON.stringify(bRow));
await admin.from('profiles').update({ stats_visibility: 'private' }).eq('id', B.id);
const lbPriv = await A.c.from('friends_weekly_xp').select('id, weekly_xp, stats_shared').eq('id', B.id);
check('leaderboard: private stats hide XP', lbPriv.data?.[0]?.weekly_xp === null && lbPriv.data?.[0]?.stats_shared === false);
await admin.from('profiles').update({ stats_visibility: 'friends' }).eq('id', B.id);

// ---------------------------------------------------------------- unfriend (delete)
aIn.events.length = 0; bIn.events.length = 0;
const del = await A.c.from('friendships').delete().eq('id', send.data.id).select();
check('unfriend: A removes B', !del.error && del.data.length === 1, del.error?.message ?? '');
t = await waitFor(() => bIn.events.length > 0);
check('live: B hears the unfriend (delete)', t >= 0, `${t} ms`);
const afterDel = await B.c.from('friends_weekly_xp').select('id');
check('unfriend: A gone from B leaderboard', !(afterDel.data ?? []).some((r) => r.id === A.id));

// ---------------------------------------------------------------- decline + cancel
const s3 = await C.c.rpc('send_friend_request', { p_addressee: A.id });
await A.c.rpc('respond_friend_request', { p_friendship: s3.data.id, p_accept: false });
const again = await C.c.rpc('send_friend_request', { p_addressee: A.id });
check('decline: C cannot re-ask within 7 days', again.error?.message.includes('request_declined_recently'), again.error?.message);
const s4 = await D.c.rpc('send_friend_request', { p_addressee: B.id });
bIn.events.length = 0;
const cancel = await D.c.from('friendships').delete().eq('id', s4.data.id).select();
check('cancel: D cancels own request', !cancel.error && cancel.data.length === 1);
t = await waitFor(() => bIn.events.length > 0);
check('live: B hears the cancel', t >= 0, `${t} ms`);

// ---------------------------------------------------------------- invite code
const own = await A.c.rpc('redeem_invite', { p_code: A.invite });
check('invite: own code refused', own.data?.redeemed === false && own.data.reason === 'own_code');
const bad = await A.c.rpc('redeem_invite', { p_code: 'NOPE0000' });
check('invite: unknown code refused', bad.data?.redeemed === false && bad.data.reason === 'invalid_code');
aIn.events.length = 0; bIn.events.length = 0;
const red = await A.c.rpc('redeem_invite', { p_code: B.invite.toLowerCase() });
check('invite: A redeems B code (any case)', red.data?.redeemed === true, JSON.stringify(red.data ?? red.error));
t = await waitFor(() => bIn.events.length > 0 && aIn.events.length > 0);
check('live: both hear the invite connect', t >= 0, `${t} ms`);
const re = await A.c.rpc('redeem_invite', { p_code: B.invite });
check('invite: second redeem says already connected', re.data?.reason === 'already_connected');

// ---------------------------------------------------------------- block
aIn.events.length = 0;
const blk = await B.c.rpc('block_user', { p_user: A.id });
check('block: B blocks A', !blk.error, blk.error?.message ?? '');
t = await waitFor(() => aIn.events.length > 0);
check('live: A (blocked side) is told to refresh', t >= 0, `${t} ms`);
const aCircle = await A.c.from('friends_weekly_xp').select('id');
check('block: B gone from A leaderboard', !(aCircle.data ?? []).some((r) => r.id === B.id));
const pairB = `and(requester.eq.${B.id},addressee.eq.${A.id}),and(requester.eq.${A.id},addressee.eq.${B.id})`;
const aRows = await A.c.from('friendships').select('id').or(pairB);
check('block: A cannot see the block row', (aRows.data ?? []).length === 0);
const aProf = await A.c.from('profiles').select('id').eq('id', B.id);
check('block: A cannot read B profile', (aProf.data ?? []).length === 0);
const aSearch = await A.c.rpc('search_users', { p_query: B.username });
check('block: B hidden from A search', (aSearch.data ?? []).length === 0);
const aAsk = await A.c.rpc('send_friend_request', { p_addressee: B.id });
check('block: A cannot request B', aAsk.error?.message.includes('cannot_request'), aAsk.error?.message);
const aInv = await A.c.rpc('redeem_invite', { p_code: B.invite });
check('block: B invite looks invalid to A', aInv.data?.reason === 'invalid_code');
const aLift = await A.c.from('friendships').delete().or(pairB).select();
check('block: A cannot delete the block', (aLift.data ?? []).length === 0);
const aUnblock = await A.c.rpc('unblock_user', { p_user: B.id });
const stillBlocked = await B.c.rpc('blocked_users');
check('block: A cannot unblock themselves', !aUnblock.error && stillBlocked.data?.some((u) => u.id === A.id));
const unb = await B.c.rpc('unblock_user', { p_user: A.id });
const nowList = await B.c.rpc('blocked_users');
check('unblock: B lifts it', !unb.error && !(nowList.data ?? []).some((u) => u.id === A.id));

// ---------------------------------------------------------------- forged messages
const forged = await C.c.channel(`friends:${A.id}`, { config: { private: true } })
  .send({ type: 'broadcast', event: 'friendship_changed', payload: { at: 'x' } });
aIn.events.length = 0;
await sleep(1500);
check('forge: C cannot send to friends:A', aIn.events.length === 0, `send=${forged}`);

for (const u of [aIn, bIn, cIn, cOnB]) await u.ch.unsubscribe();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
