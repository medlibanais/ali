import { bannerContent } from '../OfflineBanner';
import { retryDelayMs } from '../useOfflineSync';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const base = { online: true, pending: 0, syncing: false, justSynced: 0, rejected: [] };

describe('offline banner', () => {
  it('is hidden when online with nothing to say', () => {
    expect(bannerContent(base)).toBeNull();
  });
  it('says Offline and how many quests wait', () => {
    const c = bannerContent({ ...base, online: false, pending: 2 });
    expect(c?.title).toBe('You are offline. Quests will sync when you reconnect');
    expect(c?.detail).toMatch(/2 waiting/);
    expect(c?.action).toBe('retry');
  });
  it('shows syncing, then synced', () => {
    expect(bannerContent({ ...base, pending: 1, syncing: true })?.title).toBe('Syncing 1 quest…');
    expect(bannerContent({ ...base, justSynced: 3 })?.title).toMatch(/3 quests synced/);
  });
  it('explains refused completions', () => {
    const c = bannerContent({
      ...base,
      rejected: [{ title: 'Walk', reason: 'the daily limit of 15 quests was already reached' }],
    });
    expect(c?.tone).toBe('warning');
    expect(c?.detail).toMatch(/"Walk": the daily limit/);
  });
  it('backs off on server errors', () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBe(15000);
    expect(retryDelayMs(3)).toBe(60000);
    expect(retryDelayMs(20)).toBe(300000);
  });
});
