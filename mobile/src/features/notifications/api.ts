// In-app notification center (SRS FR-7.2): React Query over the
// notifications table. Rows are written server-side (coach nudges,
// friend events, badges, titles, level-ups); the owner reads, marks read
// and clears them under RLS.

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

const KEY = ['notifications'];

// Results of the user's own quest completion: the completion toast already
// announces them, and a banner here would replace its Undo button.
const NO_BANNER = new Set(['badge', 'title', 'level_up']);

export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, data, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => n.read_at === null).length;
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useClearAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Realtime: a new notification shows as a 3-second banner while the app
 * is open and lands in the center.
 */
export function useNotificationBanner() {
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      channel = supabase
        .channel(`notifications:${data.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${data.user.id}`,
          },
          (payload) => {
            const row = payload.new as Partial<AppNotification>;
            if (row.title && !NO_BANNER.has(row.type ?? '')) {
              toast.showToast({ message: row.title, durationMs: 3000 });
            }
            queryClient.invalidateQueries({ queryKey: KEY });
          },
        )
        .subscribe();
    });
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
