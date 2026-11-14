// Counts renders on the Today screen when one quest is completed: only that
// quest's row and its pillar's bubble may re-render, and the avatar not at all.

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import TestRenderer, { act } from 'react-test-renderer';
import type { Quest } from '../../api/types';
import questsReducer, {
  completeQuest,
  fetchDailyQuests,
  questCompletedLocally,
} from '../../store/slices/questsSlice';
import gamificationReducer from '../../store/slices/gamificationSlice';
import userReducer from '../../store/slices/userSlice';
import themeReducer from '../../store/slices/themeSlice';
import { DEFAULT_AVATAR } from '../../avatar/types';

const rowRenders: Record<string, number> = {};
const bubbleRenders: Record<string, number> = {};
let avatarRenders = 0;

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../lib/offlineQueue', () => ({}));
jest.mock('../../lib/notifications', () => ({ registerDeviceForPush: () => Promise.resolve() }));
jest.mock('../../features/friends/api', () => ({ useRedeemInvite: () => ({}) }));
jest.mock('../../features/notifications/api', () => ({ useUnreadCount: () => 0 }));
jest.mock('../../components/Screen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: () => undefined }) }));
jest.mock('../../components/Motion', () => {
  const { Pressable, View } = jest.requireActual('react-native');
  return {
    useNative: false,
    useFloat: () => 0,
    FadeInUp: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    PressableScale: Pressable,
  };
});
jest.mock('../../components/QuestRow', () => {
  const { memo } = jest.requireActual('react');
  return memo(function QuestRowMock({ quest }: { quest: Quest }) {
    rowRenders[quest.quest_id] = (rowRenders[quest.quest_id] ?? 0) + 1;
    return null;
  });
});
jest.mock('../../components/PillarBubble', () => {
  const { memo } = jest.requireActual('react');
  return memo(function PillarBubbleMock({ pillar }: { pillar: string }) {
    bubbleRenders[pillar] = (bubbleRenders[pillar] ?? 0) + 1;
    return null;
  });
});
jest.mock('../../avatar/AvatarView', () => {
  const { memo } = jest.requireActual('react');
  return memo(function AvatarViewMock() {
    avatarRenders += 1;
    return null;
  });
});

// eslint-disable-next-line import/first
import PillarOrbit from '../../components/PillarOrbit';
// eslint-disable-next-line import/first
import { QuestSection } from '../TodayScreen';

const quest = (id: string, pillar: Quest['pillar'], priority: number): Quest => ({
  quest_id: id,
  predefined_id: null,
  pillar,
  title: id,
  description: '',
  difficulty: 'easy',
  xp_reward: 10,
  is_ai_generated: false,
  why_this_matters: null,
  time_estimate_minutes: null,
  assigned_date: '2026-11-14',
  completed: false,
  completed_at: null,
  skipped: false,
  priority,
});

function setup(expandedPillar: Quest['pillar'] | null) {
  const store = configureStore({
    reducer: {
      quests: questsReducer,
      gamification: gamificationReducer,
      user: userReducer,
      theme: themeReducer,
    },
  });
  store.dispatch(
    fetchDailyQuests.fulfilled(
      {
        date: '2026-11-14',
        daily_life_score: 40,
        pillars: { health: 40, family: 40, work: 40, fun: 40, spirituality: 40 },
        quests: [
          quest('h1', 'health', 1),
          quest('h2', 'health', 2),
          quest('w1', 'work', 1),
          quest('w2', 'work', 2),
          quest('f1', 'fun', 1),
          quest('s1', 'spirituality', 1),
        ],
      },
      'req',
      undefined,
    ),
  );
  const noop = () => undefined;
  act(() => {
    TestRenderer.create(
      <Provider store={store}>
        <PillarOrbit
          avatarConfig={DEFAULT_AVATAR}
          level={3}
          mood="neutral"
          expandedPillar={expandedPillar}
          onPillarPress={noop}
        />
        <QuestSection
          expandedPillar={expandedPillar}
          onClearPillar={noop}
          onSeeAll={noop}
          onOpen={noop}
          onComplete={noop}
        />
      </Provider>,
    );
  });
  for (const k of Object.keys(rowRenders)) delete rowRenders[k];
  for (const k of Object.keys(bubbleRenders)) delete bubbleRenders[k];
  avatarRenders = 0;
  return store;
}

function complete(store: ReturnType<typeof setup>, q: Quest) {
  act(() => {
    store.dispatch(questCompletedLocally(q.quest_id));
    store.dispatch(
      completeQuest.fulfilled(
        {
          quest_id: q.quest_id,
          xp_awarded: 10,
          total_xp: 10,
          level: 3,
          level_up: false,
          daily_score: 45,
          current_streak: 1,
          best_streak: 1,
          new_badges: [],
          completedAt: Date.now(),
        },
        'req',
        q,
      ),
    );
  });
}

describe('Today re-renders when a quest is completed', () => {
  it('re-renders only that row and that pillar bubble (one pillar open)', () => {
    const store = setup('work');
    complete(store, quest('w1', 'work', 1));
    expect(rowRenders).toEqual({ w1: 1 });
    expect(bubbleRenders).toEqual({ work: 1 });
    expect(avatarRenders).toBe(0);
  });

  it('leaves the other listed rows alone when the list reorders (all pillars)', () => {
    const store = setup(null);
    complete(store, quest('w1', 'work', 1));
    // Top four was h1, w1, f1, s1. w1 (done) drops below the fold and h2
    // moves up into view (its first render); rows that stay are untouched.
    expect(rowRenders).toEqual({ h2: 1 });
    expect(bubbleRenders).toEqual({ work: 1 });
    expect(avatarRenders).toBe(0);
  });
});
