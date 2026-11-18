// The realtime hook: one private channel per visible user, live cache
// updates from broadcasts, and every channel removed on blur/unmount.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CircleRow } from '../logic';

type Handler = (message: { payload?: unknown }) => void;

interface FakeChannel {
  topic: string;
  opts: unknown;
  handler: Handler | null;
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
        handler: null,
        on(type, filter, cb) {
          if (type === 'broadcast' && filter.event === 'xp_changed') ch.handler = cb;
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
import { CIRCLE_KEY } from '../api';
// eslint-disable-next-line import/first
import { useFriendsXpRealtime } from '../useFriendsXpRealtime';

function row(id: string, over: Partial<CircleRow> = {}): CircleRow {
  return {
    id,
    username: id,
    first_name: null,
    avatar_config: null,
    photo_url: null,
    avatar_mode: 'avatar',
    friendship_id: id === 'me' ? null : `f-${id}`,
    since: null,
    is_me: id === 'me',
    stats_shared: true,
    level: 1,
    current_streak: 0,
    best_streak: 0,
    weekly_xp: 50,
    ...over,
  };
}

function Probe(props: { rows: CircleRow[]; enabled: boolean; onXp: (id: string, d: number) => void }) {
  useFriendsXpRealtime({ rows: props.rows, enabled: props.enabled, onXpChange: props.onXp });
  return null;
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useFriendsXpRealtime', () => {
  beforeEach(() => {
    created.length = 0;
    removed.length = 0;
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('subscribes privately, updates XP live and cleans up', async () => {
    const qc = new QueryClient();
    const rows = [row('me'), row('ana'), row('priv', { stats_shared: false, weekly_xp: null })];
    qc.setQueryData(CIRCLE_KEY, rows);
    const onXp = jest.fn();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <QueryClientProvider client={qc}>
          <Probe rows={rows} enabled onXp={onXp} />
        </QueryClientProvider>,
      );
    });
    await flush();

    // Private friend gets no channel; every channel is private.
    expect(created.map((c) => c.topic)).toEqual(['xp:ana', 'xp:me']);
    expect(created.every((c) => (c.opts as { config: { private: boolean } }).config.private)).toBe(true);

    // Ana completes a 20 XP quest.
    act(() => created[0].handler?.({ payload: { user_id: 'ana', xp_delta: 20 } }));
    const after = qc.getQueryData<CircleRow[]>(CIRCLE_KEY) ?? [];
    expect(after.find((x) => x.id === 'ana')?.weekly_xp).toBe(70);
    expect(onXp).toHaveBeenCalledWith('ana', 20);

    // A forged event for someone we did not subscribe to is ignored.
    act(() => created[0].handler?.({ payload: { user_id: 'priv', xp_delta: 999 } }));
    expect(onXp).toHaveBeenCalledTimes(1);

    // Settles with a refetch from the view.
    act(() => jest.advanceTimersByTime(1600));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: CIRCLE_KEY });

    // Same people after a refetch: no resubscribe.
    await act(async () => {
      r.update(
        <QueryClientProvider client={qc}>
          <Probe rows={rows.map((x) => ({ ...x }))} enabled onXp={onXp} />
        </QueryClientProvider>,
      );
    });
    await flush();
    expect(created).toHaveLength(2);

    // Leaving the screen (blur) removes every channel.
    await act(async () => {
      r.update(
        <QueryClientProvider client={qc}>
          <Probe rows={rows} enabled={false} onXp={onXp} />
        </QueryClientProvider>,
      );
    });
    expect(removed.map((c) => c.topic).sort()).toEqual(['xp:ana', 'xp:me']);

    // Back on the screen, then unmount: removed again, nothing left open.
    await act(async () => {
      r.update(
        <QueryClientProvider client={qc}>
          <Probe rows={rows} enabled onXp={onXp} />
        </QueryClientProvider>,
      );
    });
    await flush();
    expect(created).toHaveLength(4);
    await act(async () => r.unmount());
    expect(removed).toHaveLength(4);
    qc.clear();
  });

  it('does not leak a channel when unmounted before auth resolves', async () => {
    const qc = new QueryClient();
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <QueryClientProvider client={qc}>
          <Probe rows={[row('me')]} enabled onXp={jest.fn()} />
        </QueryClientProvider>,
      );
      r.unmount();
    });
    await flush();
    expect(created).toHaveLength(0);
    qc.clear();
  });
});
