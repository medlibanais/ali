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
      return i18n.t('privacyPolicy.n1WhatWeCollect');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.accountDataYourEmail'),
        i18n.t('privacyPolicy.profileAndGoalsYour'),
        i18n.t('privacyPolicy.imagesTheOptionalSelfie'),
        i18n.t('privacyPolicy.activityDataYourQuests'),
        i18n.t('privacyPolicy.conversationDataTheMessages'),
        i18n.t('privacyPolicy.deviceDataAPush'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('privacyPolicy.n2HowTheAi');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.coachResponsesAreGenerated'),
        i18n.t('privacyPolicy.yourChatContentIs'),
        i18n.t('privacyPolicy.avatarGenerationSendsYour'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('privacyPolicy.n3WhatWeDo');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.weDoNotSell'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('privacyPolicy.n4StorageAndSecurity');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.dataIsEncryptedIn'),
        i18n.t('privacyPolicy.backupsRunDailyAnd'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('privacyPolicy.n5YourRights');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.exportYouCanRequest'),
        i18n.t('privacyPolicy.correctionMostProfileFields'),
        i18n.t('privacyPolicy.deletionYouCanDelete'),
        i18n.t('privacyPolicy.objectionAndRestrictionYou'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('privacyPolicy.n6Notifications');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.pushAndEmailNotifications'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('privacyPolicy.n7Children');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.theServiceIsNot'),
        ];
    },
  },
  {
    get heading() {
      return i18n.t('privacyPolicy.n8ChangesAndContact');
    },
    get paragraphs() {
      return [
        i18n.t('privacyPolicy.ifThisPolicyChanges'),
        i18n.t('privacyPolicy.privacyQuestionsAndRequests'),
        i18n.t('privacyPolicy.effectiveDateSeptember1'),
        ];
    },
  },
];

export function PrivacyPolicyScreen() {
  const { t } = useTranslation();
  useTheme();
  return (
    <Screen scroll>
      <Txt variant="title" style={styles.title}>
        {t('privacyPolicy.privacyPolicy')}
      </Txt>
      <Txt variant="caption" color={colors.inkFaint} style={styles.updated}>
        {t('privacyPolicy.growPrayerAndHabits')}
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

export default PrivacyPolicyScreen;
