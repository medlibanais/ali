import {
  awardNoteText,
  canCheer,
  CHEER_COOLDOWN_MS,
  memberName,
  parseCheer,
  partyErrorText,
  partyInviteLink,
  partyProgress,
  waitingText,
  type PartyMember,
} from '../logic';

function member(over: Partial<PartyMember> & { user_id: string }): PartyMember {
  return {
    username: over.user_id,
    first_name: null,
    status: 'joined',
    is_creator: false,
    done_at: null,
    xp_awarded: null,
    award_note: null,
    ...over,
  };
}

describe('party logic', () => {
  it('computes shared progress', () => {
    expect(partyProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
    expect(
      partyProgress([member({ user_id: 'a', status: 'done' }), member({ user_id: 'b' })]),
    ).toEqual({ done: 1, total: 2, ratio: 0.5 });
  });

  it('tells each member what the party waits on', () => {
    const a = member({ user_id: 'a', status: 'done' });
    const b = member({ user_id: 'b' });
    const c = member({ user_id: 'c' });
    expect(waitingText({ status: 'open', members: [a] }, 'a')).toMatch(/Invite at least one/);
    expect(waitingText({ status: 'open', members: [a, b] }, 'b')).toMatch(/Do your part/);
    expect(waitingText({ status: 'open', members: [a, b] }, 'a')).toBe('Waiting for 1 friend.');
    expect(waitingText({ status: 'open', members: [a, b, c] }, 'a')).toBe('Waiting for 2 friends.');
    expect(waitingText({ status: 'completed', members: [a, b] }, 'a')).toMatch(/Everyone got the XP/);
  });

  it('builds the invite deep link', () => {
    expect(partyInviteLink('AB12CD34EF')).toBe('prayerlock://party?code=AB12CD34EF');
  });

  it('accepts only known emojis from party members', () => {
    const members = new Set(['a', 'b']);
    expect(parseCheer({ emoji: '🔥', from: 'a' }, members)).toEqual({ emoji: '🔥', from: 'a' });
    expect(parseCheer({ emoji: '💪', from: 'b' }, members)).toEqual({ emoji: '💪', from: 'b' });
    expect(parseCheer({ emoji: '💩', from: 'a' }, members)).toBeNull();
    expect(parseCheer({ emoji: '🔥', from: 'stranger' }, members)).toBeNull();
    expect(parseCheer(null, members)).toBeNull();
  });

  it('rate-limits cheers', () => {
    expect(canCheer(null, 1000)).toBe(true);
    expect(canCheer(1000, 1000 + CHEER_COOLDOWN_MS - 1)).toBe(false);
    expect(canCheer(1000, 1000 + CHEER_COOLDOWN_MS)).toBe(true);
  });

  it('maps server errors and award notes to text', () => {
    expect(partyErrorText(new Error('party_full'))).toBe('This party is full.');
    expect(partyErrorText(new Error('invalid_code'))).toMatch(/not valid/);
    expect(partyErrorText('boom')).toMatch(/Something went wrong/);
    expect(awardNoteText('daily_xp_cap')).toBe('Daily XP cap reached');
    expect(awardNoteText(null)).toBeNull();
    expect(memberName({ first_name: '  ', username: 'sam' })).toBe('sam');
  });
});
