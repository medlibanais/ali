// Live friendship changes: a private "friends:<me>" broadcast channel plus
// the old postgres_changes listener, both closed on unmount.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Handler = () => void;

interface FakeChannel {
  topic: string;
  opts: unknown;
  handlers: { type: string; event: string; cb: Handler }[];
  on: (type: string, filter: { event: string }, cb: Handler) => FakeChannel;
  subscribe: () => FakeChannel;
}

const created: FakeChannel[] = [];
const removed: FakeChannel[] = [];

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    realtime: { setAuth: jest.fn(() => Promise.resolve()) },
    channel: (topic: string, opts: unknown) => {
      const ch: FakeChannel = {
        topic,
        opts,
        handlers: [],
        on(type, filter, cb) {
          ch.handlers.push({ type, event: filter.event, cb });
          return ch;
        },
        subscribe() {
          return ch;
        },
      };
      created.push(ch);
      return ch;
    },
    removeChannel: (ch: FakeChannel) => {
      removed.push(ch);
      return Promise.resolve('ok');
    },
  },
}));

// eslint-disable-next-line import/first
import { useFriendshipRealtime } from '../useFriendshipRealtime';

const ME = '11111111-2222-3333-4444-555555555555';

function Probe({ userId }: { userId: string | null }) {
  useFriendshipRealtime(userId);
  return null;
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useFriendshipRealtime', () => {
  beforeEach(() => {
    created.length = 0;
    removed.length = 0;
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  function mount(userId: string | null) {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={qc}>
          <Probe userId={userId} />
        </QueryClientProvider>,
      );
    });
    return { renderer, spy };
  }

  it('does nothing while signed out', async () => {
    mount(null);
    await flush();
    expect(created).toHaveLength(0);
  });

  it('joins only your own private friends topic', async () => {
    mount(ME);
    await flush();
    const priv = created.find((c) => c.topic === `friends:${ME}`);
    expect(priv).toBeDefined();
    expect(priv?.opts).toEqual({ config: { private: true } });
    expect(priv?.handlers).toEqual([
      expect.objectContaining({ type: 'broadcast', event: 'friendship_changed' }),
    ]);
  });

  it('refetches friends once for a burst of changes', async () => {
    const { spy } = mount(ME);
    await flush();
    const priv = created.find((c) => c.topic === `friends:${ME}`)!;
    const pg = created.find((c) => c.topic === `friendships:${ME}`)!;
    act(() => {
      priv.handlers[0].cb();
      pg.handlers[0].cb();
      priv.handlers[0].cb();
    });
    expect(spy).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['friends'] });
  });

  it('removes every channel on unmount and ignores late events', async () => {
    const { renderer, spy } = mount(ME);
    await flush();
    const priv = created.find((c) => c.topic === `friends:${ME}`)!;
    act(() => priv.handlers[0].cb());
    act(() => renderer.unmount());
    expect(removed).toHaveLength(created.length);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
