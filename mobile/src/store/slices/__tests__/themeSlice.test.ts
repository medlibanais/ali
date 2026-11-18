import { configureStore } from '@reduxjs/toolkit';
import themeReducer, { hydrateTheme, setTheme, syncThemeWithProfile } from '../themeSlice';
import { registerThemeTransition } from '../../../theme/transition';

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStorage.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStorage.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockStorage.delete(k);
    }),
  },
}));

const mockUpdates: Array<Record<string, unknown>> = [];
let mockUpdateFails = false;
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
    },
    from: jest.fn(() => ({
      update: (row: Record<string, unknown>) => ({
        eq: async () => {
          if (mockUpdateFails) return { error: { message: 'offline' } };
          mockUpdates.push(row);
          return { error: null };
        },
      }),
    })),
  },
}));

function makeStore() {
  return configureStore({ reducer: { theme: themeReducer } });
}

beforeEach(() => {
  mockStorage.clear();
  mockUpdates.length = 0;
  mockUpdateFails = false;
  registerThemeTransition(null);
});

test('hydrates the saved theme and ignores junk', async () => {
  const store = makeStore();
  mockStorage.set('grow.theme_id', 'ocean');
  await store.dispatch(hydrateTheme());
  expect(store.getState().theme).toEqual({ themeId: 'ocean', hydrated: true });

  mockStorage.set('grow.theme_id', 'not-a-theme');
  await store.dispatch(hydrateTheme());
  expect(store.getState().theme.themeId).toBe('neon');
});

test('setTheme applies, saves locally and on the profile', async () => {
  const store = makeStore();
  await store.dispatch(setTheme('forest'));
  expect(store.getState().theme.themeId).toBe('forest');
  expect(mockStorage.get('grow.theme_id')).toBe('forest');
  expect(mockUpdates).toEqual([{ theme_preference: 'forest' }]);
  expect(mockStorage.has('grow.theme_pending_sync')).toBe(false);
});

test('setTheme freezes the old frame before switching', async () => {
  const store = makeStore();
  const seen: string[] = [];
  registerThemeTransition(async () => {
    seen.push(store.getState().theme.themeId);
  });
  await store.dispatch(setTheme('midnight'));
  expect(seen).toEqual(['neon']);
  expect(store.getState().theme.themeId).toBe('midnight');
});

test('offline pick stays pending and wins over the profile later', async () => {
  const store = makeStore();
  mockUpdateFails = true;
  await store.dispatch(setTheme('ocean'));
  expect(mockStorage.get('grow.theme_pending_sync')).toBe('1');

  mockUpdateFails = false;
  await store.dispatch(syncThemeWithProfile('forest'));
  expect(store.getState().theme.themeId).toBe('ocean');
  expect(mockUpdates).toEqual([{ theme_preference: 'ocean' }]);
  expect(mockStorage.has('grow.theme_pending_sync')).toBe(false);
});

test('a theme picked on another device follows the user here', async () => {
  const store = makeStore();
  await store.dispatch(syncThemeWithProfile('midnight'));
  expect(store.getState().theme.themeId).toBe('midnight');
  expect(mockStorage.get('grow.theme_id')).toBe('midnight');
  expect(mockUpdates).toEqual([]);
});

test('an empty profile adopts this device theme', async () => {
  const store = makeStore();
  await store.dispatch(syncThemeWithProfile(null));
  expect(store.getState().theme.themeId).toBe('neon');
  expect(mockUpdates).toEqual([{ theme_preference: 'neon' }]);
});
