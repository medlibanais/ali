// The histogram must show its tooltip on tap, toggle it off on a second
// tap, and expose an accessible 44px+ button per bar.

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, View } from 'react-native';
import themeReducer from '../../../store/slices/themeSlice';
import type { TimeBin } from '../../../features/analytics/patterns';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-svg', () => {
  const { View: RNView } = jest.requireActual('react-native');
  const Pass = ({ children }: { children?: React.ReactNode }) => <RNView>{children}</RNView>;
  const Leaf = () => null;
  return {
    __esModule: true,
    default: Pass,
    Defs: Pass,
    G: Pass,
    LinearGradient: Pass,
    Stop: Leaf,
    Rect: Leaf,
    Path: Leaf,
    Line: Leaf,
    Circle: Leaf,
  };
});

// eslint-disable-next-line import/first
import TimeOfDayHistogram from '../TimeOfDayHistogram';

const bins: TimeBin[] = [
  { key: 'morning', label: 'Morning', range: '5 AM – noon', count: 29, share: 13, perDay: 0.5, isPeak: false },
  { key: 'afternoon', label: 'Afternoon', range: 'noon – 5 PM', count: 56, share: 25, perDay: 1, isPeak: false },
  { key: 'evening', label: 'Evening', range: '5 PM – 5 AM', count: 138, share: 62, perDay: 2.5, isPeak: true },
];

function texts(root: TestRenderer.ReactTestInstance): string[] {
  return root
    .findAll((n) => typeof n.props.children === 'string')
    .map((n) => String(n.props.children));
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('animates in, shows a tooltip on tap and hides it on a second tap', () => {
  const store = configureStore({ reducer: { theme: themeReducer } });
  let tree: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    tree = TestRenderer.create(
      <Provider store={store}>
        <TimeOfDayHistogram bins={bins} />
      </Provider>,
    );
  });
  const renderer = tree as unknown as TestRenderer.ReactTestRenderer;
  const root = renderer.root;

  // Nothing is drawn until the chart knows its width.
  const outer = root.findAll((n) => n.type === View && typeof n.props.onLayout === 'function')[0];
  act(() => {
    outer.props.onLayout({ nativeEvent: { layout: { width: 340, height: 214, x: 0, y: 0 } } });
  });
  act(() => {
    jest.runAllTimers();
  });

  const bars = root.findAll(
    (n) => n.type === Pressable && String(n.props.accessibilityLabel).includes('quests completed'),
  );
  expect(bars).toHaveLength(3);
  expect(bars[2].props.accessibilityRole).toBe('button');
  expect(String(bars[2].props.accessibilityLabel)).toContain('your peak time');

  expect(texts(root).some((t) => t.includes('About 2.5 a day'))).toBe(false);
  act(() => bars[2].props.onPress());
  expect(texts(root)).toContain('138 quests · 62%');
  expect(texts(root)).toContain('About 2.5 a day');

  act(() => bars[2].props.onPress());
  expect(texts(root).some((t) => t.includes('a day'))).toBe(false);
  act(() => renderer.unmount());
});
