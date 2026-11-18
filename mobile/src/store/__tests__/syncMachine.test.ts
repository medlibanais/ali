import { createActor } from 'xstate';
import { syncMachine, SYNCED_DISPLAY_MS, viewOf, type SyncMachineEvent } from '../syncMachine';

function run(events: SyncMachineEvent[]) {
  const actor = createActor(syncMachine).start();
  events.forEach((e) => actor.send(e));
  return actor;
}

describe('quest sync state machine', () => {
  it('Idle -> OptimisticPending -> Synced -> Idle on an online completion', () => {
    jest.useFakeTimers();
    const actor = run([{ type: 'COMPLETE_TAPPED', questId: 'a' }]);
    expect(actor.getSnapshot().value).toBe('OptimisticPending');
    actor.send({ type: 'SERVER_CONFIRMED', questId: 'a' });
    expect(actor.getSnapshot().value).toBe('Synced');
    jest.advanceTimersByTime(SYNCED_DISPLAY_MS + 10);
    expect(actor.getSnapshot().value).toBe('Idle');
    jest.useRealTimers();
  });

  it('goes to Error with the quest to retry when the server fails', () => {
    const actor = run([
      { type: 'COMPLETE_TAPPED', questId: 'a' },
      { type: 'SERVER_FAILED', questId: 'a', title: 'Walk', message: 'nope' },
    ]);
    const view = viewOf(actor.getSnapshot());
    expect(view.state).toBe('Error');
    expect(view.errorKind).toBe('failed');
    expect(view.failedQuest).toEqual({ questId: 'a', title: 'Walk' });
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('Idle');
  });

  it('ignores answers for a quest that is no longer in flight', () => {
    const actor = run([
      { type: 'COMPLETE_TAPPED', questId: 'a' },
      { type: 'COMPLETE_TAPPED', questId: 'b' },
      { type: 'SERVER_CONFIRMED', questId: 'a' },
    ]);
    expect(actor.getSnapshot().value).toBe('OptimisticPending');
  });

  it('queues offline: OptimisticPending -> Syncing, then flushes to Synced', () => {
    const actor = run([
      { type: 'COMPLETE_TAPPED', questId: 'a' },
      { type: 'PENDING_CHANGED', pending: 1 },
    ]);
    expect(viewOf(actor.getSnapshot())).toMatchObject({ state: 'Syncing', pending: 1 });
    actor.send({ type: 'COMPLETE_TAPPED', questId: 'b' });
    actor.send({ type: 'PENDING_CHANGED', pending: 2 });
    expect(viewOf(actor.getSnapshot())).toMatchObject({ state: 'Syncing', pending: 2 });
    actor.send({ type: 'FLUSH_SUCCEEDED', remaining: 0 });
    expect(actor.getSnapshot().value).toBe('Synced');
  });

  it('stays Syncing when a flush leaves items behind', () => {
    const actor = run([
      { type: 'PENDING_CHANGED', pending: 5 },
      { type: 'FLUSH_SUCCEEDED', remaining: 2 },
    ]);
    expect(viewOf(actor.getSnapshot())).toMatchObject({ state: 'Syncing', pending: 2 });
  });

  it('turns a conflict into Error with the message, and OK goes back', () => {
    const actor = run([
      { type: 'PENDING_CHANGED', pending: 1 },
      { type: 'FLUSH_CONFLICT', message: 'already completed', remaining: 0 },
    ]);
    expect(viewOf(actor.getSnapshot())).toMatchObject({
      state: 'Error',
      errorKind: 'conflict',
      errorMessage: 'already completed',
    });
    actor.send({ type: 'DISMISS' });
    expect(actor.getSnapshot().value).toBe('Idle');
  });

  it('Retry after a failed flush goes back to Syncing while items wait', () => {
    const actor = run([
      { type: 'PENDING_CHANGED', pending: 3 },
      { type: 'FLUSH_FAILED', message: 'server error', remaining: 2 },
    ]);
    expect(actor.getSnapshot().value).toBe('Error');
    actor.send({ type: 'RETRY' });
    expect(viewOf(actor.getSnapshot())).toMatchObject({ state: 'Syncing', pending: 2 });
  });

  it('an undo that empties the queue returns to Idle', () => {
    const actor = run([
      { type: 'PENDING_CHANGED', pending: 1 },
      { type: 'PENDING_CHANGED', pending: 0 },
    ]);
    expect(actor.getSnapshot().value).toBe('Idle');
  });
});

