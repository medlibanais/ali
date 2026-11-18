// The daily life score as a Reanimated SharedValue, for the avatar's
// breathing pace. It subscribes to the store directly instead of through
// useSelector, so a score change (a quest completed) updates the value on
// the UI thread without re-rendering the component that holds it.

import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { RootState } from './index';

/** Until today's quests load, breathe at a neutral pace, not a stressed 0. */
export const selectBreathScore = (state: RootState): number =>
  state.quests.date === null ? 50 : state.quests.dailyLifeScore;

export function useLifeScoreValue(): SharedValue<number> {
  const store = useStore<RootState>();
  const score = useSharedValue(selectBreathScore(store.getState()));
  useEffect(() => {
    let last = selectBreathScore(store.getState());
    score.value = last;
    return store.subscribe(() => {
      const next = selectBreathScore(store.getState());
      if (next !== last) {
        last = next;
        score.value = next;
      }
    });
  }, [store, score]);
  return score;
}
