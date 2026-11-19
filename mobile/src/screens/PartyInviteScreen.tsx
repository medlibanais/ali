// Opened by prayerlock://party?code=XXXX (or a typed code): shows the
// party and lets a friend of the host join it.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { PillarGlyph } from '../components/icons';
import {
  partyErrorText,
  previewReasonText,
  useJoinParty,
  usePartyPreview,
} from '../features/party/api';
import type { AppStackParamList } from '../navigation/types';
import { colors, PILLAR_LABELS, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AppStackParamList, 'PartyInvite'>;

export function PartyInviteScreen({ navigation, route }: Props) {
  useTheme();
  const toast = useToast();
  const code = (route.params?.code ?? '').trim().toUpperCase();
  const preview = usePartyPreview(code);
  const join = useJoinParty();

  const doJoin = async () => {
    try {
      const state = await join.mutateAsync(code);
      navigation.replace('PartyQuest', { id: state.id });
    } catch (e) {
      toast.showToast({ message: partyErrorText(e) });
    }
  };

  if (code.length < 6) {
    return (
      <Screen>
        <Txt variant="heading">This invite link is incomplete.</Txt>
      </Screen>
    );
  }
  if (preview.isLoading) {
    return (
      <Screen>
        <Skeleton height={180} />
      </Screen>
    );
  }

  const p = preview.data;
  if (!p || !p.found) {
    return (
      <Screen>
        <Card>
          <Txt variant="heading">This invite is not valid for you.</Txt>
          <Txt variant="body" color={colors.inkSoft} style={styles.gapSm}>
            Party quests are for friends of the host. Ask them to add you on the Friends screen
            first.
          </Txt>
        </Card>
        <Button
          title="Open Friends"
          variant="secondary"
          onPress={() => navigation.navigate('Friends')}
          style={styles.gap}
        />
      </Screen>
    );
  }

  const blocked = previewReasonText(p.reason);
  return (
    <Screen>
      <Card>
        <View style={styles.head}>
          <PillarGlyph pillar={p.pillar} size={28} />
          <Txt variant="label">{PILLAR_LABELS[p.pillar]} party</Txt>
        </View>
        <Txt variant="heading" style={styles.gapSm}>
          {p.description}
        </Txt>
        <Txt variant="body" color={colors.inkSoft} style={styles.gapSm}>
          {p.creator_name ?? 'A friend'} invited you · {p.member_count}/{p.max_participants} in ·{' '}
          {p.xp_reward} XP each when everyone is done
        </Txt>
      </Card>
      {p.reason === 'already_member' ? (
        <Button
          title="Open party"
          onPress={() => navigation.replace('PartyQuest', { id: p.party_id })}
          style={styles.gap}
        />
      ) : blocked ? (
        <Txt variant="body" color={colors.danger} style={styles.gap}>
          {blocked}
        </Txt>
      ) : (
        <Button title="Join party" onPress={doJoin} loading={join.isPending} style={styles.gap} />
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    gap: { marginTop: spacing.lg },
    gapSm: { marginTop: spacing.sm },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  }),
);

export default PartyInviteScreen;
