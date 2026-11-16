// Pure helpers for semantic quest search (no React, no network): easy to test.
import { PILLARS, type Pillar } from '../../theme/tokens';

export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 200;
export const SEARCH_DEBOUNCE_MS = 350;

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestSearchResult {
  id: string;
  pillar: Pillar;
  title: string;
  description: string;
  difficulty: Difficulty;
  xpReward: number;
  timeEstimateMinutes: number | null;
  /** Raw cosine similarity from pgvector (0..1). */
  similarity: number;
  /** 0-100, calibrated by the search-quests function. */
  relevance: number;
}

/** Trim, collapse spaces, cap length. Returns '' when too short to search. */
export function normalizeQuery(raw: string): string {
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  return q.length >= MIN_QUERY_LENGTH ? q : '';
}

function isPillar(v: unknown): v is Pillar {
  return typeof v === 'string' && (PILLARS as readonly string[]).includes(v);
}

function isDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'medium' || v === 'hard';
}

/** Validates the function's JSON; drops malformed rows instead of crashing. */
export function parseSearchResponse(body: unknown): QuestSearchResult[] {
  const rows = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  const out: QuestSearchResult[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      !isPillar(r.pillar) ||
      typeof r.title !== 'string' ||
      typeof r.description !== 'string' ||
      !isDifficulty(r.difficulty) ||
      typeof r.xp_reward !== 'number' ||
      typeof r.similarity !== 'number'
    ) {
      continue;
    }
    const relevance =
      typeof r.relevance === 'number' && Number.isFinite(r.relevance)
        ? Math.round(Math.min(100, Math.max(0, r.relevance)))
        : 0;
    out.push({
      id: r.id,
      pillar: r.pillar,
      title: r.title,
      description: r.description,
      difficulty: r.difficulty,
      xpReward: r.xp_reward,
      timeEstimateMinutes:
        typeof r.time_estimate_minutes === 'number' ? r.time_estimate_minutes : null,
      similarity: r.similarity,
      relevance,
    });
  }
  return out;
}

export type RelevanceBand = 'strong' | 'good' | 'weak';

export function relevanceBand(relevance: number): RelevanceBand {
  if (relevance >= 70) return 'strong';
  if (relevance >= 40) return 'good';
  return 'weak';
}

export function relevanceLabel(relevance: number): string {
  return `${Math.round(relevance)}% relevant`;
}
