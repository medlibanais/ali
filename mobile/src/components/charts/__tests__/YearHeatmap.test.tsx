// The heatmap must stay cheap with a full year: 365 cells render once, and
// tapping a day (tooltip + highlight) must not re-render any of them.

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable } from 'react-native';
import themeReducer from '../../../store/slices/themeSlice';
import type { XpDay } from '../../../features/analytics/yearHeatmap';

let rectRenders = 0;

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-svg', () => {
  const { View } = jest.requireActual('react-native');
  const Pass = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  return {
    __esModule: true,
    default: Pass,
    Defs: Pass,
    LinearGradient: Pass,
    Stop: () => null,
    Rect: (props: { fill?: string }) => {
      rectRenders += 1;
      return <View testID={`rect:${props.fill ?? ''}`} />;
    },
  };
});

// eslint-disable-next-line import/first
import YearHeatmap from '../YearHeatmap';

function year(): XpDay[] {
  const out: XpDay[] = [];
  const start = Date.UTC(2025, 10, 16);
  for (let i = 0; i < 365; i += 1) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    out.push({ date, xp: (i * 37) % 260 });
  }
  return out;
}

function findText(root: TestRenderer.ReactTestInstance, text: string): boolean {
  return root
    .findAll((n) => typeof n.props.children === 'string')
    .some((n) => String(n.props.children).includes(text));
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('renders a year once and only redraws the highlight on tap', () => {
  const store = configureStore({ reducer: { theme: themeReducer } });
  let tree: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    tree = TestRenderer.create(
      <Provider store={store}>
        <YearHeatmap days={year()} today="2026-11-15" />
      </Provider>,
    );
  });
  const renderer = tree as unknown as TestRenderer.ReactTestRenderer;
  const root = renderer.root;
  // Let the cascade finish (53 columns, 14 ms apart, 360 ms each).
  act(() => {
    jest.runAllTimers();
  });

  // 365 day cells + 1 legend bar.
  expect(rectRenders).toBe(366);

  const grid = root.findAll(
    (n) =>
      n.type === Pressable && String(n.props.accessibilityLabel).startsWith('Year of activity'),
  )[0];
  expect(grid).toBeDefined();

  // Last column (52), row 0 = 2026-11-15, which has xp (364*37)%260.
  const before = rectRenders;
  act(() => {
    grid.props.onPress({ nativeEvent: { locationX: 52 * 15 + 4, locationY: 4 } });
  });
  // Only the selection outline is drawn; no cell re-rendered.
  expect(rectRenders - before).toBe(1);
  expect(findText(root, `${(364 * 37) % 260} XP earned`)).toBe(true);

  // Tapping the same day again closes the tooltip.
  act(() => {
    grid.props.onPress({ nativeEvent: { locationX: 52 * 15 + 4, locationY: 4 } });
  });
  expect(findText(root, 'XP earned')).toBe(false);
  act(() => renderer.unmount());
});
