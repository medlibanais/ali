// Queue of celebrations for the CelebrationHost to play. The middleware in
// store/celebrationMiddleware.ts fills it; the host removes items as they
// finish. Everything here is plain data (no functions, no refs).

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LevelUpInfo } from '../../features/celebrations/logic';

export interface Point {
  x: number;
  y: number;
}

export interface XpBurst {
  id: number;
  xp: number;
  color: string;
  /** Window coordinates of the tap; null means "from the screen center". */
  origin: Point | null;
}

export type FullScreenCelebration =
  | ({ id: number; kind: 'levelUp' } & LevelUpInfo)
  | { id: number; kind: 'perfectDay'; questCount: number };

export interface CelebrationsState {
  bursts: XpBurst[];
  /** Played one at a time, first in first out. */
  queue: FullScreenCelebration[];
}

const initialState: CelebrationsState = { bursts: [], queue: [] };

/** XP bursts overlap freely, but not without bound. */
const MAX_BURSTS = 4;

let nextId = 1;
export const newCelebrationId = (): number => nextId++;

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

const celebrationsSlice = createSlice({
  name: 'celebrations',
  initialState,
  reducers: {
    xpBurstQueued: {
      reducer(state, action: PayloadAction<XpBurst>) {
        state.bursts.push(action.payload);
        if (state.bursts.length > MAX_BURSTS) state.bursts.shift();
      },
      prepare(burst: Omit<XpBurst, 'id'>) {
        return { payload: { ...burst, id: newCelebrationId() } };
      },
    },
    xpBurstFinished(state, action: PayloadAction<number>) {
      state.bursts = state.bursts.filter((b) => b.id !== action.payload);
    },
    celebrationQueued: {
      reducer(state, action: PayloadAction<FullScreenCelebration>) {
        const item = action.payload;
        // A level-up goes ahead of a Perfect Day that has not started yet.
        if (item.kind === 'levelUp') {
          const waiting = state.queue.findIndex(
            (c, i) => i > 0 && c.kind === 'perfectDay',
          );
          if (waiting > 0) {
            state.queue.splice(waiting, 0, item);
            return;
          }
        }
        state.queue.push(item);
      },
      prepare(item: Distribute<FullScreenCelebration>) {
        return {
          payload: { ...item, id: newCelebrationId() } as FullScreenCelebration,
        };
      },
    },
    celebrationDismissed(state, action: PayloadAction<number>) {
      state.queue = state.queue.filter((c) => c.id !== action.payload);
    },
    celebrationsCleared() {
      return initialState;
    },
  },
});

export const {
  xpBurstQueued,
  xpBurstFinished,
  celebrationQueued,
  celebrationDismissed,
  celebrationsCleared,
} = celebrationsSlice.actions;

export default celebrationsSlice.reducer;
