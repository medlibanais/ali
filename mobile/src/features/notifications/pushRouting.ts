// Where a tapped push notification should take the user. Pure, so it can
// be unit tested without expo-notifications.

import type { PillarId } from '../../components/PillarBubble';

const PILLARS: readonly PillarId[] = ['health', 'family', 'work', 'fun', 'spirituality'];

export type PushRoute =
  | { screen: 'Today'; pillar?: PillarId }
  | { screen: 'Notifications' }
  | { screen: 'Friends' };

function isPillar(v: unknown): v is PillarId {
  return typeof v === 'string' && (PILLARS as readonly string[]).includes(v);
}

/** Maps a notification's data payload to a screen. Unknown payloads open the notification center. */
export function routeForPush(data: unknown): PushRoute {
  const d = (data ?? {}) as Record<string, unknown>;
  const screen = d.screen;
  const type = d.type;

  if (screen === 'Today' || type === 'streak_risk' || type === 'missed_quest' || type === 'low_pillar') {
    return isPillar(d.pillar) ? { screen: 'Today', pillar: d.pillar } : { screen: 'Today' };
  }
  if (typeof type === 'string' && type.startsWith('friend_')) {
    return { screen: 'Friends' };
  }
  return { screen: 'Notifications' };
}
