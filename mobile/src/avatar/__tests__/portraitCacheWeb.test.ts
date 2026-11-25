// The web render cache (localStorage): the portrait slot survives an app
// update and the 10-entry eviction, and is forgotten on sign-out.

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

// eslint-disable-next-line import/first
import { clearPortraits, loadCachedRender, loadPortrait, saveCachedRender, setCacheVersion } from '../renderCache';

const PNG = 'data:image/png;base64,AAAA';

it('keeps the portrait across an update and eviction, until sign-out', async () => {
  setCacheVersion('app-v1');
  await saveCachedRender('mine', PNG, 'u1:today|head|0');
  for (let i = 0; i < 20; i++) await saveCachedRender(`other${i}`, PNG);
  setCacheVersion('app-v2');
  expect(await loadCachedRender('mine')).toBeNull();
  expect(await loadPortrait('u1:today|head|0')).toBe(PNG);
  const pictures = [...store.keys()].filter((k) => k.startsWith('grow.avatar3d.') && !k.endsWith('index') && !k.endsWith('portraits'));
  expect(pictures.length).toBeLessThanOrEqual(10);
  await clearPortraits();
  expect(await loadPortrait('u1:today|head|0')).toBeNull();
});
