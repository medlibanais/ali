// Runs work once the screen has settled (InteractionManager), but never
// later than `maxWaitMs`. An endless animation (a looping Animated value
// started without isInteraction: false) keeps an interaction open for good,
// and plain runAfterInteractions would then never run the work.

import { InteractionManager } from 'react-native';

export function runAfterInteractionsOrTimeout(
  work: () => void,
  maxWaitMs = 1500,
): { cancel: () => void } {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    task.cancel();
    work();
  };
  const timer = setTimeout(run, maxWaitMs);
  const task = InteractionManager.runAfterInteractions(run);
  return {
    cancel: () => {
      done = true;
      clearTimeout(timer);
      task.cancel();
    },
  };
}
