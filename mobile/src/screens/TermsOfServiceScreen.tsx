import React from 'react';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface Section {
  heading: string;
  paragraphs: string[];
}

const SECTIONS: Section[] = [
  {
    get heading() {
      return i18n.t('termsOfService.n1AcceptanceOfThese');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.theseTermsOfService'),
        i18n.t('termsOfService.byCreatingAnAccount'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n2YourAccount');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.youAreResponsibleFor'),
        i18n.t('termsOfService.youMayDeleteYour'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n3TheService');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.growProvidesDailyQuests'),
        i18n.t('termsOfService.theAiCoachIs'),
        i18n.t('termsOfService.spiritualContentInThe'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n4AcceptableUse');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.youAgreeNotTo'),
        i18n.t('termsOfService.selfiesYouUploadMust'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n5GeneratedContent');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.yourFutureSelfPortrait'),
        i18n.t('termsOfService.weReviewAndConstrain'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n6AvailabilityAndChanges');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.weAimForHigh'),
        i18n.t('termsOfService.questDataScoresAnd'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n7DisclaimersAndLiability');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.theServiceIsProvided'),
        i18n.t('termsOfService.toTheMaximumExtent'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n8Termination');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.weMaySuspendOr'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('termsOfService.n9Contact');
    },
    get paragraphs() {
      return [
        i18n.t('termsOfService.questionsAboutTheseTerms'),
        i18n.t('termsOfService.effectiveDateSeptember1'),
        ];
    },
  },
];

export function TermsOfServiceScreen() {
  const { t } = useTranslation();
  useTheme();
  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        {t('termsOfService.termsOfService')}
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.updated}>
        {t('termsOfService.growPrayerAndHabits')}
      </Txt>
      {SECTIONS.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Txt variant="heading" style={styles.heading}>
            {section.heading}
          </Txt>
          {section.paragraphs.map((paragraph, index) => (
            <Txt
              key={index}
              variant="body"
              color={colors.inkSoft}
              style={styles.paragraph}
            >
              {paragraph}
            </Txt>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.lg,
  },
  updated: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  heading: {
    marginBottom: spacing.sm,
  },
  paragraph: {
    marginBottom: spacing.sm,
  },
});

export default TermsOfServiceScreen;
