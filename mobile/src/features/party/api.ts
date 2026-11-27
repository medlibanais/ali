// Party Quests data layer: React Query hooks over the party RPCs.
// Every rule (friends-only joins, membership, XP, races) lives in
// Postgres (migration 0035); the app only calls RPCs and reads.

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { newClientId } from '../../lib/clientId';
import { useAppDispatch } from '../../store/hooks';
import { fetchGamification } from '../../store/slices/gamificationSlice';
import { fetchDailyQuests } from '../../store/slices/questsSlice';
import type { Pillar } from '../../theme/tokens';
import type { PartyDifficulty, PartyPreview, PartyState, PartySummary } from './logic';

export * from './logic';

export const partyKeys = {
  all: ['party'] as const,
  mine: ['party', 'mine'] as const,
  one: (id: string) => ['party', 'state', id] as const,
  preview: (code: string) => ['party', 'preview', code] as const,
};

export function useMyParties() {
  return useQuery({
    queryKey: partyKeys.mine,
    queryFn: async (): Promise<PartySummary[]> => {
      const { data, error } = await supabase.rpc('my_party_quests');
      if (error) throw error;
      return (data ?? []) as PartySummary[];
    },
  });
}

export function useParty(id: string | undefined) {
  return useQuery({
    queryKey: partyKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<PartyState> => {
      const { data, error } = await supabase.rpc('party_state', { p_party: id });
      if (error) throw error;
      return data as PartyState;
    },
  });
}

export function usePartyPreview(code: string) {
  const c = code.trim().toUpperCase();
  return useQuery({
    queryKey: partyKeys.preview(c),
    enabled: c.length >= 6,
    queryFn: async (): Promise<PartyPreview> => {
      const { data, error } = await supabase.rpc('party_invite_preview', { p_code: c });
      if (error) throw error;
      return data as PartyPreview;
    },
  });
}

export interface CreatePartyInput {
  pillar: Pillar;
  description: string;
  difficulty: PartyDifficulty;
  maxParticipants: number;
}

/** Writes the returned state into the cache and refreshes the list. */
function useStoreState() {
  const queryClient = useQueryClient();
  return (state: PartyState) => {
    queryClient.setQueryData(partyKeys.one(state.id), state);
    queryClient.invalidateQueries({ queryKey: partyKeys.mine });
  };
}

export function useCreateParty() {
  const store = useStoreState();
  const submitting = useRef(false);
  const attempt = useRef<{ fingerprint: string; requestId: string; completed: boolean } | null>(null);
  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (input: CreatePartyInput & { requestId: string }): Promise<PartyState> => {
      const { data, error } = await supabase.rpc('create_party_quest', {
        p_pillar: input.pillar,
        p_description: input.description,
        p_difficulty: input.difficulty,
        p_max_participants: input.maxParticipants,
        p_request_id: input.requestId,
      });
      if (error) throw error;
      return data as PartyState;
    },
    onSuccess: store,
  });

  async function submit(input: CreatePartyInput): Promise<PartyState | null> {
    if (submitting.current || attempt.current?.completed) return null;

    const description = input.description.trim();
    const fingerprint = JSON.stringify([input.pillar, description, input.difficulty, input.maxParticipants]);
    const submission = attempt.current?.fingerprint === fingerprint
      ? attempt.current
      : { fingerprint, requestId: newClientId(), completed: false };
    attempt.current = submission;
    submitting.current = true;
    try {
      const party = await mutateAsync({ ...input, description, requestId: submission.requestId });
      submission.completed = true;
      return party;
    } finally {
      submitting.current = false;
    }
  }

  // The description is cleared on success. Typing again starts a new draft,
  // even if the user wants to create another party with identical details.
  function startNewDraftAfterSuccess() {
    if (attempt.current?.completed) attempt.current = null;
  }

  return { submit, isPending, startNewDraftAfterSuccess };
}

export function useJoinParty() {
  const store = useStoreState();
  return useMutation({
    mutationFn: async (code: string): Promise<PartyState> => {
      const { data, error } = await supabase.rpc('join_party_quest', {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      return data as PartyState;
    },
    onSuccess: store,
  });
}

/**
 * Refreshes XP, level, streak and today's quests after a party pays out,
 * so the usual reward animations run off the new gamification state.
 */
export function useRefreshAfterPayout() {
  const dispatch = useAppDispatch();
  return () => {
    dispatch(fetchGamification());
    dispatch(fetchDailyQuests({ silent: true }));
  };
}

export function useCompletePart() {
  const store = useStoreState();
  const refresh = useRefreshAfterPayout();
  return useMutation({
    mutationFn: async (partyId: string): Promise<PartyState> => {
      const { data, error } = await supabase.rpc('complete_party_part', { p_party: partyId });
      if (error) throw error;
      return data as PartyState;
    },
    onSuccess: (state) => {
      store(state);
      if (state.status === 'completed') refresh();
    },
  });
}

export function useUndoPart() {
  const store = useStoreState();
  return useMutation({
    mutationFn: async (partyId: string): Promise<PartyState> => {
      const { data, error } = await supabase.rpc('undo_party_part', { p_party: partyId });
      if (error) throw error;
      return data as PartyState;
    },
    onSuccess: store,
  });
}

export function useLeaveParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partyId: string): Promise<{ left: boolean; cancelled: boolean }> => {
      const { data, error } = await supabase.rpc('leave_party_quest', { p_party: partyId });
      if (error) throw error;
      return data as { left: boolean; cancelled: boolean };
    },
    onSuccess: (_res, partyId) => {
      queryClient.removeQueries({ queryKey: partyKeys.one(partyId) });
      queryClient.invalidateQueries({ queryKey: partyKeys.mine });
    },
  });
}
