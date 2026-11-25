// The disk render cache on Android, with a fake file system: a returning
// person's portrait survives an app update (new model, so every key
// misses), is not evicted, and is forgotten on sign-out.

const mockFiles = new Map<string, { data: string; time: number }>();
let mockClock = 0;

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: () => Promise.resolve(),
  getInfoAsync: (p: string) => {
    const f = mockFiles.get(p);
    return Promise.resolve(f ? { exists: true, isDirectory: false, size: f.data.length, modificationTime: f.time } : { exists: false });
  },
  writeAsStringAsync: (p: string, data: string) => {
    mockFiles.set(p, { data, time: ++mockClock });
    return Promise.resolve();
  },
  readAsStringAsync: (p: string) => Promise.resolve(mockFiles.get(p)?.data ?? ''),
  readDirectoryAsync: (dir: string) =>
    Promise.resolve([...mockFiles.keys()].filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length))),
  deleteAsync: (p: string) => {
    mockFiles.delete(p);
    return Promise.resolve();
  },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

// eslint-disable-next-line import/first
import { clearPortraits, loadCachedRender, loadPortrait, saveCachedRender, setCacheVersion } from '../renderCache';

const PNG = 'data:image/png;base64,AAAA';

describe('portrait cache (Android)', () => {
  beforeEach(() => mockFiles.clear());

  it('shows the last portrait after an update while the new look is drawn', async () => {
    setCacheVersion('app-v1');
    await saveCachedRender('look-a', PNG, 'u1:today|head|0');
    expect(await loadCachedRender('look-a')).toMatch(/^file:\/\/\/cache\/avatar3d\/.+\.png$/);

    setCacheVersion('app-v2'); // new model: the exact look misses...
    expect(await loadCachedRender('look-a')).toBeNull();
    // ...but the slot still has the old picture to show meanwhile.
    expect(await loadPortrait('u1:today|head|0')).toMatch(/\.png$/);
    expect(await loadPortrait('u2:today|head|0')).toBeNull();
  });

  it('keeps the portrait through eviction and forgets it on sign-out', async () => {
    setCacheVersion('v');
    await saveCachedRender('mine', PNG, 'u1:today|head|0');
    for (let i = 0; i < 60; i++) await saveCachedRender(`other${i}`, PNG);
    const pngs = [...mockFiles.keys()].filter((k) => k.endsWith('.png'));
    expect(pngs.length).toBeLessThanOrEqual(48);
    expect(await loadPortrait('u1:today|head|0')).not.toBeNull();
    await clearPortraits();
    expect(await loadPortrait('u1:today|head|0')).toBeNull();
  });
});
