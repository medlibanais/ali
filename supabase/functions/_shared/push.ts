// Shared delivery for every user-facing notification (FR-5.2, FR-7.1/7.2).
// Every message lands in the in-app notification center. Push is sent on
// top of that only when the user allows the type, it is inside their
// waking window (quiet hours, 8 AM-10 PM by default), and fewer than
// max_per_day (never more than 3) pushes have gone out today in their
// timezone. Pushes go through the Expo push API (FCM/APNs behind it).

import type { createClient } from 'jsr:@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const PUSH_DAILY_CAP = 3;
const MAX_CHARS = 240;

// Preference column that gates each notification type (null: always on).
const TYPE_PREF: Record<string, string | null> = {
  friend_request: 'friend_requests',
  friend_accepted: 'friend_requests',
  friend_streak_milestone: 'friend_requests',
  missed_quest: 'quest_reminders',
  streak_risk: 'streak_risk',
  low_pillar: 'low_pillar',
  behavior_pattern: 'behavior_patterns',
  weekly_report: 'weekly_report',
  level_up: 'coach_messages',
};

export interface Delivery {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface DeliveryResult {
  delivered: boolean;
  pushed: boolean;
  reason?: string;
  sent?: number;
  total?: number;
}

/** Hour of day in the user's timezone + the UTC instant their day began. */
async function localClock(
  admin: SupabaseClient,
  userId: string,
): Promise<{ hour: number; dayStart: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  const tz = profile?.timezone ?? 'UTC';
  const [{ data: hourRow }, { data: bounds }] = await Promise.all([
    admin.rpc('hour_in_tz', { p_tz: tz }).maybeSingle(),
    admin.rpc('day_bounds_in_tz', { p_tz: tz }).maybeSingle(),
  ]);
  const hour = (hourRow as unknown as number) ?? new Date().getUTCHours();
  const dayStart =
    (bounds as { day_start?: string } | null)?.day_start ??
    `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  return { hour, dayStart };
}

export async function deliver(
  admin: SupabaseClient,
  userId: string,
  msg: Delivery,
): Promise<DeliveryResult> {
  const title = msg.title.slice(0, 80);
  const body = msg.body.slice(0, MAX_CHARS - title.length);

  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const prefKey = TYPE_PREF[msg.type] ?? null;
  const typeOn = prefKey ? prefs?.[prefKey] !== false : true;
  if (!typeOn) {
    return { delivered: false, pushed: false, reason: 'opted_out' };
  }

  // Decide on push before writing, so the row records what happened.
  let pushReason: string | null = null;
  const { hour, dayStart } = await localClock(admin, userId);
  if (prefs?.push_enabled === false) pushReason = 'push_disabled';

  if (!pushReason) {
    const quietStart = parseInt((prefs?.quiet_start ?? '22:00').slice(0, 2), 10);
    const quietEnd = parseInt((prefs?.quiet_end ?? '08:00').slice(0, 2), 10);
    const inQuiet =
      quietStart > quietEnd
        ? hour >= quietStart || hour < quietEnd
        : hour >= quietStart && hour < quietEnd;
    if (inQuiet) pushReason = 'quiet_hours';
  }

  if (!pushReason) {
    const cap = Math.min(PUSH_DAILY_CAP, prefs?.max_per_day ?? PUSH_DAILY_CAP);
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('pushed', true)
      .gte('created_at', dayStart);
    if ((count ?? 0) >= cap) pushReason = 'daily_cap';
  }

  let tokens: string[] = [];
  if (!pushReason) {
    const { data } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', userId);
    tokens = (data ?? []).map((t: { token: string }) => t.token);
    if (tokens.length === 0) pushReason = 'no_devices';
  }

  let sent = 0;
  if (!pushReason) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          tokens.map((to) => ({
            to,
            title,
            body,
            sound: 'default',
            data: { type: msg.type, ...(msg.data ?? {}) },
          })),
        ),
      });
      const payload = await res.json();
      sent = (payload?.data ?? []).filter(
        (t: { status?: string }) => t.status === 'ok',
      ).length;
      if (sent === 0) pushReason = 'push_failed';
    } catch {
      pushReason = 'push_failed';
    }
  }

  await admin.from('notifications').insert({
    user_id: userId,
    type: msg.type,
    title,
    body,
    data: msg.data ?? {},
    pushed: sent > 0,
  });

  return {
    delivered: true,
    pushed: sent > 0,
    reason: pushReason ?? undefined,
    sent,
    total: tokens.length,
  };
}
