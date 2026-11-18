// Semantic quest search hook. Debounces typing, then calls the
// search-quests edge function (which embeds the query with gte-small and
// runs the search_quests pgvector RPC). Results are cached per query.
import { useEffect, useState } from 'react';
import i18n from '../../i18n';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { describeFunctionError, isNotDeployed } from '../../lib/functionErrors';
import {
  normalizeQuery,
  parseSearchResponse,
  SEARCH_DEBOUNCE_MS,
  type QuestSearchResult,
} from './logic';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export class QuestSearchError extends Error {
  constructor(readonly reason: 'offline' | 'not_deployed' | 'unavailable' | 'failed') {
    super(reason);
    this.name = 'QuestSearchError';
  }
}

export function questSearchErrorMessage(error: unknown): string {
  const reason = error instanceof QuestSearchError ? error.reason : 'failed';
  switch (reason) {
    case 'offline':
      return i18n.t('questSearch.youLookOfflineSearch');
    case 'not_deployed':
      return i18n.t('questSearch.questSearchIsNot');
    case 'unavailable':
      return i18n.t('questSearch.searchIsWarmingUp');
    default:
      return i18n.t('questSearch.searchFailedTryAgain');
  }
}

async function searchQuests(query: string, limit: number): Promise<QuestSearchResult[]> {
  const { data, error } = await supabase.functions.invoke('search-quests', {
    body: { query, limit },
  });
  if (error) {
    const failure = await describeFunctionError(error);
    if (failure.kind === 'network') throw new QuestSearchError('offline');
    if (isNotDeployed(failure, ['query_too_short'])) throw new QuestSearchError('not_deployed');
    if (failure.status === 503) throw new QuestSearchError('unavailable');
    throw new QuestSearchError('failed');
  }
  return parseSearchResponse(data);
}

export interface QuestSearchState {
  /** The query actually searched (after debounce + trim); '' when idle. */
  query: string;
  results: QuestSearchResult[];
  /** True while the user is typing or a request is in flight. */
  searching: boolean;
  error: string | null;
  retry: () => void;
}

export function useQuestSearch(input: string, limit = 5): QuestSearchState {
  const debounced = useDebouncedValue(input, SEARCH_DEBOUNCE_MS);
  const query = normalizeQuery(debounced);
  const pending = normalizeQuery(input) !== query;

  const result = useQuery({
    queryKey: ['quest-search', query, limit],
    queryFn: () => searchQuests(query, limit),
    enabled: query.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: (count, err) =>
      count < 1 && err instanceof QuestSearchError && err.reason === 'unavailable',
  });

  return {
    query,
    results: query ? result.data ?? [] : [],
    searching: query.length > 0 && (pending || result.isFetching),
    error: query && result.error ? questSearchErrorMessage(result.error) : null,
    retry: () => {
      void result.refetch();
    },
  };
}
