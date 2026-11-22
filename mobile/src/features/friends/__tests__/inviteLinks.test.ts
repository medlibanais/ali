import { friendshipTopic, inviteCodeFromUrl, inviteLink } from '../logic';

describe('inviteCodeFromUrl', () => {
  it('reads the code from the app invite link', () => {
    expect(inviteCodeFromUrl('prayerlock://add-friend?code=AB12CD34')).toBe('AB12CD34');
  });

  it('round-trips inviteLink', () => {
    expect(inviteCodeFromUrl(inviteLink('9f3a01bc'))).toBe('9F3A01BC');
  });

  it('accepts a trailing slash, extra params and a web host', () => {
    expect(inviteCodeFromUrl('prayerlock://add-friend/?utm=x&code=ab12cd34')).toBe('AB12CD34');
    expect(inviteCodeFromUrl('https://grow.example/add-friend?code=AB12CD34#top')).toBe('AB12CD34');
  });

  it('ignores other links and bad codes', () => {
    expect(inviteCodeFromUrl(null)).toBeNull();
    expect(inviteCodeFromUrl('')).toBeNull();
    expect(inviteCodeFromUrl('prayerlock://party?code=AB12CD34')).toBeNull();
    expect(inviteCodeFromUrl('prayerlock://reset-password?code=AB12CD34')).toBeNull();
    expect(inviteCodeFromUrl('prayerlock://add-friend')).toBeNull();
    expect(inviteCodeFromUrl('prayerlock://add-friend?code=')).toBeNull();
    expect(inviteCodeFromUrl('prayerlock://add-friend?code=AB')).toBeNull();
    expect(inviteCodeFromUrl("prayerlock://add-friend?code=AB'%20OR%201")).toBeNull();
    expect(inviteCodeFromUrl('prayerlock://add-friend?code=%E0%A4%A')).toBeNull();
  });
});

describe('friendshipTopic', () => {
  it('matches the topic the 0041 trigger sends to', () => {
    expect(friendshipTopic('11111111-2222-3333-4444-555555555555')).toBe(
      'friends:11111111-2222-3333-4444-555555555555',
    );
  });
});
