// Party Quests: pure helpers (types, progress, invite links, cheers).
// No Supabase or React here so it is easy to unit test.

import type { Pillar } from '../../theme/tokens';

export type PartyDifficulty = 'easy' | 'medium' | 'hard';
export type PartyStatus = 'open' | 'completed' | 'cancelled' | 'expired';
export type PartyMemberStatus = 'joined' | 'done';

export interface PartyMember {
  user_id: string;
  username: string | null;
  first_name: string | null;
  status: PartyMemberStatus;
  is_creator: boolean;
  done_at: string | null;
  xp_awarded: number | null;
  award_note: string | null;
}

/** party_state() RPC result. */
export interface PartyState {
  id: string;
  creator_id: string;
  pillar: Pillar;
  description: string;
  difficulty: PartyDifficulty;
  xp_reward: number;
  max_participants: number;
  status: PartyStatus;
  invite_code: string;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  members: PartyMember[];
}

/** my_party_quests() row. */
export interface PartySummary {
  id: string;
  pillar: Pillar;
  description: string;
  xp_reward: number;
  status: PartyStatus;
  max_participants: number;
  member_count: number;
  done_count: number;
  my_status: PartyMemberStatus;
  expires_at: string;
  completed_at: string | null;
}

/** party_invite_preview() result. */
export type PartyPreview =
  | { found: false; reason: 'invalid_code' }
  | {
      found: true;
      party_id: string;
      creator_name: string | null;
      pillar: Pillar;
      description: string;
      difficulty: PartyDifficulty;
      xp_reward: number;
      member_count: number;
      max_participants: number;
      expires_at: string;
      can_join: boolean;
      reason: PartyBlockReason | null;
    };

export type PartyBlockReason =
  | 'already_member'
  | 'party_completed'
  | 'party_cancelled'
  | 'party_expired'
  | 'party_full';

export const PARTY_XP: Record<PartyDifficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 50,
};

export const PARTY_SIZE_MIN = 2;
export const PARTY_SIZE_MAX = 8;
export const DESCRIPTION_MAX = 140;

/** Progress shown on the shared bar: members done / members in the party. */
export function partyProgress(members: readonly Pick<PartyMember, 'status'>[]): {
  done: number;
  total: number;
  ratio: number;
} {
  const total = members.length;
  const done = members.filter((m) => m.status === 'done').length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/** Why the party cannot complete yet, or null when it is waiting on nobody. */
export function waitingText(state: Pick<PartyState, 'status' | 'members'>, myId: string | null): string {
  if (state.status === 'completed') return 'Party complete. Everyone got the XP.';
  if (state.status === 'cancelled') return 'The host cancelled this party.';
  if (state.status === 'expired') return 'This party ran out of time.';
  const { done, total } = partyProgress(state.members);
  if (total < PARTY_SIZE_MIN) return 'Invite at least one friend to start.';
  const me = state.members.find((m) => m.user_id === myId);
  if (me && me.status !== 'done') return 'Do your part, then tap the button.';
  const left = total - done;
  return left === 1 ? 'Waiting for 1 friend.' : `Waiting for ${left} friends.`;
}

export function memberName(m: Pick<PartyMember, 'first_name' | 'username'>): string {
  return m.first_name?.trim() || m.username || 'Friend';
}

/** Deep link that opens the app on the party invite. */
export function partyInviteLink(code: string): string {
  return `prayerlock://party?code=${encodeURIComponent(code)}`;
}

export function partyInviteMessage(code: string, description: string): string {
  return `Join my party quest on PrayerLock: "${description}". We all get the XP when everyone is done. ${partyInviteLink(code)}`;
}

/** Turns an RPC error into a line for a toast. */
export function partyErrorText(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (msg.includes('invalid_code')) return 'That invite is not valid for you.';
  if (msg.includes('party_full')) return 'This party is full.';
  if (msg.includes('party_expired')) return 'This party ran out of time.';
  if (msg.includes('party_closed')) return 'This party is already over.';
  if (msg.includes('party_not_found')) return 'This party is not available.';
  if (msg.includes('party_limit_reached')) return 'You can start 5 party quests a day.';
  if (msg.includes('invalid_description')) return 'Describe the quest in 3 to 140 characters.';
  if (msg.includes('daily_completion_limit')) return 'You reached today\'s quest limit.';
  return 'Something went wrong. Try again.';
}

export function previewReasonText(reason: PartyBlockReason | null): string | null {
  switch (reason) {
    case 'already_member':
      return 'You are already in this party.';
    case 'party_completed':
      return 'This party is already complete.';
    case 'party_cancelled':
      return 'The host cancelled this party.';
    case 'party_expired':
      return 'This party ran out of time.';
    case 'party_full':
      return 'This party is full.';
    default:
      return null;
  }
}

/** Why a member got less than the full XP (daily cap or limit). */
export function awardNoteText(note: string | null): string | null {
  if (!note) return null;
  if (note.includes('daily_xp_cap')) return 'Daily XP cap reached';
  if (note.includes('daily_completion_limit')) return 'Daily quest limit reached';
  return 'Not paid';
}

// ---------------------------------------------------------------- cheers
// In-party emoji reactions (not the Friends "Cheer" push notification).

export const PARTY_CHEERS = ['🔥', '💪'] as const;
export type PartyCheerEmoji = (typeof PARTY_CHEERS)[number];

export interface PartyCheer {
  id: string;
  emoji: PartyCheerEmoji;
  from: string;
}

export function isPartyCheerEmoji(value: unknown): value is PartyCheerEmoji {
  return typeof value === 'string' && (PARTY_CHEERS as readonly string[]).includes(value);
}

/**
 * Validates an incoming broadcast payload. Only known emojis from people
 * who are in the party are shown.
 */
export function parseCheer(
  payload: unknown,
  memberIds: ReadonlySet<string>,
): Omit<PartyCheer, 'id'> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { emoji?: unknown; from?: unknown };
  if (!isPartyCheerEmoji(p.emoji)) return null;
  if (typeof p.from !== 'string' || !memberIds.has(p.from)) return null;
  return { emoji: p.emoji, from: p.from };
}

/** Minimum time between two cheers from one person. */
export const CHEER_COOLDOWN_MS = 1200;

export function canCheer(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= CHEER_COOLDOWN_MS;
}
