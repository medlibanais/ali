import { LOCK_AFTER_MS, failureFromErrorCode, shouldLockOnResume } from '../policy';

describe('shouldLockOnResume', () => {
  it('never locks on a cold start (nothing was backgrounded)', () => {
    expect(shouldLockOnResume(null, Date.now())).toBe(false);
  });

  it('stays unlocked for a short trip away', () => {
    expect(shouldLockOnResume(1_000, 1_000 + LOCK_AFTER_MS - 1)).toBe(false);
  });

  it('locks after 5 minutes in the background', () => {
    expect(LOCK_AFTER_MS).toBe(5 * 60 * 1000);
    expect(shouldLockOnResume(1_000, 1_000 + LOCK_AFTER_MS)).toBe(true);
  });
});

describe('failureFromErrorCode', () => {
  it('maps the module error codes to lock screen reasons', () => {
    expect(failureFromErrorCode('user_cancel')).toBe('cancelled');
    expect(failureFromErrorCode('lockout')).toBe('lockout');
    expect(failureFromErrorCode('not_enrolled')).toBe('unavailable');
    expect(failureFromErrorCode('authentication_failed')).toBe('failed');
  });
});
