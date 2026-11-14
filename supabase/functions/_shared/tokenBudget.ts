// Keeps a coach request inside Groq's limits.
// Pure functions only (no I/O) so they are easy to test.
//
// Groq's free and dev tiers cap tokens per minute per model (a few thousand
// for the models we use), and every request also has a context window. A
// request over either is rejected outright, so instead of sending a prompt
// that might fail we estimate its size and shrink it first, dropping the
// least useful parts in a fixed order.

import type { ChatTurn } from './llm.ts';

/**
 * Default input budget for one coach request, in estimated tokens. Leaves
 * room for the reply (and hidden reasoning on gpt-oss) under an 8k
 * tokens-per-minute cap. Override with the COACH_PROMPT_TOKEN_BUDGET secret.
 */
export const DEFAULT_PROMPT_TOKEN_BUDGET = 3500;

/** Never budget below this: the safety-relevant core prompt must fit. */
const MIN_BUDGET = 800;

/** Fewest recent chat turns kept before we start compacting the prompt. */
const MIN_HISTORY_TURNS = 2;

/** Fixed per-message overhead in the chat format (role, separators). */
const PER_MESSAGE_TOKENS = 4;

/**
 * Rough, deliberately pessimistic token estimate. English averages about 4
 * characters per token, but French, Arabic script and Darija split into
 * more tokens, so count 3 characters per token to stay on the safe side.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function estimateTurns(turns: ChatTurn[]): number {
  return turns.reduce(
    (sum, t) => sum + estimateTokens(t.content) + PER_MESSAGE_TOKENS,
    0,
  );
}

/** Reads COACH_PROMPT_TOKEN_BUDGET; falls back to the default when unset or invalid. */
export function promptBudget(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return DEFAULT_PROMPT_TOKEN_BUDGET;
  return Math.max(MIN_BUDGET, Math.floor(n));
}

export interface FitInput {
  /** Full system prompt. */
  system: string;
  /** Shorter system prompt with the same rules but less context. */
  compactSystem: string;
  /** Earlier conversation, oldest first. */
  history: ChatTurn[];
  /** Turns that must always be sent after the history (hints, the new message). */
  tail: ChatTurn[];
  budget: number;
}

export interface FitResult {
  turns: ChatTurn[];
  estimatedTokens: number;
  /** How many old chat turns were left out. */
  droppedTurns: number;
  /** True when the compact system prompt was used. */
  compacted: boolean;
  /** True when even the compact prompt had to be cut. */
  truncated: boolean;
}

/**
 * Shrinks a request until its estimate fits the budget, in this order:
 * 1. drop the oldest chat turns, keeping the last two;
 * 2. switch to the compact system prompt;
 * 3. drop the remaining chat turns;
 * 4. cut the end of the system prompt (the rules come first, so they stay).
 */
export function fitToBudget(input: FitInput): FitResult {
  const { tail, budget } = input;
  let system = input.system;
  let history = [...input.history];
  let compacted = false;
  let truncated = false;

  const total = () =>
    estimateTurns([{ role: 'system', content: system }, ...history, ...tail]);

  while (total() > budget && history.length > MIN_HISTORY_TURNS) {
    history.shift();
  }
  if (total() > budget) {
    system = input.compactSystem;
    compacted = true;
  }
  while (total() > budget && history.length > 0) {
    history.shift();
  }
  // A leading assistant turn without the question it answered reads as the
  // coach talking to itself; drop it when trimming left one at the front.
  if (history.length < input.history.length && history[0]?.role === 'assistant') {
    history.shift();
  }
  const over = total() - budget;
  if (over > 0) {
    const keepChars = Math.max(0, system.length - over * 3);
    system = system.slice(0, keepChars);
    truncated = true;
  }

  return {
    turns: [{ role: 'system', content: system }, ...history, ...tail],
    estimatedTokens: total(),
    droppedTurns: input.history.length - history.length,
    compacted,
    truncated,
  };
}
