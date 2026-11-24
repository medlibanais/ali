import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserSearch } from '../../features/friends/api';
import { useQuestSearch } from '../../features/questSearch/useQuestSearch';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } },
}));

const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;
const attachSignal = jest.fn();
const friend = { id: 'friend-1', username: 'amina' };

function mount(initialInput = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let friends!: ReturnType<typeof useUserSearch>;
  let quests!: ReturnType<typeof useQuestSearch>;

  function Probe({ input }: { input: string }) {
    friends = useUserSearch(input);
    quests = useQuestSearch(input);
    return null;
  }
  const tree = (input: string) => (
    <QueryClientProvider client={client}>
      <Probe input={input} />
    </QueryClientProvider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(tree(initialInput)); });
  unmount = () => act(() => renderer.unmount());
  return {
    type: (input: string) => act(() => renderer.update(tree(input))),
    get friends() { return friends; },
    get quests() { return quests; },
  };
}

let unmount: (() => void) | undefined;
const advance = async (ms: number) => {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
};

beforeEach(() => {
  jest.useFakeTimers();
  rpc.mockReset().mockReturnValue({ abortSignal: attachSignal });
  attachSignal.mockReset().mockResolvedValue({ data: [friend], error: null });
  invoke.mockReset().mockResolvedValue({ data: { results: [] }, error: null });
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  jest.useRealTimers();
});

it('sends just the final query to both endpoints after a 300 ms pause', async () => {
  const search = mount();
  for (const input of ['a', 'am', 'ami', 'amin']) {
    search.type(input);
    await advance(40);
  }
  search.type('amina');
  expect(search.friends.searching).toBe(true);
  expect(search.quests.searching).toBe(true);
  await advance(299);
  expect(rpc).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();

  await advance(1);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('search_users', { p_query: 'amina' });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('search-quests', expect.objectContaining({
    body: { query: 'amina', limit: 5 },
  }));
});

it('cancels both searches when the input is cleared before the delay', async () => {
  const search = mount('amina');
  await advance(200);
  search.type('');
  await advance(400);
  expect(rpc).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(search.friends.searching).toBe(false);
  expect(search.quests.searching).toBe(false);
});

it('aborts obsolete in-flight requests and waits again for the edited input', async () => {
  attachSignal.mockImplementationOnce(() => new Promise(() => undefined));
  invoke.mockImplementationOnce(() => new Promise(() => undefined));
  const search = mount('amina');
  await advance(300);
  const friendSignal = attachSignal.mock.calls[0][0] as AbortSignal;
  const questSignal = invoke.mock.calls[0][1].signal as AbortSignal;
  expect(friendSignal.aborted).toBe(false);
  expect(questSignal.aborted).toBe(false);

  search.type('amine');
  expect(friendSignal.aborted).toBe(true);
  expect(questSignal.aborted).toBe(true);
  expect(search.friends.data).toBeUndefined();
  expect(search.quests.results).toEqual([]);
  await advance(299);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenCalledTimes(2);
});
