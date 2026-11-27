// The Coach message that is still waiting for its reply, kept on the phone
// (MMKV on Android, localStorage on web) so it survives a lost signal, the
// app being closed, or a restart. Keyed by account, so another account
// signed in on the same phone never sees or recovers it.
//
// The turn id is made here, once per message. The server uses it for the
// saved message, the saved reply and the daily count, so sending the same
// turn again never counts or pays twice (migration 0046).

import { kvStore } from './kvStore';

export interface PendingTurn {
  turnId: string;
  conversationId: string | null;
  text: string;
  /** ms since epoch, when the person tapped send. */
  sentAt: number;
}

const KEY = (userId: string) => `coach_pending_turn:${userId}`;

/** After this long a pending turn is dropped instead of recovered. */
export const PENDING_TURN_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export function savePendingTurn(userId: string, turn: PendingTurn): void {
  try {
    kvStore.set(KEY(userId), JSON.stringify(turn));
  } catch {
    // Storage full or unavailable: recovery after a restart is lost, the
    // live reconnect still works.
  }
}

export function loadPendingTurn(userId: string, now = Date.now()): PendingTurn | null {
  try {
    const raw = kvStore.getString(KEY(userId));
    if (!raw) return null;
    const turn = JSON.parse(raw) as Partial<PendingTurn>;
    if (
      typeof turn.turnId !== 'string' ||
      typeof turn.text !== 'string' ||
      typeof turn.sentAt !== 'number'
    ) {
      kvStore.delete(KEY(userId));
      return null;
    }
    if (now - turn.sentAt > PENDING_TURN_MAX_AGE_MS) {
      kvStore.delete(KEY(userId));
      return null;
    }
    return {
      turnId: turn.turnId,
      text: turn.text,
      sentAt: turn.sentAt,
      conversationId: typeof turn.conversationId === 'string' ? turn.conversationId : null,
    };
  } catch {
    return null;
  }
}

/** Clears the pending turn, only if it is still this one. */
export function clearPendingTurn(userId: string, turnId: string): void {
  const current = loadPendingTurn(userId);
  if (current && current.turnId !== turnId) return;
  try {
    kvStore.delete(KEY(userId));
  } catch {
    // ignore
  }
}

/** RFC 4122 version 4 id. Uses crypto.getRandomValues when the engine has it. */
export function newTurnId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
