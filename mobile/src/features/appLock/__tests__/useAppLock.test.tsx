import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useAppLock, type AppLockState } from '../useAppLock';

type Listener = (state: AppStateStatus) => void;

let listener: Listener | null = null;
let clock = 0;
const now = () => clock;

beforeEach(() => {
  listener = null;
  clock = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    listener = handler as Listener;
    return { remove: () => { listener = null; } };
  });
});

afterEach(() => jest.restoreAllMocks());

function renderLock(enabled: boolean): { current: () => AppLockState } {
  let latest: AppLockState | null = null;
  function Probe() {
    latest = useAppLock(enabled, 5 * 60 * 1000, now);
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return { current: () => latest as unknown as AppLockState };
}

function goTo(state: AppStateStatus, at: number) {
  clock = at;
  act(() => listener?.(state));
}

describe('useAppLock', () => {
  it('is unlocked on a cold start', () => {
    const lock = renderLock(true);
    goTo('active', 10 * 60 * 1000);
    expect(lock.current().locked).toBe(false);
  });

  it('locks when the app returns after 5 minutes in the background', () => {
    const lock = renderLock(true);
    goTo('background', 0);
    goTo('active', 5 * 60 * 1000);
    expect(lock.current().locked).toBe(true);
    act(() => lock.current().unlock());
    expect(lock.current().locked).toBe(false);
  });

  it('ignores short trips and the inactive state shown during Face ID', () => {
    const lock = renderLock(true);
    goTo('background', 0);
    goTo('active', 60 * 1000);
    goTo('inactive', 2 * 60 * 1000);
    goTo('active', 20 * 60 * 1000);
    expect(lock.current().locked).toBe(false);
  });

  it('does nothing when disabled (web, signed out)', () => {
    const lock = renderLock(false);
    expect(listener).toBeNull();
    expect(lock.current().locked).toBe(false);
  });
});
