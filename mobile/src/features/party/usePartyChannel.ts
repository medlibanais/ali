// Realtime for one party, on the private channel "party:<id>".
//
//  * Progress: postgres_changes on party_members / party_quests. Realtime
//    applies the tables' RLS to each event, so only members get them.
//    Each event refetches party_state, which every member's progress bar
//    renders from.
//  * Cheers: broadcast "cheer" events. The channel is private, so the
//    realtime.messages policies from migration 0035 decide who may join,
//    listen and send: members only.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { partyKeys } from './api';
import {
  canCheer,
  parseCheer,
  type PartyCheer,
  type PartyCheerEmoji,
  type PartyState,
} from './logic';

export type PartyChannelStatus = 'connecting' | 'live' | 'offline';

interface Options {
  partyId: string | undefined;
  myId: string | null;
  memberIds: ReadonlySet<string>;
  /** Called when the party flips to completed from someone else's tap. */
  onCompleted?: () => void;
}

let cheerSeq = 0;

export function usePartyChannel({ partyId, myId, memberIds, onCompleted }: Options) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PartyChannelStatus>('connecting');
  const [cheers, setCheers] = useState<PartyCheer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef<number | null>(null);
  // Latest values for the long-lived subscription callbacks.
  const membersRef = useRef(memberIds);
  membersRef.current = memberIds;
  const completedRef = useRef(onCompleted);
  completedRef.current = onCompleted;

  const pushCheer = useCallback((emoji: PartyCheerEmoji, from: string) => {
    cheerSeq += 1;
    const cheer: PartyCheer = { id: `${Date.now()}-${cheerSeq}`, emoji, from };
    // Keep the screen light: at most 12 bubbles in flight.
    setCheers((list) => [...list.slice(-11), cheer]);
  }, []);

  const removeCheer = useCallback((id: string) => {
    setCheers((list) => list.filter((c) => c.id !== id));
  }, []);

  useEffect(() => {
    if (!partyId) return undefined;
    let cancelled = false;
    const key = partyKeys.one(partyId);

    const refetch = () => {
      const before = queryClient.getQueryData<PartyState>(key)?.status;
      queryClient
        .fetchQuery({
          queryKey: key,
          queryFn: async (): Promise<PartyState> => {
            const { data, error } = await supabase.rpc('party_state', { p_party: partyId });
            if (error) throw error;
            return data as PartyState;
          },
          staleTime: 0,
        })
        .then((next) => {
          if (before !== 'completed' && next.status === 'completed') completedRef.current?.();
        })
        .catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: partyKeys.mine });
    };

    (async () => {
      // Private channels authorize with the user's JWT.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      const channel = supabase
        .channel(`party:${partyId}`, { config: { private: true, broadcast: { self: false } } })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'party_members', filter: `party_id=eq.${partyId}` },
          refetch,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'party_quests', filter: `id=eq.${partyId}` },
          refetch,
        )
        .on('broadcast', { event: 'cheer' }, ({ payload }) => {
          const cheer = parseCheer(payload, membersRef.current);
          if (cheer) pushCheer(cheer.emoji, cheer.from);
        })
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            setStatus('live');
            refetch(); // catch up on anything missed while connecting
          } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
            setStatus('offline');
          }
        });
      channelRef.current = channel;
    })().catch(() => setStatus('offline'));

    return () => {
      cancelled = true;
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [partyId, queryClient, pushCheer]);

  /** Sends a cheer to everyone else and shows it here right away. */
  const sendCheer = useCallback(
    (emoji: PartyCheerEmoji): boolean => {
      const now = Date.now();
      if (!myId || !canCheer(lastSentRef.current, now)) return false;
      lastSentRef.current = now;
      pushCheer(emoji, myId);
      channelRef.current
        ?.send({ type: 'broadcast', event: 'cheer', payload: { emoji, from: myId } })
        .catch(() => undefined);
      return true;
    },
    [myId, pushCheer],
  );

  return { status, cheers, sendCheer, removeCheer };
}
