import React, { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Screen from '../../components/Screen';
import Txt from '../../components/Txt';
import { useToast } from '../../components/Toast';
import { localDateOf } from '../../lib/offlineQueue';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchDailyQuests } from '../../store/slices/questsSlice';
import { colors, spacing } from '../../theme/tokens';
import { buildTimeProposal, PLAN_MINUTES, timeEstimate, weekStart } from './logic';
import { applyCoachProposal } from './store';

export function CoachTimePlanner({ minutes, onChoose, onClose, onApplied }: {
  minutes: number;
  onChoose: (minutes: number) => void;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const questDate = useAppSelector((s) => s.quests.date);
  const date = questDate === localDateOf(new Date()) ? questDate : null;
  const quests = useAppSelector((s) => s.quests.quests);
  const loading = useAppSelector((s) => s.quests.loading || s.quests.refreshing);
  const pillar = useAppSelector((s) => date ? s.planning.data.weeks[weekStart(date)]?.pillar : undefined);
  const proposal = date ? buildTimeProposal(quests, date, minutes, pillar) : null;

  useEffect(() => {
    if (!date) void dispatch(fetchDailyQuests());
  }, [date, dispatch]);

  const selected = proposal?.selected ?? [];
  const deferred = proposal?.deferred ?? [];
  const total = selected.reduce((sum, quest) => sum + (timeEstimate(quest) ?? 0), 0);
  const times = [...new Set([...PLAN_MINUTES, minutes])].sort((a, b) => a - b);
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <Screen scroll contentStyle={styles.sheet}>
        <Txt variant="title">{t('planning.coachPlanTitle')}</Txt>
        <Txt variant="body" color={colors.inkSoft}>{t('planning.coachPlanIntro')}</Txt>
        <View style={styles.chips}>
          {times.map((time) => (
            <Chip key={time} label={t('planning.minutes', { count: time })} selected={minutes === time}
              onPress={() => onChoose(time)} />
          ))}
        </View>
        {!date ? (
          loading ? <Txt variant="body">{t('common.loading')}</Txt> : (
            <Button title={t('common.retry')} onPress={() => void dispatch(fetchDailyQuests())} />
          )
        ) : selected.length ? (
          <>
            <Txt variant="heading">{t('planning.doNow', { count: total })}</Txt>
            {selected.map((q) => (
              <Txt key={q.quest_id} variant="body">
                {q.title} · {t('planning.minutes', { count: timeEstimate(q) ?? 0 })}
              </Txt>
            ))}
            {deferred.length ? (
              <>
                <Txt variant="heading">{t('planning.doLater')}</Txt>
                {deferred.map((q) => (
                  <Txt key={q.quest_id} variant="body" color={colors.inkSoft}>{q.title}</Txt>
                ))}
              </>
            ) : null}
            <Button
              title={t('planning.applyPlan')}
              onPress={() => {
                if (proposal && dispatch(applyCoachProposal(proposal))) {
                  showToast({ message: t('planning.planApplied') });
                  onApplied();
                } else {
                  showToast({ message: t('planning.planChanged') });
                }
              }}
            />
          </>
        ) : (
          <Txt variant="body" color={colors.inkSoft}>{t('planning.noCoachFit')}</Txt>
        )}
        <Button variant="ghost" title={t('common.cancel')} onPress={onClose} />
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingVertical: spacing.xl, gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
