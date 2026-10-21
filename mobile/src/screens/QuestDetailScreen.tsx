import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Card from '../components/Card';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { PillarGlyph } from '../components/icons';
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
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
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
        message: `+${xp} XP. ${quest.title} is done.`,
        actionLabel: 'Undo',
        countdownSeconds: 10,
        durationMs: 10000,
        onAction: () => {
          dispatch(undoQuest(questId));
        },
      });
      navigation.goBack();
    } else {
      toast.showToast({
        message: result.payload?.message ?? 'Could not complete this quest.',
      });
    }
  };

  const skip = async () => {
    if (skipsLeft <= 0) {
      toast.showToast({
        message: 'You have used all 3 skips for today.',
      });
      return;
    }
    const result = await dispatch(skipQuest(quest.quest_id));
    if (skipQuest.fulfilled.match(result)) {
      toast.showToast({
        message: `${quest.title} skipped. It returns in a future set.`,
      });
      navigation.goBack();
    } else {
      toast.showToast({
        message:
          (result.payload as string | undefined) ??
          'Could not skip this quest.',
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
          <MetaRow label="Reward" value={`${quest.xp_reward} XP`} />
        </View>
        <Hairline />
        <View style={styles.metaCell}>
          <MetaRow
            label="Time"
            value={
              quest.time_estimate_minutes
                ? `About ${quest.time_estimate_minutes} minutes`
                : 'Fits in a spare moment'
            }
          />
        </View>
        <Hairline />
        <View style={styles.metaCell}>
          <MetaRow
            label="Source"
            value={quest.is_ai_generated ? 'Coach pick' : 'Daily practice'}
          />
        </View>
      </Card>

      {quest.why_this_matters ? (
        <View style={styles.whySection}>
          <Txt variant="label" style={styles.whyLabel}>
            Why it matters
          </Txt>
          <Txt variant="body" color={colors.inkSoft}>
            {quest.why_this_matters}
          </Txt>
        </View>
      ) : null}

      <View style={styles.actions}>
        {quest.completed ? (
          <Txt variant="body" color={colors.accent} align="center">
            Completed. Well done.
          </Txt>
        ) : (
          <>
            <Button
              title="Mark complete"
              onPress={markComplete}
              loading={busy}
            />
            <Button
              title="Skip this quest"
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
                ? `You have ${skipsLeft} of ${DAILY_SKIP_LIMIT} skips left today. Skipped quests return tomorrow with no penalty.`
                : 'No skips left today. Skips reset at midnight.'}
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
    marginLeft: spacing.sm,
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
