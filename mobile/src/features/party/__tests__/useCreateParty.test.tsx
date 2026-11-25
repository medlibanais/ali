import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useCreateParty, type CreatePartyInput, type PartyState } from '../api';

jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../../store/hooks', () => ({}));
jest.mock('../../../store/slices/gamificationSlice', () => ({}));
jest.mock('../../../store/slices/questsSlice', () => ({}));

const rpc = supabase.rpc as jest.Mock;
const draft: CreatePartyInput = {
  pillar: 'health',
  description: 'Go for a walk',
  difficulty: 'medium',
  maxParticipants: 4,
};
const party = { id: 'party-1' } as PartyState;
const success = { data: party, error: null };

let renderer: TestRenderer.ReactTestRenderer;
let action: ReturnType<typeof useCreateParty>;

beforeEach(() => {
  rpc.mockReset();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  function Probe() {
    action = useCreateParty();
    return null;
  }
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => renderer.unmount());
});

it('ignores overlapping presses and late presses for the already submitted draft', async () => {
  let finish!: (result: typeof success) => void;
  rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

  await act(async () => {
    const submit = action.submit;
    const pending = submit(draft);
    await expect(submit(draft)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    finish(success);
    await expect(pending).resolves.toBe(party);
    await expect(submit(draft)).resolves.toBeNull();
  });
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('reuses the key on retry and gives a new submission a different key', async () => {
  const networkError = new Error('connection lost');
  rpc
    .mockResolvedValueOnce({ data: null, error: networkError })
    .mockResolvedValue(success);

  await act(async () => {
    await expect(action.submit(draft)).rejects.toThrow('connection lost');
    await expect(action.submit({ ...draft, description: 'Go for a walk ' })).resolves.toBe(party);
    action.startNewDraftAfterSuccess();
    await expect(action.submit(draft)).resolves.toBe(party);
  });

  const [first, retried, newDraft] = rpc.mock.calls.map((call) => call[1]);
  expect(first.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(retried).toEqual(first);
  expect(newDraft.p_request_id).not.toBe(first.p_request_id);
});

it('uses a new key if the submitted details change after an error', async () => {
  rpc
    .mockResolvedValueOnce({ data: null, error: new Error('connection lost') })
    .mockResolvedValue(success);

  await act(async () => {
    await expect(action.submit(draft)).rejects.toThrow('connection lost');
    await expect(action.submit({ ...draft, maxParticipants: 6 })).resolves.toBe(party);
  });

  const [first, edited] = rpc.mock.calls.map((call) => call[1]);
  expect(edited.p_request_id).not.toBe(first.p_request_id);
  expect(edited.p_max_participants).toBe(6);
});
