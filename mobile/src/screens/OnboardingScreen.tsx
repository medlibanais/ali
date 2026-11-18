import React, { useMemo, useState } from 'react';
import { labelFor } from '../i18n';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Chip from '../components/Chip';
import Field from '../components/Field';
import Hairline from '../components/Hairline';
import Screen from '../components/Screen';
import SegmentedControl from '../components/SegmentedControl';
import Stepper from '../components/Stepper';
import Txt from '../components/Txt';
import type { OnboardingStackParamList } from '../navigation/types';
import { useAppDispatch } from '../store/hooks';
import {
  submitOnboarding,
  type OnboardingPayload,
} from '../store/slices/userSlice';
import {
  borderWidth,
  colors,
  radius,
  spacing,
  themed,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Onboarding'>;

type CallFrequency = 'weekly' | 'bi-weekly' | 'monthly';

interface Draft {
  firstName: string;
  username: string;
  workoutsPerWeek: number;
  sleepTargetHours: number;
  waterLitersPerDay: number;
  callFrequency: CallFrequency;
  qualityHours: number;
  familyGoals: string;
  deepWorkHours: number;
  careerGoal: string;
  currentRole: string;
  skill: string;
  hobbies: string[];
  weeklyFunHours: number;
  religion: string;
  prayerFrequency: string;
  spiritualPractice: string;
  dreamBody: string;
  dreamPersonality: string[];
}

const INITIAL_DRAFT: Draft = {
  firstName: '',
  username: '',
  workoutsPerWeek: 3,
  sleepTargetHours: 8,
  waterLitersPerDay: 2.5,
  callFrequency: 'weekly',
  qualityHours: 5,
  familyGoals: '',
  deepWorkHours: 20,
  careerGoal: '',
  currentRole: '',
  skill: '',
  hobbies: [],
  weeklyFunHours: 8,
  religion: '',
  prayerFrequency: '',
  spiritualPractice: '',
  dreamBody: '',
  dreamPersonality: [],
};

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const HOBBY_OPTIONS = [
  'sports',
  'gaming',
  'reading',
  'travel',
  'music',
  'cooking',
  'outdoors',
  'art',
];

const PERSONALITY_OPTIONS = [
  'confident',
  'disciplined',
  'kind',
  'calm',
  'focused',
  'generous',
  'brave',
  'patient',
];

const RELIGION_OPTIONS = [
  'Muslim',
  'Christian',
  'Jewish',
  'Hindu',
  'Buddhist',
  'Other',
  'None',
];

const ROLE_OPTIONS = [
  'Student',
  'Junior professional',
  'Mid-level professional',
  'Senior professional',
  'Manager',
  'Founder',
  'Other',
];

const STEP_TITLES = [
  'onboarding.welcome',
  'onboarding.health',
  'onboarding.family',
  'onboarding.work',
  'onboarding.fun',
  'onboarding.spirituality',
  'onboarding.identity',
] as const;

const SLEEP_TICKS: number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

function OptionSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.selectContainer}>
      <Txt variant="label" style={styles.selectLabel}>
        {label}
      </Txt>
      <View style={styles.selectBox}>
        {options.map((option, index) => {
          const selected = option === value;
          return (
            <View key={option}>
              {index > 0 ? <Hairline /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange(option)}
                style={({ pressed }) => [
                  styles.selectRow,
                  pressed && styles.pressed,
                ]}
              >
                <Txt
                  variant="body"
                  color={selected ? colors.accent : colors.ink}
                >
                  {labelFor('options', option)}
                </Txt>
                <View
                  style={[
                    styles.selectSquare,
                    selected && styles.selectSquareActive,
                  ]}
                />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function OnboardingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const totalSteps = STEP_TITLES.length;
  const progress = (step + 1) / totalSteps;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleInList = (key: 'hobbies' | 'dreamPersonality', item: string) => {
    setDraft((current) => {
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(item)
          ? list.filter((entry) => entry !== item)
          : [...list, item],
      };
    });
  };

  const [usernameError, setUsernameError] = useState<string | null>(null);

  const canContinue = useMemo(() => {
    switch (step) {
      case 6:
        return (
          draft.firstName.trim().length > 0 &&
          USERNAME_RE.test(draft.username.trim().toLowerCase())
        );
      default:
        return true;
    }
  }, [step, draft.firstName, draft.username]);

  const buildPayload = (): OnboardingPayload => ({
    username: draft.username.trim().toLowerCase(),
    first_name: draft.firstName.trim(),
    timezone: deviceTimezone(),
    goals: {
      workouts_per_week: draft.workoutsPerWeek,
      sleep_target_hours: draft.sleepTargetHours,
      water_liters_per_day: draft.waterLitersPerDay,
      call_parents_frequency: draft.callFrequency,
      quality_time_hours_per_week: draft.qualityHours,
      deep_work_hours_per_week: draft.deepWorkHours,
      career_goal: draft.careerGoal.trim(),
      skill_to_develop: draft.skill.trim(),
      hobbies: draft.hobbies,
      weekly_fun_hours: draft.weeklyFunHours,
      religion: draft.religion || null,
      prayer_frequency:
        draft.religion === 'Muslim'
          ? '5_daily'
          : draft.prayerFrequency.trim() || null,
      spiritual_practice: draft.spiritualPractice.trim() || null,
      dream_body: draft.dreamBody.trim(),
      dream_personality: draft.dreamPersonality,
    },
  });

  const goNext = async () => {
    if (step === 6) {
      if (draft.firstName.trim().length === 0) {
        setNameError(t('onboarding.tellUsYourFirst'));
        return;
      }
      if (!USERNAME_RE.test(draft.username.trim().toLowerCase())) {
        setUsernameError(
          t('onboarding.n320CharsLowercase'),
        );
        return;
      }
    }
    setNameError(null);
    setUsernameError(null);
    if (step < totalSteps - 1) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const result = await dispatch(submitOnboarding(buildPayload()));
    setSubmitting(false);
    if (submitOnboarding.fulfilled.match(result)) {
      // Next step: the Future Self avatar, generated from a photo (the
      // hand-built SVG creator is one tap away from there).
      navigation.navigate('AiAvatar', { fromOnboarding: true });
    } else {
      const message =
        result.payload ?? t('onboarding.couldNotSaveYour');
      if (message.toLowerCase().includes('username')) {
        setUsernameError(message);
      }
      setSubmitError(message);
    }
  };

  const goBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  return (
    <Screen scroll keyboardAvoiding padded={false}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.content}>
        <Txt variant="label" color={colors.inkFaint} style={styles.stepLabel}>
          {t('onboarding.stepOf', { step: step + 1, totalSteps })}
        </Txt>
        <Txt variant="title" style={styles.stepTitle}>
          {t(STEP_TITLES[step])}
        </Txt>

        {step === 0 ? (
          <View>
            <Txt variant="body" color={colors.inkSoft} style={styles.paragraph}>
              {t('onboarding.growBuildsAPicture')}
            </Txt>
            <Txt variant="body" color={colors.inkSoft} style={styles.paragraph}>
              {t('onboarding.theNextFewAnswers')}
            </Txt>
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.workoutsPerWeek')}
            </Txt>
            <Stepper
              value={draft.workoutsPerWeek}
              onChange={(v) => update('workoutsPerWeek', v)}
              min={0}
              max={7}
            />
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.sleepTargetHoursPer')}
            </Txt>
            <View style={styles.sliderRow}>
              {SLEEP_TICKS.map((tick) => {
                const selected = tick === draft.sleepTargetHours;
                return (
                  <Pressable
                    key={tick}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => update('sleepTargetHours', tick)}
                    style={styles.tickWrap}
                  >
                    <View
                      style={[styles.tick, selected && styles.tickSelected]}
                    />
                    <Txt
                      variant="caption"
                      color={selected ? colors.accent : colors.inkFaint}
                      style={styles.tickLabel}
                    >
                      {tick}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.waterPerDayLiters')}
            </Txt>
            <Stepper
              value={draft.waterLitersPerDay}
              onChange={(v) => update('waterLitersPerDay', v)}
              min={1}
              max={5}
              step={0.5}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.howOftenWillYou')}
            </Txt>
            <SegmentedControl<CallFrequency>
              options={[
                { value: 'weekly', label: t('onboarding.weekly') },
                { value: 'bi-weekly', label: t('onboarding.biWeekly') },
                { value: 'monthly', label: t('onboarding.monthly') },
              ]}
              value={draft.callFrequency}
              onChange={(v) => update('callFrequency', v)}
            />
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.qualityHoursWithLoved')}
            </Txt>
            <Stepper
              value={draft.qualityHours}
              onChange={(v) => update('qualityHours', v)}
              min={0}
              max={20}
            />
            <Field
              label={t('onboarding.familyGoals')}
              value={draft.familyGoals}
              onChangeText={(t) => update('familyGoals', t)}
              placeholder={t('onboarding.forExampleBePresent')}
              multiline
              containerStyle={styles.questionField}
            />
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.deepWorkHoursPer')}
            </Txt>
            <Stepper
              value={draft.deepWorkHours}
              onChange={(v) => update('deepWorkHours', v)}
              min={0}
              max={50}
              step={5}
            />
            <Field
              label={t('onboarding.careerGoal')}
              value={draft.careerGoal}
              onChangeText={(t) => update('careerGoal', t)}
              placeholder={t('onboarding.forExampleSeniorSoftware')}
              containerStyle={styles.questionField}
            />
            <OptionSelect
              label={t('onboarding.currentRole')}
              options={ROLE_OPTIONS}
              value={draft.currentRole}
              onChange={(v) => update('currentRole', v)}
            />
            <Field
              label={t('onboarding.skillToDevelop')}
              value={draft.skill}
              onChangeText={(t) => update('skill', t)}
              placeholder={t('onboarding.forExampleMachineLearning')}
              containerStyle={styles.questionField}
            />
          </View>
        ) : null}

        {step === 4 ? (
          <View>
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.hobbiesPickAllThat')}
            </Txt>
            <View style={styles.chipWrap}>
              {HOBBY_OPTIONS.map((hobby) => (
                <Chip
                  key={hobby}
                  label={labelFor('options', hobby)}
                  selected={draft.hobbies.includes(hobby)}
                  onPress={() => toggleInList('hobbies', hobby)}
                />
              ))}
            </View>
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.weeklyFunTimeHours')}
            </Txt>
            <Stepper
              value={draft.weeklyFunHours}
              onChange={(v) => update('weeklyFunHours', v)}
              min={2}
              max={20}
            />
          </View>
        ) : null}

        {step === 5 ? (
          <View>
            <OptionSelect
              label={t('onboarding.religionOrBelief')}
              options={RELIGION_OPTIONS}
              value={draft.religion}
              onChange={(v) => update('religion', v)}
            />
            {draft.religion === 'Muslim' ? (
              <View style={styles.questionField}>
                <Txt variant="label" style={styles.questionLabel}>
                  {t('onboarding.prayerFrequency')}
                </Txt>
                <View style={styles.lockedRow}>
                  <Txt variant="body">{t('onboarding.n5DailyPrayers')}</Txt>
                  <Txt variant="caption" color={colors.inkFaint}>
                    {t('onboarding.setFromYourTradition')}
                  </Txt>
                </View>
              </View>
            ) : (
              <Field
                label={t('onboarding.prayerOrPracticeFrequency')}
                value={draft.prayerFrequency}
                onChangeText={(t) => update('prayerFrequency', t)}
                placeholder={t('onboarding.forExampleOnceDaily')}
                containerStyle={styles.questionField}
              />
            )}
            <Field
              label={t('onboarding.spiritualPractice')}
              value={draft.spiritualPractice}
              onChangeText={(t) => update('spiritualPractice', t)}
              placeholder={t('onboarding.forExampleQuranReading')}
              containerStyle={styles.questionField}
            />
          </View>
        ) : null}

        {step === 6 ? (
          <View>
            <Field
              label={t('onboarding.firstName')}
              value={draft.firstName}
              onChangeText={(t) => {
                update('firstName', t);
                if (nameError) setNameError(null);
              }}
              error={nameError}
              placeholder={t('onboarding.yourFirstName')}
              autoCapitalize="words"
            />
            <Field
              label={t('onboarding.username')}
              value={draft.username}
              onChangeText={(t) => {
                update('username', t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                if (usernameError) setUsernameError(null);
              }}
              error={usernameError}
              placeholder={t('onboarding.eGMohamedDev')}
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.questionField}
            />
            <Txt variant="caption" color={colors.inkFaint} style={styles.usernameNote}>
              {t('onboarding.friendsFindYouWith')}
            </Txt>
            <Field
              label={t('onboarding.dreamBody')}
              value={draft.dreamBody}
              onChangeText={(t) => update('dreamBody', t)}
              placeholder={t('onboarding.forExampleLeanAnd')}
              containerStyle={styles.questionField}
            />
            <Txt variant="label" style={styles.questionLabel}>
              {t('onboarding.dreamPersonalityPickAll')}
            </Txt>
            <View style={styles.chipWrap}>
              {PERSONALITY_OPTIONS.map((trait) => (
                <Chip
                  key={trait}
                  label={labelFor('options', trait)}
                  selected={draft.dreamPersonality.includes(trait)}
                  onPress={() => toggleInList('dreamPersonality', trait)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {submitError ? (
          <Txt variant="caption" color={colors.danger} style={styles.error}>
            {submitError}
          </Txt>
        ) : null}

        <View style={styles.footer}>
          {step > 0 ? (
            <Button
              title={t('onboarding.back')}
              variant="ghost"
              onPress={goBack}
              style={styles.backButton}
            />
          ) : null}
          <Button
            title={step === totalSteps - 1 ? t('onboarding.startMyJourney') : t('onboarding.continue')}
            onPress={goNext}
            disabled={!canContinue}
            loading={submitting}
            style={styles.continueButton}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  progressTrack: {
    height: 2,
    backgroundColor: colors.line,
  },
  progressFill: {
    height: 2,
    backgroundColor: colors.accent,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: spacing.xxl,
  },
  stepLabel: {
    marginTop: spacing.xl,
    textTransform: 'uppercase',
  },
  stepTitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  paragraph: {
    marginBottom: spacing.lg,
  },
  questionLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  questionField: {
    marginTop: spacing.xl,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tickWrap: {
    alignItems: 'center',
    minWidth: 32,
  },
  tick: {
    width: 10,
    height: 10,
    borderWidth: borderWidth.hairline,
    borderColor: colors.inkFaint,
    borderRadius: radius.xs,
    backgroundColor: colors.card,
  },
  tickSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tickLabel: {
    marginTop: spacing.xs,
    fontSize: 11,
  },
  selectContainer: {
    marginTop: spacing.xl,
  },
  selectLabel: {
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  selectBox: {
    borderWidth: borderWidth.hairline,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  selectSquare: {
    width: 10,
    height: 10,
    borderWidth: borderWidth.hairline,
    borderColor: colors.inkFaint,
    borderRadius: radius.xs,
  },
  selectSquareActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  lockedRow: {
    borderWidth: borderWidth.hairline,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.paperAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  usernameNote: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.96,
  },
  error: {
    marginTop: spacing.lg,
  },
  footer: {
    marginTop: spacing.xxl,
  },
  backButton: {
    marginBottom: spacing.sm,
  },
  continueButton: {},
  }),
);

export default OnboardingScreen;
