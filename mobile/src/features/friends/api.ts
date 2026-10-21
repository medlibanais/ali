// Friends data layer: React Query hooks over the friends RPCs.
// All heavy rules (duplicates, blocks, privacy) live in Postgres/RLS.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface UserSearchResult {
  id: string;
  username: string;
  first_name: string | null;
  avatar_config: Record<string, unknown> | null;
  photo_url: string | null;
  avatar_mode: 'avatar' | 'photo';
}

export interface FriendRow extends UserSearchResult {
  friendship_id: string;
  since: string;
  level: number;
  current_streak: number;
  best_streak: number;
  weekly_xp: number;
  stats_shared: boolean;
}

export interface FriendRequest {
  friendship_id: string;
  direction: 'incoming' | 'outgoing';
  status: string;
  created_at: string;
  user: UserSearchResult;
}

function weekStart(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

async function myId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  return user.id;
}

export function useUserSearch(query: string) {
  return useQuery({
    queryKey: ['friends', 'search', query.trim().toLowerCase()],
    enabled: query.trim().length >= 2,
    queryFn: async (): Promise<UserSearchResult[]> => {
      const { data, error } = await supabase.rpc('search_users', {
        p_query: query.trim().toLowerCase(),
      });
      if (error) throw error;
      return (data ?? []) as UserSearchResult[];
    },
  });
}

export function useFriends() {
  return useQuery({
    queryKey: ['friends', 'list'],
    queryFn: async (): Promise<FriendRow[]> => {
      const uid = await myId();
      const { data: rows, error } = await supabase
        .from('friendships')
        .select('id, requester, addressee, created_at')
        .eq('status', 'accepted')
        .or(`requester.eq.${uid},addressee.eq.${uid}`);
      if (error) throw error;
      const friendships = (rows ?? []) as {
        id: string;
        requester: string;
        addressee: string;
        created_at: string;
      }[];
      if (friendships.length === 0) return [];

      const friendIds = friendships.map((f) =>
        f.requester === uid ? f.addressee : f.requester,
      );

      const [profiles, gam, scores] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, first_name, avatar_config, photo_url, avatar_mode, stats_visibility')
          .in('id', friendIds),
        supabase
          .from('gamification')
          .select('user_id, level, current_streak, best_streak')
          .in('user_id', friendIds),
        supabase
          .from('daily_scores')
          .select('user_id, xp_earned')
          .in('user_id', friendIds)
          .gte('score_date', weekStart()),
      ]);

      const gamMap = new Map(
        (gam.data ?? []).map((g: { user_id: string } & Record<string, number>) => [g.user_id, g]),
      );
      const xpMap = new Map<string, number>();
      for (const row of scores.data ?? []) {
        xpMap.set(row.user_id, (xpMap.get(row.user_id) ?? 0) + row.xp_earned);
      }

      return friendships.map((f) => {
        const friendId = f.requester === uid ? f.addressee : f.requester;
        const p = (profiles.data ?? []).find(
          (x: { id: string }) => x.id === friendId,
        );
        const g = gamMap.get(friendId) as
          | { level: number; current_streak: number; best_streak: number }
          | undefined;
        return {
          id: friendId,
          friendship_id: f.id,
          since: f.created_at,
          username: p?.username ?? 'friend',
          first_name: p?.first_name ?? null,
          avatar_config: p?.avatar_config ?? null,
          photo_url: p?.photo_url ?? null,
          avatar_mode: p?.avatar_mode ?? 'avatar',
          level: g?.level ?? 1,
          current_streak: g?.current_streak ?? 0,
          best_streak: g?.best_streak ?? 0,
          weekly_xp: xpMap.get(friendId) ?? 0,
          stats_shared: p?.stats_visibility === 'friends',
        };
      });
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
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, first_name, avatar_config, photo_url, avatar_mode')
        .in('id', otherIds);
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

function errorText(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('cannot_friend_yourself')) return 'That is your own account.';
  if (msg.includes('already_friends')) return 'You are already friends.';
  if (msg.includes('request_already_pending')) return 'A request is already pending.';
  if (msg.includes('cannot_request')) return 'You cannot send a request to this user.';
  if (msg.includes('user_not_found')) return 'No user found with that username.';
  if (msg.includes('already_responded')) return 'This request was already answered.';
  return 'Something went wrong. Try again.';
}

export function useSendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (addressee: string) => {
      const { error } = await supabase.rpc('send_friend_request', {
        p_addressee: addressee,
      });
      if (error) throw error;
      // Fire-and-forget push notification to the addressee.
      supabase.functions
        .invoke('notify-friend', { body: { type: 'friend_request', addressee } })
        .catch(() => undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
    onError: (error) => error,
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
      if (accept) {
        supabase.functions
          .invoke('notify-friend', {
            body: { type: 'friend_accepted', friendship_id: friendshipId },
          })
          .catch(() => undefined);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['gamification'] });
    },
  });
}

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
    onSuccess: () => {
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
    onSuccess: () => {
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
    },
  });
}

export { errorText as friendErrorText };
