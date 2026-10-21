// Pure friends helpers (no Supabase), kept apart so they can be unit tested.

export type Relation = 'none' | 'friends' | 'outgoing' | 'incoming';

export interface UserSearchResult {
  id: string;
  username: string;
  first_name: string | null;
  avatar_config: Record<string, unknown> | null;
  photo_url: string | null;
  avatar_mode: 'avatar' | 'photo';
}

export interface SearchHit extends UserSearchResult {
  relation: Relation;
  friendship_id: string | null;
}

// One row of friend_leaderboard(): you plus each accepted friend.
// Stats are null when that friend keeps them private.
export interface CircleRow extends UserSearchResult {
  friendship_id: string | null;
  since: string | null;
  is_me: boolean;
  stats_shared: boolean;
  level: number | null;
  current_streak: number | null;
  best_streak: number | null;
  weekly_xp: number | null;
}

export interface FriendRow extends CircleRow {
  friendship_id: string;
}

export interface RankedRow extends CircleRow {
  rank: number;
}

export function displayName(u: { first_name: string | null; username: string }): string {
  return u.first_name?.trim() || u.username;
}

export function friendsOnly(rows: CircleRow[]): FriendRow[] {
  return rows
    .filter((r): r is FriendRow => !r.is_me && r.friendship_id !== null)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

// Weekly XP leaderboard. Friends with private stats are left out rather
// than shown at the bottom with 0 XP. Ties share a rank (1, 2, 2, 4).
export function rankLeaderboard(rows: CircleRow[]): RankedRow[] {
  const sorted = rows
    .filter((r) => r.stats_shared && r.weekly_xp !== null)
    .sort(
      (a, b) =>
        (b.weekly_xp ?? 0) - (a.weekly_xp ?? 0) ||
        (b.level ?? 0) - (a.level ?? 0) ||
        displayName(a).localeCompare(displayName(b)),
    );
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || row.weekly_xp !== sorted[i - 1].weekly_xp) rank = i + 1;
    return { ...row, rank };
  });
}

export function friendErrorText(error: unknown): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  if (msg.includes('cannot_friend_yourself')) return 'That is your own account.';
  if (msg.includes('already_friends')) return 'You are already friends.';
  if (msg.includes('request_already_pending')) return 'A request is already pending.';
  if (msg.includes('request_declined_recently'))
    return 'They declined recently. You can ask again in a few days.';
  if (msg.includes('too_many_pending'))
    return 'You have too many pending requests. Wait for some answers first.';
  if (msg.includes('cannot_request')) return 'You cannot send a request to this user.';
  if (msg.includes('user_not_found')) return 'No user found with that username.';
  if (msg.includes('already_responded')) return 'This request was already answered.';
  if (msg.includes('not_found')) return 'This request no longer exists.';
  return 'Something went wrong. Try again.';
}

export function inviteResultText(reason: string | undefined): string {
  if (reason === 'own_code') return 'That is your own code.';
  if (reason === 'already_connected') return 'You are already connected.';
  return 'That code is not valid.';
}

/** Deep link that opens the app on "add friend" with the code filled in. */
export function inviteLink(code: string): string {
  return `prayerlock://add-friend?code=${encodeURIComponent(code)}`;
}

export function inviteMessage(code: string): string {
  return `Become who you want to be with me on PrayerLock. Add me with my code ${code}: ${inviteLink(code)}`;
}
