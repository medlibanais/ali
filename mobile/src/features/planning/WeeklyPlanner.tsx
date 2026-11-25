import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Screen from '../../components/Screen';
import Txt from '../../components/Txt';
import { appLocale } from '../../i18n';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { colors, PILLARS, PILLAR_LABELS, spacing } from '../../theme/tokens';
import { PLAN_MINUTES, weekStart, type WeeklyPlan } from './logic';
import { saveWeek } from './store';

const defaults: WeeklyPlan = { pillar: 'health', minutes: 20, busyDays: [] };
const weekdays = [0, 1, 2, 3, 4, 5, 6];

export function WeeklyPlanner({ date }: { date: string }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const upcoming = weekStart(date, true);
  const current = weekStart(date);
  const activePlan = useAppSelector((s) => s.planning.data.weeks[current]);
  const nextPlan = useAppSelector((s) => s.planning.data.weeks[upcoming]);
  const [draft, setDraft] = useState<WeeklyPlan | null>(null);
  const [target, setTarget] = useState(upcoming);
  const [preview, setPreview] = useState(false);
  const locale = appLocale();
  const targetStart = Date.parse(`${target}T00:00:00Z`);
  const [weekdayFormat, dateFormat] = useMemo(() => [
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }),
    new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', timeZone: 'UTC' }),
  ], [locale]);
  const weekdayLabel = (day: number) => weekdayFormat.format(targetStart + day * 86_400_000);

  function edit(week: string, saved?: WeeklyPlan) {
    setTarget(week);
    setDraft(saved ?? defaults);
    setPreview(false);
  }

  return (
    <>
      {activePlan ? (
        <Txt variant="caption" color={colors.inkSoft}>
          {t('planning.thisWeekSummary', { pillar: PILLAR_LABELS[activePlan.pillar], count: activePlan.minutes })}
        </Txt>
      ) : null}
      <View style={styles.actions}>
        <Button variant="ghost" title={activePlan ? t('planning.editThisWeek') : t('planning.planThisWeek')}
          onPress={() => edit(current, activePlan)} />
        <Button variant="secondary" title={nextPlan ? t('planning.editNextWeek') : t('planning.planNextWeek')}
          onPress={() => edit(upcoming, nextPlan ?? activePlan)} />
      </View>
      {draft ? (
        <Modal animationType="slide" onRequestClose={() => setDraft(null)}>
          <Screen scroll contentStyle={styles.form}>
            <Txt variant="title">{preview ? t('planning.reviewWeek') : t('planning.weekTitle')}</Txt>
            <Txt variant="caption" color={colors.inkSoft}>
              {t('planning.weekStarting', { date: dateFormat.format(targetStart) })}
            </Txt>
            {preview ? (
              <>
                <Txt variant="body">
                  {t('planning.weekSummary', { pillar: PILLAR_LABELS[draft.pillar], count: draft.minutes })}
                </Txt>
                <Txt variant="body" color={colors.inkSoft}>
                  {draft.busyDays.length
                    ? t('planning.busySummary', {
                      days: draft.busyDays.map(weekdayLabel).join(', '),
                    })
                    : t('planning.noBusyDays')}
                </Txt>
                <Button title={t('planning.saveWeek')} onPress={() => {
                  if (dispatch(saveWeek(target, draft))) setDraft(null);
                }} />
                <Button variant="secondary" title={t('planning.editAnswers')} onPress={() => setPreview(false)} />
              </>
            ) : (
              <>
                <Txt variant="heading">{t('planning.focusQuestion')}</Txt>
                <View style={styles.chips}>
                  {PILLARS.map((pillar) => (
                    <Chip key={pillar} label={PILLAR_LABELS[pillar]} selected={draft.pillar === pillar}
                      dotColor={colors.pillar[pillar]} onPress={() => setDraft({ ...draft, pillar })} />
                  ))}
                </View>
                <Txt variant="heading">{t('planning.minutesQuestion')}</Txt>
                <View style={styles.chips}>
                  {PLAN_MINUTES.map((minutes) => (
                    <Chip key={minutes} label={t('planning.minutes', { count: minutes })}
                      selected={draft.minutes === minutes} onPress={() => setDraft({ ...draft, minutes })} />
                  ))}
                </View>
                <Txt variant="heading">{t('planning.busyQuestion')}</Txt>
                <View style={styles.chips}>
                  {weekdays.map((day) => (
                    <Chip key={day} label={weekdayLabel(day)}
                      selected={draft.busyDays.includes(day)}
                      onPress={() => setDraft({ ...draft, busyDays: draft.busyDays.includes(day)
                        ? draft.busyDays.filter((d) => d !== day) : [...draft.busyDays, day].sort() })} />
                  ))}
                </View>
                <Button title={t('planning.previewWeek')} onPress={() => setPreview(true)} />
              </>
            )}
            <Button variant="ghost" title={t('common.cancel')} onPress={() => setDraft(null)} />
          </Screen>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  form: { paddingVertical: spacing.xl, gap: spacing.md },
});
