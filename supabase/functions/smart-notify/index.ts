// smart-notify: behavior-based streak-risk pushes.
//
// Called every 2 hours by pg_cron (migration 0016, cron secret only).
// smart_notify_candidates() picks users who, in their own timezone, are
// between 4 PM and 8 PM, have a live streak, have done nothing today,
// allow push + "Streak at risk", and have a device token. For each one we:
//   1. claim (user, 'streak_risk', local date) in notification_sends —
//      the primary key makes a second send that day impossible, even when
//      two runs overlap;
//   2. deliver through _shared/push.ts, which re-checks preferences, quiet
//      hours and the 3-a-day cap, writes the in-app notification row and
//      calls the Expo push API;
//   3. record what happened on the claim row.
// One user failing never stops the run; the response lists every outcome.
//
// POST body (all optional): { "dry_run": true } lists who would be
// notified without sending anything.

import { matchesConfiguredSecret } from '../_shared/configuredSecret.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { deliver } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const KIND = 'streak_risk';
const WINDOW_START_HOUR = 16; // 4:00 PM local
const WINDOW_END_HOUR = 20; // 8:00 PM local (exclusive)
const BATCH_LIMIT = 500; // users per run
const CONCURRENCY = 10; // users processed in parallel

const PILLAR_LABEL: Record<string, string> = {
  health: 'Health',
  family: 'Family',
  work: 'Work',
  fun: 'Fun',
  spirituality: 'Spirituality',
};

type Admin = SupabaseClient;

interface Candidate {
  user_id: string;
  first_name: string | null;
  timezone: string;
  local_date: string;
  current_streak: number;
  weakest_pillar: string;
}

type Outcome =
  | 'pushed'
  | 'already_sent'
  | 'not_pushed'
  | 'opted_out'
  | 'error';

interface UserResult {
  user_id: string;
  outcome: Outcome;
  detail?: string;
}

export function streakRiskMessage(c: Candidate): {
  title: string;
  body: string;
} {
  const name = (c.first_name ?? '').trim() || 'there';
  const pillar = PILLAR_LABEL[c.weakest_pillar] ?? 'Health';
  const days = c.current_streak;
  return {
    title: 'Your streak is at risk',
    body: `Hey ${name}, your ${days} day streak is at risk! Just 5 minutes of ${pillar} can save it.`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!matchesConfiguredSecret(req.headers.get('x-cron-secret'), cronSecret)) {
    return json({ error: 'invalid_cron_secret' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('smart-notify: missing SUPABASE_URL or SERVICE_ROLE_KEY');
    return json({ error: 'server_misconfigured' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      (body.dry_run !== undefined && typeof body.dry_run !== 'boolean')) {
    return json({ error: 'invalid_body' }, 400);
  }
  const dryRun = body.dry_run === true;

  const { data, error } = await admin.rpc('smart_notify_candidates', {
    p_start_hour: WINDOW_START_HOUR,
    p_end_hour: WINDOW_END_HOUR,
    p_limit: BATCH_LIMIT,
  });
  if (error) {
    console.error('smart-notify: candidate query failed', error.message);
    return json({ error: 'candidate_query_failed', detail: error.message }, 500);
  }
  const candidates = (data ?? []) as Candidate[];

  if (dryRun) {
    return json(
      {
        ok: true,
        dry_run: true,
        candidates: candidates.map((c) => ({
          user_id: c.user_id,
          local_date: c.local_date,
          timezone: c.timezone,
          ...streakRiskMessage(c),
        })),
      },
      200,
    );
  }

  const results: UserResult[] = [];
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const slice = candidates.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(slice.map((c) => notifyOne(admin, c)));
    results.push(...settled);
  }

  const summary: Record<Outcome, number> = {
    pushed: 0,
    already_sent: 0,
    not_pushed: 0,
    opted_out: 0,
    error: 0,
  };
  for (const r of results) summary[r.outcome] += 1;
  console.log('smart-notify run', JSON.stringify(summary));

  return json({ ok: true, candidates: candidates.length, summary, results }, 200);
});

async function notifyOne(admin: Admin, c: Candidate): Promise<UserResult> {
  // 1) Claim today's slot. A unique violation means another run already
  //    handled this user today.
  const claim = await admin.from('notification_sends').insert({
    user_id: c.user_id,
    kind: KIND,
    local_date: c.local_date,
    status: 'claimed',
  });
  if (claim.error) {
    if (claim.error.code === '23505') {
      return { user_id: c.user_id, outcome: 'already_sent' };
    }
    return { user_id: c.user_id, outcome: 'error', detail: `claim:${claim.error.message}` };
  }

  // 2) Deliver.
  try {
    const msg = streakRiskMessage(c);
    const r = await deliver(admin, c.user_id, {
      type: KIND,
      title: msg.title,
      body: msg.body,
      data: {
        screen: 'Today',
        pillar: c.weakest_pillar,
        streak: c.current_streak,
      },
    });

    const outcome: Outcome = r.pushed
      ? 'pushed'
      : r.reason === 'opted_out'
        ? 'opted_out'
        : 'not_pushed';
    await markClaim(admin, c, outcome, r.reason ?? `sent ${r.sent ?? 0}/${r.total ?? 0}`);
    return { user_id: c.user_id, outcome, detail: r.reason };
  } catch (e) {
    // Nothing reached the user: release the claim so the next run (2 hours
    // later, still inside the window) can try again.
    const detail = e instanceof Error ? e.message : 'unknown';
    console.error('smart-notify: deliver failed', c.user_id, detail);
    await admin
      .from('notification_sends')
      .delete()
      .eq('user_id', c.user_id)
      .eq('kind', KIND)
      .eq('local_date', c.local_date);
    return { user_id: c.user_id, outcome: 'error', detail };
  }
}

async function markClaim(
  admin: Admin,
  c: Candidate,
  status: Outcome,
  detail: string,
): Promise<void> {
  const { error } = await admin
    .from('notification_sends')
    .update({ status, detail })
    .eq('user_id', c.user_id)
    .eq('kind', KIND)
    .eq('local_date', c.local_date);
  if (error) console.error('smart-notify: could not record outcome', error.message);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
