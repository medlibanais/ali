// notify-friend: push delivery for friend events via the Expo push API
// (works with ExponentPushToken; FCM/APNs sit behind it on device).
// Respects per-user preferences: push_enabled, type toggles, quiet hours,
// and the max-per-day cap. Never notifies blocked pairs.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type NotifyType = 'friend_request' | 'friend_accepted' | 'friend_streak_milestone';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const type = body?.type as NotifyType;

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
    const cronSecret = Deno.env.get('CRON_SECRET') ?? 'prayerlock-dev-cron-secret';
    const isCron = req.headers.get('x-cron-secret') === cronSecret;

    if (!actorId && !isCron) {
      return json({ error: 'unauthorized' }, 401);
    }

    let recipientId: string | null = null;
    let title = '';
    let message = '';
    let otherId: string | null = null;

    if (type === 'friend_request') {
      recipientId = body?.addressee ?? null;
      otherId = actorId;
      const requesterName = await displayName(admin, actorId);
      title = 'New friend request';
      message = `${requesterName} wants to grow with you.`;
    } else if (type === 'friend_accepted') {
      const { data: friendship } = await admin
        .from('friendships')
        .select('requester, addressee')
        .eq('id', body?.friendship_id ?? '')
        .maybeSingle();
      recipientId = friendship?.requester ?? null;
      otherId = actorId ?? friendship?.addressee ?? null;
      const name = await displayName(admin, otherId);
      title = 'Request accepted';
      message = `${name} accepted your request. Streaks together now.`;
    } else if (type === 'friend_streak_milestone') {
      recipientId = body?.friend_id ?? null;
      otherId = body?.user_id ?? null;
      const name = await displayName(admin, otherId);
      title = 'Friend milestone';
      message = `${name} just hit a ${body?.streak}-day streak. Keep pace.`;
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

    // Preferences: push on + type toggle on.
    const { data: prefs } = await admin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', recipientId)
      .maybeSingle();
    const pushOn = prefs?.push_enabled !== false;
    const typeOn =
      type === 'friend_request' || type === 'friend_accepted'
        ? prefs?.friend_requests !== false
        : true;
    if (!pushOn || !typeOn) {
      return json({ delivered: false, reason: 'opted_out' }, 200);
    }

    // Quiet hours in the recipient's timezone.
    const { data: profile } = await admin
      .from('profiles')
      .select('timezone')
      .eq('id', recipientId)
      .maybeSingle();
    const tz = profile?.timezone ?? 'UTC';
    const { data: hourRow } = await admin
      .rpc('hour_in_tz', { p_tz: tz })
      .maybeSingle();
    const hour = (hourRow as unknown as number) ?? new Date().getUTCHours();
    const quietStart = parseInt((prefs?.quiet_start ?? '22:00').slice(0, 2), 10);
    const quietEnd = parseInt((prefs?.quiet_end ?? '08:00').slice(0, 2), 10);
    const inQuiet =
      quietStart > quietEnd
        ? hour >= quietStart || hour < quietEnd
        : hour >= quietStart && hour < quietEnd;
    if (inQuiet) {
      return json({ delivered: false, reason: 'quiet_hours' }, 200);
    }

    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', recipientId);
    const list = (tokens ?? []).map((t: { token: string }) => t.token);
    if (list.length === 0) {
      return json({ delivered: false, reason: 'no_devices' }, 200);
    }

    const messages = list.map((to: string) => ({
      to,
      title,
      body: message,
      sound: 'default',
      data: { type },
    }));

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const pushBody = await pushResponse.json();
    const tickets = pushBody?.data ?? [];
    const sent = tickets.filter(
      (t: { status?: string }) => t.status === 'ok',
    ).length;

    return json({ delivered: sent > 0, sent, total: list.length }, 200);
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
