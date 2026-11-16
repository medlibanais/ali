// Plays what the celebration middleware queued: XP bursts overlap on a
// touch-through layer; level-ups and Perfect Days take the screen one at a
// time. Mounted once, above the navigator.

import React, { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { celebrationDismissed, xpBurstFinished } from '../../store/slices/celebrationsSlice';
import LevelUpModal from './LevelUpModal';
import PerfectDayTakeover from './PerfectDayTakeover';
import XpParticles from './XpParticles';
import { notifyXpArrived } from './anchors';

export const CelebrationHost = memo(function CelebrationHost() {
  const dispatch = useAppDispatch();
  const bursts = useAppSelector((state) => state.celebrations.bursts);
  const current = useAppSelector((state) => state.celebrations.queue[0] ?? null);
  const reduceMotion = useReducedMotion();

  const finishBurst = useCallback((id: number) => dispatch(xpBurstFinished(id)), [dispatch]);
  const dismiss = useCallback(() => {
    if (current) dispatch(celebrationDismissed(current.id));
  }, [dispatch, current]);

  // Reduced motion: no flying particles, just the bar's glow.
  React.useEffect(() => {
    if (!reduceMotion || bursts.length === 0) return;
    notifyXpArrived();
    bursts.forEach((b) => dispatch(xpBurstFinished(b.id)));
  }, [reduceMotion, bursts, dispatch]);

  return (
    <>
      {!reduceMotion && bursts.length > 0 ? (
        <View style={styles.layer} pointerEvents="none">
          {bursts.map((b) => (
            <XpParticles key={b.id} burst={b} onDone={finishBurst} />
          ))}
        </View>
      ) : null}
      {current?.kind === 'levelUp' ? (
        <LevelUpModal key={current.id} info={current} onDismiss={dismiss} />
      ) : null}
      {current?.kind === 'perfectDay' ? (
        <PerfectDayTakeover key={current.id} questCount={current.questCount} onDismiss={dismiss} />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
});

export default CelebrationHost;
