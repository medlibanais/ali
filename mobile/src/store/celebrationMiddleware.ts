// Redux Toolkit listener middleware that turns gamification updates into
// celebrations. It only queues plain data in the celebrations slice; the
// CelebrationHost (mounted once in App.tsx) plays the animations.
//
// - XP particles: every successful completion (online, or kept offline).
// - Level-up: whenever the gamification slice reports a higher level than
//   the highest one already celebrated for this user.
// - Perfect Day: a completion that leaves every active quest done, once per
//   local date.
//
// No replays: the first gamification load per user on this device only sets
// a baseline, the marks are persisted per user, and optimistic updates that
// roll back never reach completeQuest.fulfilled. Undo lowers the level but
// not the mark, so completing again does not celebrate twice.

import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import {
  baselineMarks,
  decideLevelUp,
  decidePerfectDay,
  type CelebrationMarks,
  type LevelUpInfo,
} from '../features/celebrations/logic';
import { takeCompletionOrigin } from '../features/celebrations/anchors';
import { loadMarks, saveMarks } from '../features/celebrations/marks';
import { getColors } from '../theme/tokens';
import { logout, sessionExpired } from './slices/authSlice';
import {
  celebrationQueued,
  celebrationsCleared,
  xpBurstQueued,
} from './slices/celebrationsSlice';
import { fetchGamification } from './slices/gamificationSlice';
import { completeQuest } from './slices/questsSlice';
import type { AppDispatch, RootState } from './index';

/** Let the particles land before a full-screen moment takes over. */
const AFTER_PARTICLES_MS = 1100;
const PERFECT_DAY_DELAY_MS = 1800;

export const celebrationMiddleware = createListenerMiddleware();

const startListening = celebrationMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>();

const marksByUser = new Map<string, CelebrationMarks>();
let lastBurstAt = 0;

// Effects run one after another so two quick updates never both read the
// same old marks.
let chain: Promise<void> = Promise.resolve();
function serial(work: () => Promise<void>): Promise<void> {
  chain = chain.then(work, work);
  return chain;
}

async function marksFor(
  userId: string,
  level: number,
): Promise<{ marks: CelebrationMarks; fresh: boolean }> {
  const known = marksByUser.get(userId);
  if (known) return { marks: known, fresh: false };
  const marks = baselineMarks(await loadMarks(userId), level);
  marksByUser.set(userId, marks);
  await saveMarks(userId, marks);
  return { marks, fresh: true };
}

function remember(userId: string, marks: CelebrationMarks): Promise<void> {
  marksByUser.set(userId, marks);
  return saveMarks(userId, marks);
}

startListening({
  actionCreator: completeQuest.fulfilled,
  effect: async (action, api) => {
    const state = api.getState();
    const { quest_id: questId, xp_awarded: xp } = action.payload;
    const quest = state.quests.quests.find((q) => q.quest_id === questId);
    if (xp > 0) {
      lastBurstAt = Date.now();
      api.dispatch(
        xpBurstQueued({
          xp,
          color: quest ? getColors().pillar[quest.pillar] : getColors().gold,
          origin: takeCompletionOrigin(questId),
        }),
      );
    }

    const userId = state.auth.userId;
    if (!userId) return;
    const found = { questCount: 0 };
    await serial(async () => {
      const now = api.getState();
      const { marks } = await marksFor(userId, now.gamification.level);
      const result = decidePerfectDay(marks, now.quests.date, now.quests.quests);
      if (!result.perfect) return;
      await remember(userId, result.marks);
      found.questCount = now.quests.quests.filter((q) => !q.skipped).length;
    });
    const { questCount } = found;
    if (questCount === 0) return;
    // Waits a little longer than a level-up so that one plays first.
    await api.delay(PERFECT_DAY_DELAY_MS);
    api.dispatch(celebrationQueued({ kind: 'perfectDay', questCount }));
  },
});

startListening({
  actionCreator: fetchGamification.fulfilled,
  effect: async (_action, api) => {
    const userId = api.getState().auth.userId;
    if (!userId) return;
    const found: { levelUp: LevelUpInfo | null } = { levelUp: null };
    await serial(async () => {
      const level = api.getState().gamification.level;
      const { marks, fresh } = await marksFor(userId, level);
      if (fresh) return; // first look at this user: baseline only
      const result = decideLevelUp(marks, level);
      if (!result.levelUp) return;
      await remember(userId, result.marks);
      found.levelUp = result.levelUp;
    });
    const info = found.levelUp;
    if (!info) return;
    const sinceBurst = Date.now() - lastBurstAt;
    if (sinceBurst < AFTER_PARTICLES_MS) {
      await api.delay(AFTER_PARTICLES_MS - sinceBurst);
    }
    api.dispatch(celebrationQueued({ kind: 'levelUp', ...info }));
  },
});

startListening({
  matcher: isAnyOf(logout.fulfilled, sessionExpired),
  effect: (_action, api) => {
    api.dispatch(celebrationsCleared());
  },
});

/** Tests only: forget what was celebrated in memory. */
export function resetCelebrationMemory(): void {
  marksByUser.clear();
  lastBurstAt = 0;
  chain = Promise.resolve();
}
