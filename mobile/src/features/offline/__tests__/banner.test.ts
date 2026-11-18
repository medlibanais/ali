import { bannerContent } from '../OfflineBanner';
import { retryDelayMs } from '../useOfflineSync';
import type { SyncMachineView } from '../../../store/syncMachine';

jest.mock('../../../lib/supabase', () => ({ supabase: { auth: {} } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-background-fetch', () => ({}));
jest.mock('expo-task-manager', () => ({ defineTask: () => undefined }));

const idle: SyncMachineView = {
  state: 'Idle',
  pending: 0,
  errorKind: null,
  errorMessage: null,
  failedQuest: null,
};
const base = { online: true, pending: 0, syncing: false, machine: idle };

describe('global sync indicator', () => {
  it('is hidden when idle and online', () => {
    expect(bannerContent(base)).toBeNull();
  });
  it('says you are offline and how many actions wait', () => {
    const c = bannerContent({ ...base, online: false, pending: 2 });
    expect(c?.title).toBe('You are offline. Quests will sync when you reconnect');
    expect(c?.detail).toBe('2 actions waiting on this device.');
  });
  it('shows "Syncing 3 actions..." with a spinner tone', () => {
    const c = bannerContent({ ...base, pending: 3, machine: { ...idle, state: 'Syncing', pending: 3 } });
    expect(c?.title).toBe('Syncing 3 actions...');
    expect(c?.tone).toBe('syncing');
  });
  it('confirms when everything synced', () => {
    expect(bannerContent({ ...base, machine: { ...idle, state: 'Synced' } })?.title).toBe('All synced');
  });
  it('offers Retry on a failure and OK on a conflict', () => {
    const failed = bannerContent({
      ...base,
      machine: { ...idle, state: 'Error', errorKind: 'failed', errorMessage: 'boom' },
    });
    expect(failed?.action).toBe('retry');
    const conflict = bannerContent({
      ...base,
      machine: {
        ...idle,
        state: 'Error',
        errorKind: 'conflict',
        errorMessage: 'This quest was already completed on another device, your XP was not doubled.',
      },
    });
    expect(conflict?.action).toBe('dismiss');
    expect(conflict?.detail).toMatch(/XP was not doubled/);
  });
  it('backs off exponentially on server errors', () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(20)).toBe(300000);
  });
});
