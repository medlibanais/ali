// The 3D avatar at startup: a look mockSaved on disk shows without starting
// the WebView renderer; only a missing look starts it.

const mockCached = new Map<string, string>();
const mockSaved: string[] = [];

jest.mock('../renderCache', () => ({
  setCacheVersion: () => undefined,
  loadCachedRender: (key: string) => Promise.resolve(mockCached.get(key) ?? null),
  saveCachedRender: (key: string) => {
    mockSaved.push(key);
    return Promise.resolve();
  },
}));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ hash: 'h', uri: 'u', localUri: 'u', downloadAsync: () => Promise.resolve() }) },
}));
jest.mock('../../../assets/avatar3d/viewer.html', () => 1, { virtual: true });
jest.mock('../../../assets/avatar3d/models/core.bin', () => 2, { virtual: true });

// eslint-disable-next-line import/first
import { __avatar3dInternals, requestRender } from '../Avatar3D';
const { hashKey } = jest.requireActual<typeof import('../renderCache')>('../renderCache');

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('3D avatar startup', () => {
  beforeEach(() => {
    mockCached.clear();
    mockSaved.length = 0;
    __avatar3dInternals.reset();
  });

  it('shows a look saved on disk without starting the renderer', async () => {
    mockCached.set('today-look', 'file:///cache/avatar3d/abc.png');
    requestRender({ key: 'today-look', mode: 'full-body', command: {}, persist: true });
    await flush();
    expect(__avatar3dInternals.imageCount()).toBe(1);
    expect(__avatar3dInternals.isHostWanted()).toBe(false);
  });

  it('starts the renderer when the look is not on disk', async () => {
    requestRender({ key: 'new-look', mode: 'full-body', command: {}, persist: true });
    expect(__avatar3dInternals.isHostWanted()).toBe(false); // still checking disk
    await flush();
    expect(__avatar3dInternals.isHostWanted()).toBe(true);
  });

  it('never looks on disk for editor previews', () => {
    requestRender({ key: 'slider', mode: 'head', command: {}, channel: 'editor' });
    expect(__avatar3dInternals.isHostWanted()).toBe(true);
  });
});

describe('hashKey', () => {
  it('is stable and spreads similar keys apart', () => {
    expect(hashKey('a')).toBe(hashKey('a'));
    expect(hashKey('["head",1]')).not.toBe(hashKey('["head",2]'));
  });
});

describe('render cache bounds', () => {
  const { pickEvictions } = jest.requireActual<typeof import('../renderCache')>('../renderCache');
  const files = (n: number, size: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `f${i}`, time: i, size }));

  it('keeps at most the entry limit, oldest out first', () => {
    expect(pickEvictions(files(50, 1000), 48, 1e9)).toEqual(['f0', 'f1']);
  });

  it('also keeps the folder under the byte limit', () => {
    // 40 full-body pictures of 250 KB = 10 MB: drop the oldest until <= 8 MB.
    const out = pickEvictions(files(40, 250_000), 48, 8_000_000);
    expect(out).toHaveLength(8);
    expect(out[0]).toBe('f0');
  });

  it('never deletes the picture just saved', () => {
    expect(pickEvictions([{ name: 'big', time: 1, size: 9e9 }], 48, 1000)).toEqual([]);
  });
});
