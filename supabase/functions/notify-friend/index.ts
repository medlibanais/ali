// notify-friend: friend events into the notification center + push
// (see _shared/push.ts for opt-outs, quiet hours and the daily cap).
// Never notifies blocked pairs.

import { matchesConfiguredSecret } from '../_shared/configuredSecret.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { deliver } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

// A cheer is pushed only if its row is this fresh (stops late replays).
const CHEER_MAX_AGE_MS = 5 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey);

    // Identify the actor: user JWT for app-triggered events, cron secret
    // for database-triggered ones (streak milestones).
    let actorId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await userClient.auth.getUser();
      actorId = user?.id ?? null;
    }
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = matchesConfiguredSecret(req.headers.get('x-cron-secret'), cronSecret);

    if (!actorId && !isCron) {
      return json({ error: 'unauthorized' }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'invalid_body' }, 400);
    }
    const type = body.type;
    let recipientId: string | null = null;
    let title = '';
    let message = '';
    let otherId: string | null = null;

    // Each type checks that the friendship it describes really exists, so
    // a signed-in user cannot push messages to arbitrary people.
    if (type === 'friend_request') {
      if (!actorId) return json({ error: 'unauthorized' }, 401);
      if (!isUuid(body.addressee)) return json({ error: 'invalid_addressee' }, 400);
      const { data: pending } = await admin
        .from('friendships')
        .select('id')
        .eq('status', 'pending')
        .eq('requester', actorId)
        .eq('addressee', body.addressee)
        .maybeSingle();
      if (!pending) return json({ delivered: false, reason: 'no_request' }, 200);
      recipientId = body.addressee;
      otherId = actorId;
      const requesterName = await displayName(admin, actorId);
      title = 'New friend request';
      message = `${requesterName} wants to grow with you.`;
    } else if (type === 'friend_accepted') {
      if (!actorId) return json({ error: 'unauthorized' }, 401);
      if (!isUuid(body.friendship_id)) return json({ error: 'invalid_friendship' }, 400);
      const { data: friendship } = await admin
        .from('friendships')
        .select('requester, addressee, status')
        .eq('id', body.friendship_id)
        .maybeSingle();
      if (!friendship || friendship.status !== 'accepted' || friendship.addressee !== actorId) {
        return json({ delivered: false, reason: 'no_friendship' }, 200);
      }
      recipientId = friendship.requester;
      otherId = actorId;
      const name = await displayName(admin, otherId);
      title = 'Request accepted';
      message = `${name} accepted your request. Streaks together now.`;
    } else if (type === 'cheer') {
      // send_cheer() already checked the friendship and the rate limits
      // and wrote the row. Here we only push a row the caller sent, once.
      if (!actorId) return json({ error: 'unauthorized' }, 401);
      if (!isUuid(body.cheer_id)) return json({ error: 'invalid_cheer' }, 400);
      const { data: cheer } = await admin
        .from('cheers')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', body.cheer_id)
        .eq('from_user', actorId)
        .is('notified_at', null)
        .gte('created_at', new Date(Date.now() - CHEER_MAX_AGE_MS).toISOString())
        .select('to_user')
        .maybeSingle();
      if (!cheer) return json({ delivered: false, reason: 'no_cheer' }, 200);
      recipientId = cheer.to_user as string;
      otherId = actorId;
      const name = await displayName(admin, actorId);
      title = 'Cheer';
      message = `${name} cheered you on!`;
    } else if (type === 'friend_streak_milestone') {
      // Sent by the database trigger only.
      if (!isCron) return json({ error: 'unauthorized' }, 401);
      if (!isUuid(body.friend_id) || !isUuid(body.user_id) ||
          ![7, 14, 30, 50, 100].includes(body.streak)) {
        return json({ error: 'invalid_milestone' }, 400);
      }
      recipientId = body.friend_id;
      otherId = body.user_id;
      const name = await displayName(admin, otherId);
      title = 'Friend milestone';
      message = `${name} just hit a ${body.streak}-day streak. Keep pace.`;
    } else {
      return json({ error: 'unknown_type' }, 400);
    }

    if (!recipientId) return json({ error: 'missing_recipient' }, 400);
    if (otherId) {
      const { data: block } = await admin
        .from('friendships')
        .select('id')
        .eq('status', 'blocked')
        .or(
          `and(requester.eq.${recipientId},addressee.eq.${otherId}),` +
            `and(requester.eq.${otherId},addressee.eq.${recipientId})`,
        )
        .maybeSingle();
      if (block) return json({ delivered: false, reason: 'blocked' }, 200);
    }

    // Center + push with type opt-outs, quiet hours and the daily cap.
    const result = await deliver(admin, recipientId, {
      type,
      title,
      body: message,
      data: otherId ? { other_user_id: otherId } : {},
    });
    return json(result, 200);
  } catch (e) {
    return json(
      { error: 'internal', message: e instanceof Error ? e.message : 'error' },
      500,
    );
  }
});

async function displayName(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
): Promise<string> {
  if (!userId) return 'A friend';
  const { data } = await admin
    .from('profiles')
    .select('first_name, username')
    .eq('id', userId)
    .maybeSingle();
  return data?.first_name ?? data?.username ?? 'A friend';
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
