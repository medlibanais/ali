import {
  friendErrorText,
  friendsOnly,
  inviteLink,
  inviteMessage,
  inviteResultText,
  rankLeaderboard,
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

describe('rankLeaderboard', () => {
  it('sorts by weekly XP and includes you', () => {
    const ranked = rankLeaderboard([
      row({ id: 'me', is_me: true, friendship_id: null, weekly_xp: 50 }),
      row({ id: 'bob', weekly_xp: 120 }),
      row({ id: 'cat', weekly_xp: 10 }),
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['bob', 1],
      ['me', 2],
      ['cat', 3],
    ]);
  });

  it('leaves out friends with private stats instead of ranking them at 0', () => {
    const ranked = rankLeaderboard([
      row({ id: 'me', is_me: true, friendship_id: null, weekly_xp: 0 }),
      row({ id: 'shy', stats_shared: false, weekly_xp: null, level: null }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['me']);
  });

  it('gives tied XP the same rank and breaks ties by level', () => {
    const ranked = rankLeaderboard([
      row({ id: 'a', weekly_xp: 80, level: 2 }),
      row({ id: 'b', weekly_xp: 80, level: 5 }),
      row({ id: 'c', weekly_xp: 30 }),
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['b', 1],
      ['a', 1],
      ['c', 3],
    ]);
  });
});

describe('friendsOnly', () => {
  it('drops your own row and sorts by name', () => {
    const list = friendsOnly([
      row({ id: 'zed', first_name: 'Zed' }),
      row({ id: 'me', is_me: true, friendship_id: null }),
      row({ id: 'amy', first_name: 'Amy' }),
    ]);
    expect(list.map((f) => f.id)).toEqual(['amy', 'zed']);
  });
});

describe('friendErrorText', () => {
  it('reads Supabase error objects that are not Error instances', () => {
    expect(friendErrorText({ message: 'request_already_pending', code: 'P0001' })).toBe(
      'A request is already pending.',
    );
  });
  it('explains the decline cooldown', () => {
    expect(friendErrorText(new Error('request_declined_recently'))).toMatch(/declined recently/);
  });
  it('falls back to a generic message', () => {
    expect(friendErrorText('boom')).toBe('Something went wrong. Try again.');
  });
});

describe('inviteResultText', () => {
  it('maps each reason', () => {
    expect(inviteResultText('own_code')).toBe('That is your own code.');
    expect(inviteResultText('already_connected')).toBe('You are already connected.');
    expect(inviteResultText('invalid_code')).toBe('That code is not valid.');
  });
});

describe('inviteLink', () => {
  it('builds the add-friend deep link with the code', () => {
    expect(inviteLink('AB12CD')).toBe('prayerlock://add-friend?code=AB12CD');
    expect(inviteMessage('AB12CD')).toContain('prayerlock://add-friend?code=AB12CD');
  });
});
