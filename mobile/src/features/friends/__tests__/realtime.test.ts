import {
  applyXpDelta,
  CHEER_COOLDOWN_MS,
  cheerCooldownLeft,
  cheerErrorText,
  parseXpEvent,
  rankLeaderboard,
  realtimeTopicIds,
  type CircleRow,
} from '../logic';

function row(over: Partial<CircleRow> & { id: string }): CircleRow {
  return {
    username: over.id,
    first_name: null,
    avatar_config: null,
    photo_url: null,
    avatar_mode: 'avatar',
    friendship_id: `f-${over.id}`,
    since: '2026-10-01T00:00:00Z',
    is_me: false,
    stats_shared: true,
    level: 1,
    current_streak: 0,
    best_streak: 0,
    weekly_xp: 0,
    ...over,
  };
}

describe('parseXpEvent', () => {
  it('accepts the trigger payload', () => {
    expect(parseXpEvent({ user_id: 'a', xp_delta: 20, at: 'x' })).toEqual({ user_id: 'a', xp_delta: 20 });
  });
  it('rejects anything else', () => {
    expect(parseXpEvent(null)).toBeNull();
    expect(parseXpEvent({ user_id: 1, xp_delta: 2 })).toBeNull();
    expect(parseXpEvent({ user_id: 'a', xp_delta: '20' })).toBeNull();
    expect(parseXpEvent({ user_id: 'a', xp_delta: Number.NaN })).toBeNull();
  });
});

describe('applyXpDelta', () => {
  const rows = [
    row({ id: 'me', is_me: true, friendship_id: null, weekly_xp: 100 }),
    row({ id: 'ana', weekly_xp: 90 }),
    row({ id: 'priv', stats_shared: false, weekly_xp: null }),
  ];

  it('moves a friend up the leaderboard when they earn XP', () => {
    expect(rankLeaderboard(rows).map((r) => r.id)).toEqual(['me', 'ana']);
    const next = applyXpDelta(rows, { user_id: 'ana', xp_delta: 20 });
    expect(next.find((r) => r.id === 'ana')?.weekly_xp).toBe(110);
    expect(rankLeaderboard(next).map((r) => r.id)).toEqual(['ana', 'me']);
  });

  it('subtracts on undo but never below zero', () => {
    const next = applyXpDelta(rows, { user_id: 'ana', xp_delta: -500 });
    expect(next.find((r) => r.id === 'ana')?.weekly_xp).toBe(0);
  });

  it('ignores private and unknown users and keeps the same array', () => {
    expect(applyXpDelta(rows, { user_id: 'priv', xp_delta: 10 })).toBe(rows);
    expect(applyXpDelta(rows, { user_id: 'nobody', xp_delta: 10 })).toBe(rows);
  });
});

describe('realtimeTopicIds', () => {
  it('lists you and friends who share stats, sorted', () => {
    expect(
      realtimeTopicIds([
        row({ id: 'z' }),
        row({ id: 'me', is_me: true }),
        row({ id: 'p', stats_shared: false }),
      ]),
    ).toEqual(['me', 'z']);
  });
});

describe('cheer cooldown', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  it('is open when never cheered', () => {
    expect(cheerCooldownLeft(null, now)).toBe(0);
    expect(cheerCooldownLeft(undefined, now)).toBe(0);
    expect(cheerCooldownLeft('nonsense', now)).toBe(0);
  });
  it('counts down for 3 hours', () => {
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(cheerCooldownLeft(oneHourAgo, now)).toBe(CHEER_COOLDOWN_MS - 60 * 60 * 1000);
    const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000).toISOString();
    expect(cheerCooldownLeft(fourHoursAgo, now)).toBe(0);
  });
  it('explains server errors', () => {
    expect(cheerErrorText(new Error('cheer_cooldown'))).toMatch(/recently/);
    expect(cheerErrorText({ message: 'cheer_limit' })).toMatch(/tomorrow/);
    expect(cheerErrorText('not_friends')).toMatch(/friends/);
    expect(cheerErrorText('boom')).toMatch(/Try again/);
  });
});
