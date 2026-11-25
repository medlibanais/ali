import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Quest } from '../../api/types';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Txt from '../../components/Txt';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { colors, PILLAR_LABELS, spacing } from '../../theme/tokens';
import { pickWithin, rankQuests, timeEstimate } from './logic';
import { selectDailyPlan } from './selectors';
import { setDayFocus } from './store';
import { WeeklyPlanner } from './WeeklyPlanner';

export const TodayPlan = memo(function TodayPlan({ onOpen }: { onOpen: (quest: Quest) => void }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { date, plan, priority, ordered, focus, focused, action } = useAppSelector(selectDailyPlan);
  const [choice, setChoice] = useState<{ date: string; id: string } | null>(null);
  if (!date) return null;
  const index = choice?.date === date ? focused.findIndex((q) => q.quest_id === choice.id) : -1;
  const next = focused[Math.max(0, index)];
  const minutes = next ? timeEstimate(next) : null;
  const reason = focus?.kind === 'coach' ? t('planning.reasonCoach')
    : focus?.kind === 'low' ? t('planning.reasonLow')
    : next && plan?.pillar === next.pillar && priority.includes(next)
      ? t('planning.reasonFocus', { pillar: PILLAR_LABELS[next.pillar] })
      : next && priority.includes(next) ? t('planning.reasonBudget')
      : next && minutes !== null && minutes <= 10 ? t('planning.reasonQuick', { pillar: PILLAR_LABELS[next.pillar] })
      : t('planning.reasonPriority');

  return (
    <Card style={styles.card}>
      <Txt variant="label" color={colors.inkSoft}>{t('planning.nextStep')}</Txt>
      {next ? (
        <>
          <Txt variant="heading">{next.title}</Txt>
          <Txt variant="body" color={colors.inkSoft}>
            {minutes === null ? t('planning.timeUnknown') : t('planning.minutes', { count: minutes })} · {reason}
          </Txt>
          <View style={styles.actions}>
            <Button title={t('planning.startQuest')} onPress={() => onOpen(next)} />
            {focused.length > 1 ? (
              <Button variant="ghost" title={t('planning.showAnother')} onPress={() => {
                setChoice({ date, id: focused[(Math.max(0, index) + 1) % focused.length].quest_id });
              }} />
            ) : null}
          </View>
        </>
      ) : (
        <Txt variant="body" color={colors.inkSoft}>
          {focus ? t('planning.noFocusedQuests') : t('planning.noPending')}
        </Txt>
      )}
      {action ? (
        <Txt variant="caption" color={colors.inkSoft}>
          {t('planning.savedExperiment', { time: t(`planning.${action.time}`) })}
        </Txt>
      ) : null}
      <View style={styles.actions}>
        {focus || next ? (
          <Button variant="ghost" title={focus ? t('planning.restoreAll') : t('planning.lowEnergy')}
            onPress={() => {
              setChoice(null);
              dispatch(setDayFocus(focus ? null : {
                date, kind: 'low',
                ids: pickWithin(rankQuests(ordered), 10, 2).map((q) => q.quest_id),
              }));
            }} />
        ) : null}
      </View>
      <WeeklyPlanner date={date} />
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
