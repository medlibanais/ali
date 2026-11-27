// Semantic quest search hook. Debounces typing, then calls the
// search-quests edge function (which embeds the query with gte-small and
// runs the search_quests pgvector RPC). Results are cached per query.
import i18n from '../../i18n';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useDebouncedSearch } from '../../lib/useDebouncedSearch';
import { describeFunctionError, isNotDeployed } from '../../lib/functionErrors';
import {
  normalizeQuery,
  parseSearchResponse,
  type QuestSearchResult,
} from './logic';

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

async function searchQuests(
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<QuestSearchResult[]> {
  const { data, error } = await supabase.functions.invoke('search-quests', {
    body: { query, limit },
    signal,
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
  /** Current normalized input, or an empty string when too short. */
  query: string;
  results: QuestSearchResult[];
  /** True while the user is typing or a request is in flight. */
  searching: boolean;
  error: string | null;
  retry: () => void;
}

export function useQuestSearch(input: string, limit = 5): QuestSearchState {
  const query = normalizeQuery(input);
  const requestQuery = useDebouncedSearch(query);

  const result = useQuery({
    queryKey: ['quest-search', requestQuery, limit],
    queryFn: ({ signal }) => searchQuests(requestQuery, limit, signal),
    enabled: requestQuery.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: (count, err) =>
      count < 1 && err instanceof QuestSearchError && err.reason === 'unavailable',
  });

  return {
    query,
    results: requestQuery ? result.data ?? [] : [],
    searching: query.length > 0 && (!requestQuery || result.isFetching),
    error: requestQuery && result.error ? questSearchErrorMessage(result.error) : null,
    retry: () => {
      if (requestQuery) void result.refetch();
    },
  };
}
