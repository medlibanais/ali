// Friends data layer: React Query hooks over the friends RPCs.
// All heavy rules (duplicates, blocks, privacy) live in Postgres/RLS.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { CircleRow, SearchHit } from './logic';

export type {
  CircleRow,
  FriendRow,
  RankedRow,
  Relation,
  SearchHit,
  UserSearchResult,
} from './logic';
export { friendErrorText, inviteResultText } from './logic';

export interface FriendRequest {
  friendship_id: string;
  direction: 'incoming' | 'outgoing';
  status: string;
  created_at: string;
  user: {
    id: string;
    username: string;
    first_name: string | null;
    avatar_config: Record<string, unknown> | null;
    photo_url: string | null;
    avatar_mode: 'avatar' | 'photo';
  };
}

export interface BlockedUser {
  id: string;
  username: string;
  first_name: string | null;
}

async function myId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  return user.id;
}

function notify(body: Record<string, unknown>) {
  // Fire-and-forget push; the function checks the friendship itself.
  supabase.functions.invoke('notify-friend', { body }).catch(() => undefined);
}

export function useUserSearch(query: string) {
  const q = query.trim().toLowerCase();
  return useQuery({
    queryKey: ['friends', 'search', q],
    enabled: q.length >= 2,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await supabase.rpc('search_users', { p_query: q });
      if (error) throw error;
      return (data ?? []) as SearchHit[];
    },
  });
}

// You + accepted friends with level, streak and this week's XP.
export function useCircle() {
  return useQuery({
    queryKey: ['friends', 'circle'],
    queryFn: async (): Promise<CircleRow[]> => {
      const { data, error } = await supabase.rpc('friend_leaderboard');
      if (error) throw error;
      return (data ?? []) as CircleRow[];
    },
  });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: ['friends', 'requests'],
    queryFn: async (): Promise<FriendRequest[]> => {
      const uid = await myId();
      const { data: rows, error } = await supabase
        .from('friendships')
        .select('id, requester, addressee, status, created_at')
        .eq('status', 'pending')
        .or(`requester.eq.${uid},addressee.eq.${uid}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const pending = (rows ?? []) as {
        id: string;
        requester: string;
        addressee: string;
        status: string;
        created_at: string;
      }[];
      if (pending.length === 0) return [];
      const otherIds = pending.map((f) =>
        f.requester === uid ? f.addressee : f.requester,
      );
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, first_name, avatar_config, photo_url, avatar_mode')
        .in('id', otherIds);
      if (profileError) throw profileError;
      return pending.map((f) => {
        const otherId = f.requester === uid ? f.addressee : f.requester;
        const p = (profiles ?? []).find((x: { id: string }) => x.id === otherId);
        return {
          friendship_id: f.id,
          direction: f.requester === uid ? ('outgoing' as const) : ('incoming' as const),
          status: f.status,
          created_at: f.created_at,
          user: {
            id: otherId,
            username: p?.username ?? 'friend',
            first_name: p?.first_name ?? null,
            avatar_config: p?.avatar_config ?? null,
            photo_url: p?.photo_url ?? null,
            avatar_mode: p?.avatar_mode ?? 'avatar',
          },
        };
      });
    },
  });
}

export function useBlockedUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['friends', 'blocked'],
    enabled,
    queryFn: async (): Promise<BlockedUser[]> => {
      const { data, error } = await supabase.rpc('blocked_users');
      if (error) throw error;
      return (data ?? []) as BlockedUser[];
    },
  });
}

export function useSendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (addressee: string) => {
      const { data, error } = await supabase.rpc('send_friend_request', {
        p_addressee: addressee,
      });
      if (error) throw error;
      const row = data as { id: string; status: string };
      // Adding someone who already asked you accepts their request.
      if (row.status === 'accepted') {
        notify({ type: 'friend_accepted', friendship_id: row.id });
      } else {
        notify({ type: 'friend_request', addressee });
      }
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['gamification'] });
    },
  });
}

export function useRespondRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      friendshipId,
      accept,
    }: {
      friendshipId: string;
      accept: boolean;
    }) => {
      const { error } = await supabase.rpc('respond_friend_request', {
        p_friendship: friendshipId,
        p_accept: accept,
      });
      if (error) throw error;
      if (accept) notify({ type: 'friend_accepted', friendship_id: friendshipId });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['gamification'] });
    },
  });
}

// Unfriend, or cancel an outgoing request.
export function useUnfriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('block_user', { p_user: userId });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('unblock_user', { p_user: userId });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useRedeemInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('redeem_invite', {
        p_code: code,
      });
      if (error) throw error;
      return data as { redeemed: boolean; reason?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['gamification'] });
    },
  });
}
