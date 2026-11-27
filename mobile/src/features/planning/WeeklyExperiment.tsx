import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Txt from '../../components/Txt';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { colors, spacing } from '../../theme/tokens';
import { usePatterns } from '../analytics/patterns';
import { strongestTime, weekStart } from './logic';
import { answerWeeklyAction } from './store';

export function WeeklyExperiment({ userId, today }: { userId: string | null; today: string }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const week = weekStart(today);
  const answer = useAppSelector((s) => s.planning.data.suggestion);
  // Patterns already uses this query key on Insights, so the request is shared.
  const patterns = usePatterns(userId);
  const answered = answer?.week === week;
  if (answered ? !answer.action : patterns.isPending || (patterns.isError && !patterns.data)) return null;
  const data = patterns.data;
  const action = answered ? answer.action : data ? strongestTime({
    morning: data.morning_count,
    afternoon: data.afternoon_count,
    evening: data.evening_count,
  }) : null;

  return (
    <Card style={styles.card}>
      <Txt variant="heading">{t('planning.weekExperiment')}</Txt>
      {action ? (
        <>
          <Txt variant="body" color={colors.inkSoft}>
            {t('planning.experimentEvidence', {
              completed: action.count, total: action.total, time: t(`planning.${action.time}`),
            })}
          </Txt>
          <Txt variant="bodySemi">{t('planning.tryExperiment', { time: t(`planning.${action.time}`) })}</Txt>
          <View style={styles.actions}>
            {answered ? (
              <Txt variant="caption" color={colors.inkSoft}>{t('planning.experimentSaved')}</Txt>
            ) : (
              <Button variant="secondary" title={t('planning.saveExperiment')}
                onPress={() => dispatch(answerWeeklyAction(week, action))} />
            )}
            <Button variant="ghost" title={t('planning.dismissExperiment')}
              onPress={() => dispatch(answerWeeklyAction(week, null))} />
          </View>
        </>
      ) : (
        <Txt variant="body" color={colors.inkSoft}>{t('planning.learningPatterns')}</Txt>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
