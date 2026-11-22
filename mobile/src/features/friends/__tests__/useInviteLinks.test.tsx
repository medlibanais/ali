// Invite links connect you on their own: the code from the link is kept
// (Redux + storage) until you are signed in, then redeemed exactly once.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Linking } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockShowToast = jest.fn();
jest.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockRedeem = jest.fn();
jest.mock('../api', () => ({
  useRedeemInvite: () => ({ mutateAsync: mockRedeem }),
  friendErrorText: () => 'network error',
  inviteResultText: (reason?: string) => `reason:${reason}`,
}));

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line import/first
import authReducer, { setPendingInviteCode } from '../../../store/slices/authSlice';
// eslint-disable-next-line import/first
import {
  PENDING_INVITE_KEY,
  useInviteLinkCapture,
  useRedeemPendingInvite,
} from '../useInviteLinks';

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

function Capture() {
  useInviteLinkCapture();
  return null;
}
function Redeemer() {
  useRedeemPendingInvite();
  return null;
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });

let urlListener: ((e: { url: string }) => void) | null = null;

beforeEach(async () => {
  mockShowToast.mockReset();
  mockRedeem.mockReset();
  await AsyncStorage.clear();
  urlListener = null;
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation(((
    _type: string,
    cb: (e: { url: string }) => void,
  ) => {
    urlListener = cb;
    return { remove: () => { urlListener = null; } };
  }) as unknown as typeof Linking.addEventListener);
});

describe('useInviteLinkCapture', () => {
  it('keeps the code from the link that opened the app, and saves it', async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValue('prayerlock://add-friend?code=ab12cd34');
    const store = makeStore();
    act(() => {
      TestRenderer.create(<Provider store={store}><Capture /></Provider>);
    });
    await flush();
    expect(store.getState().auth.pendingInviteCode).toBe('AB12CD34');
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBe('AB12CD34');
  });

  it('restores a code saved before the app was closed', async () => {
    await AsyncStorage.setItem(PENDING_INVITE_KEY, 'SAVED123');
    const store = makeStore();
    act(() => {
      TestRenderer.create(<Provider store={store}><Capture /></Provider>);
    });
    await flush();
    expect(store.getState().auth.pendingInviteCode).toBe('SAVED123');
  });

  it('picks up a link opened while the app runs and ignores other links', async () => {
    const store = makeStore();
    act(() => {
      TestRenderer.create(<Provider store={store}><Capture /></Provider>);
    });
    await flush();
    act(() => urlListener?.({ url: 'prayerlock://party?code=PARTY123' }));
    expect(store.getState().auth.pendingInviteCode).toBeNull();
    act(() => urlListener?.({ url: 'prayerlock://add-friend?code=LIVE1234' }));
    expect(store.getState().auth.pendingInviteCode).toBe('LIVE1234');
  });

  it('forgets the saved code once it is cleared', async () => {
    const store = makeStore();
    act(() => {
      TestRenderer.create(<Provider store={store}><Capture /></Provider>);
    });
    await flush();
    act(() => {
      store.dispatch(setPendingInviteCode('ZZ998877'));
    });
    await flush();
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBe('ZZ998877');
    act(() => {
      store.dispatch(setPendingInviteCode(null));
    });
    await flush();
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });
});

describe('useRedeemPendingInvite', () => {
  it('connects once and clears the code', async () => {
    mockRedeem.mockResolvedValue({ redeemed: true });
    const store = makeStore();
    store.dispatch(setPendingInviteCode('AB12CD34'));
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Provider store={store}><Redeemer /></Provider>);
    });
    await flush();
    act(() => r.update(<Provider store={store}><Redeemer /></Provider>));
    await flush();
    expect(mockRedeem).toHaveBeenCalledTimes(1);
    expect(mockRedeem).toHaveBeenCalledWith('AB12CD34');
    expect(store.getState().auth.pendingInviteCode).toBeNull();
    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });

  it('says why a code did not work and clears it', async () => {
    mockRedeem.mockResolvedValue({ redeemed: false, reason: 'own_code' });
    const store = makeStore();
    store.dispatch(setPendingInviteCode('MINE1234'));
    act(() => {
      TestRenderer.create(<Provider store={store}><Redeemer /></Provider>);
    });
    await flush();
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'reason:own_code' });
    expect(store.getState().auth.pendingInviteCode).toBeNull();
  });

  it('keeps the code to retry later when the network fails', async () => {
    mockRedeem.mockRejectedValue(new Error('Failed to fetch'));
    const store = makeStore();
    store.dispatch(setPendingInviteCode('AB12CD34'));
    act(() => {
      TestRenderer.create(<Provider store={store}><Redeemer /></Provider>);
    });
    await flush();
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'network error' });
    expect(store.getState().auth.pendingInviteCode).toBe('AB12CD34');
  });
});
