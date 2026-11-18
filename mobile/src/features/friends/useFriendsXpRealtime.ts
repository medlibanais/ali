// Live weekly XP for the friends leaderboard.
//
// Each user has a private Realtime broadcast topic "xp:<user_id>". A
// trigger on quest_completions (migration 0035) sends { user_id, xp_delta }
// to it whenever they complete or undo a quest. Realtime checks the
// realtime.messages RLS policy at join time, so you can only join your own
// topic and those of accepted friends who share stats; any other join is
// refused by the server, not just hidden by the app.
//
// On an event we bump that row in the React Query cache at once, then
// refetch the view shortly after so the number matches the server.
//
// Cleanup: every channel is removed when the screen loses focus, when the
// circle changes, or on unmount. Pending timers are cleared too.

import { useEffect, useMemo, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { CIRCLE_KEY } from './api';
import { applyXpDelta, parseXpEvent, realtimeTopicIds, type CircleRow } from './logic';

/** Wait this long after the last event before refetching from the view. */
const SETTLE_MS = 1500;

export interface FriendsXpRealtimeOptions {
  rows: CircleRow[] | undefined;
  /** Subscribe only while true (e.g. while the screen is focused). */
  enabled: boolean;
  /** Called with the user id whose XP just changed (for a highlight). */
  onXpChange?: (userId: string, delta: number) => void;
}

export function useFriendsXpRealtime({ rows, enabled, onXpChange }: FriendsXpRealtimeOptions): void {
  const queryClient = useQueryClient();
  const onXpChangeRef = useRef(onXpChange);
  onXpChangeRef.current = onXpChange;

  // A string key so a refetch with the same people does not resubscribe.
  const topicKey = useMemo(() => realtimeTopicIds(rows ?? []).join(','), [rows]);

  useEffect(() => {
    if (!enabled || topicKey === '') return;
    const ids = topicKey.split(',');
    const channels: RealtimeChannel[] = [];
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const settle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        if (!cancelled) queryClient.invalidateQueries({ queryKey: CIRCLE_KEY });
      }, SETTLE_MS);
    };

    const onBroadcast = (message: { payload?: unknown }) => {
      if (cancelled) return;
      const event = parseXpEvent(message.payload);
      if (!event || !ids.includes(event.user_id)) return;
      queryClient.setQueryData<CircleRow[]>(CIRCLE_KEY, (current: CircleRow[] | undefined) =>
        current ? applyXpDelta(current, event) : current,
      );
      onXpChangeRef.current?.(event.user_id, event.xp_delta);
      settle();
    };

    (async () => {
      // Private channels authorize with the user's JWT.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      for (const id of ids) {
        const channel = supabase
          .channel(`xp:${id}`, { config: { private: true } })
          .on('broadcast', { event: 'xp_changed' }, onBroadcast)
          .subscribe((status) => {
            // A refused join (not friends any more, stats made private) is
            // just dropped; the next circle refetch re-plans the topics.
            if (status === 'CHANNEL_ERROR' && !cancelled) settle();
          });
        channels.push(channel);
      }
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      if (settleTimer) clearTimeout(settleTimer);
      for (const channel of channels) {
        supabase.removeChannel(channel).catch(() => undefined);
      }
      channels.length = 0;
    };
  }, [enabled, topicKey, queryClient]);
}
