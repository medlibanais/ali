// Live friend requests, answers, unfriends and blocks.
//
// Migration 0041 sends a broadcast on your private topic "friends:<you>"
// whenever a friendship row that involves you is created, changed or
// deleted. Only you may join that topic (realtime.messages policy), and
// the message carries no data: it just tells the app to refetch, so RLS
// still decides what you see.
//
// Postgres changes on friendships (migration 0006) are kept as a second
// source: they cover new requests and answers on a database that does not
// have 0041 yet. They cannot see deletes or blocks, which is why the
// broadcast exists.

import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { friendshipTopic } from './logic';

/** Several row changes in a burst (mutual add, block) refetch once. */
const DEBOUNCE_MS = 300;

export function useFriendshipRealtime(userId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channels: RealtimeChannel[] = [];

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!cancelled) queryClient.invalidateQueries({ queryKey: ['friends'] });
      }, DEBOUNCE_MS);
    };

    channels.push(
      supabase
        .channel(`friendships:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friendships', filter: `addressee=eq.${userId}` },
          refresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friendships', filter: `requester=eq.${userId}` },
          refresh,
        )
        .subscribe(),
    );

    (async () => {
      // Private channels authorize with the user's JWT.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channels.push(
        supabase
          .channel(friendshipTopic(userId), { config: { private: true } })
          .on('broadcast', { event: 'friendship_changed' }, refresh)
          .subscribe(),
      );
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      for (const channel of channels) {
        supabase.removeChannel(channel).catch(() => undefined);
      }
      channels.length = 0;
    };
  }, [userId, queryClient]);
}
