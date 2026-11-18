import React from 'react';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Card from '../components/Card';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { CheckGlyph, PillarGlyph } from '../components/icons';
import type { AppStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  completeQuest,
  DAILY_SKIP_LIMIT,
  skipQuest,
  undoQuest,
} from '../store/slices/questsSlice';
import {
  colors,
  PILLAR_LABELS,
  radius,
  spacing,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AppStackParamList, 'QuestDetail'>;

const DIFFICULTY_LABELS: Record<string, string> = {
  get easy() {
    return i18n.t('questDetail.easy');
  },
  get medium() {
    return i18n.t('questDetail.medium');
  },
  get hard() {
    return i18n.t('questDetail.hard');
  },
};

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Txt variant="label">{label}</Txt>
      <Txt variant="body" color={colors.inkSoft}>
        {value}
      </Txt>
    </View>
  );
}

export function QuestDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const paramQuest = route.params.quest;
  const liveQuest = useAppSelector((state) =>
    state.quests.quests.find((q) => q.quest_id === paramQuest.quest_id),
  );
  const skipsUsed = useAppSelector((state) => state.quests.skipsUsed);
  const completingId = useAppSelector((state) => state.quests.completingId);

  const quest = liveQuest ?? paramQuest;
  const pillarColor = colors.pillar[quest.pillar];
  const skipsLeft = DAILY_SKIP_LIMIT - skipsUsed;
  const busy = completingId === quest.quest_id;

  const markComplete = async () => {
    const result = await dispatch(completeQuest(quest));
    if (completeQuest.fulfilled.match(result)) {
      const xp = result.payload.xp_awarded;
      const questId = result.payload.quest_id;
      toast.showToast({
        message: t('questDetail.xpIsDone', { xp, title: quest.title }),
        actionLabel: t('questDetail.undo'),
        countdownSeconds: 10,
        durationMs: 10000,
        onAction: () => {
          dispatch(undoQuest(questId));
        },
      });
      navigation.goBack();
    } else {
      toast.showToast({
        message: result.payload?.message ?? t('questDetail.couldNotCompleteThis'),
      });
    }
  };

  const skip = async () => {
    if (skipsLeft <= 0) {
      toast.showToast({
        message: t('questDetail.youHaveUsedAll'),
      });
      return;
    }
    const result = await dispatch(skipQuest(quest.quest_id));
    if (skipQuest.fulfilled.match(result)) {
      toast.showToast({
        message: t('questDetail.skippedItReturnsIn', { title: quest.title }),
      });
      navigation.goBack();
    } else {
      toast.showToast({
        message:
          (result.payload as string | undefined) ??
          t('questDetail.couldNotSkipThis'),
      });
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.pillarRow}>
          <PillarGlyph pillar={quest.pillar} size={22} />
          <Txt variant="label" style={styles.pillarLabel}>
            {PILLAR_LABELS[quest.pillar]}
          </Txt>
        </View>
        <Txt variant="title" style={styles.title}>
          {quest.title}
        </Txt>
        <View
          style={[
            styles.difficultyTag,
            { backgroundColor: withAlpha(pillarColor, 0.12) },
          ]}
        >
          <Txt variant="caption" color={pillarColor}>
            {DIFFICULTY_LABELS[quest.difficulty] ?? quest.difficulty}
          </Txt>
        </View>
      </View>

      {quest.description ? (
        <Txt variant="body" color={colors.inkSoft} style={styles.description}>
          {quest.description}
        </Txt>
      ) : null}

      <Card padded={false} style={styles.metaCard}>
        <View style={styles.metaCell}>
          <MetaRow label={t('questDetail.reward')} value={`${quest.xp_reward} XP`} />
        </View>
        <Hairline />
        <View style={styles.metaCell}>
          <MetaRow
            label={t('questDetail.time')}
            value={
              quest.time_estimate_minutes
                ? t('questDetail.aboutMinutes', { time_estimate_minutes: quest.time_estimate_minutes })
                : t('questDetail.fitsInASpare')
            }
          />
        </View>
        <Hairline />
        <View style={styles.metaCell}>
          <MetaRow
            label={t('questDetail.source')}
            value={quest.is_ai_generated ? t('questDetail.coachPick') : t('questDetail.dailyPractice')}
          />
        </View>
      </Card>

      {quest.why_this_matters ? (
        <View style={styles.whySection}>
          <Txt variant="label" style={styles.whyLabel}>
            {t('questDetail.whyItMatters')}
          </Txt>
          <Txt variant="body" color={colors.inkSoft}>
            {quest.why_this_matters}
          </Txt>
        </View>
      ) : null}

      <View style={styles.actions}>
        {quest.completed ? (
          <Txt variant="body" color={colors.accent} align="center">
            {t('questDetail.completedWellDone')}
          </Txt>
        ) : (
          <>
            <Button
              title={t('questDetail.markComplete')}
              winTitle={t('questDetail.claimXp', { xp_reward: quest.xp_reward })}
              icon={CheckGlyph}
              onPress={markComplete}
              loading={busy}
            />
            <Button
              title={t('questDetail.skipThisQuest')}
              variant="ghost"
              onPress={skip}
              disabled={skipsLeft <= 0}
              style={styles.skipButton}
            />
            <Txt
              variant="caption"
              color={colors.inkFaint}
              align="center"
              style={styles.skipNote}
            >
              {skipsLeft > 0
                ? t('questDetail.youHaveOfSkips', { skipsLeft, DAILY_SKIP_LIMIT })
                : t('questDetail.noSkipsLeftToday')}
            </Txt>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xl,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillarLabel: {
    marginStart: spacing.sm,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: spacing.md,
  },
  difficultyTag: {
    alignSelf: 'flex-start',
    borderRadius: radius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.md,
  },
  description: {
    marginTop: spacing.lg,
  },
  metaCard: {
    marginTop: spacing.xl,
  },
  metaCell: {
    padding: spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  whySection: {
    marginTop: spacing.xl,
  },
  whyLabel: {
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  actions: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  skipButton: {
    marginTop: spacing.sm,
  },
  skipNote: {
    marginTop: spacing.md,
  },
});

export default QuestDetailScreen;
