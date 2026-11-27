// One party: shared realtime progress bar, members, "I did my part",
// emoji cheers that pop up on everyone's screen, invite and leave.

import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { CheckGlyph, PillarGlyph } from '../components/icons';
import {
  awardNoteText,
  memberName,
  PARTY_CHEERS,
  partyErrorText,
  partyInviteMessage,
  partyProgress,
  useCompletePart,
  useLeaveParty,
  useParty,
  useRefreshAfterPayout,
  useUndoPart,
  waitingText,
  type PartyMember,
} from '../features/party/api';
import CheerBurst from '../features/party/components/CheerBurst';
import PartyProgressBar from '../features/party/components/PartyProgressBar';
import { usePartyChannel } from '../features/party/usePartyChannel';
import type { AppStackParamList } from '../navigation/types';
import { useAppSelector } from '../store/hooks';
import {
  borderWidth,
  colors,
  PILLAR_LABELS,
  radius,
  spacing,
  themed,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AppStackParamList, 'PartyQuest'>;

function MemberRow({ member, isMe }: { member: PartyMember; isMe: boolean }) {
  const done = member.status === 'done';
  const note = awardNoteText(member.award_note);
  return (
    <View style={styles.member} accessible accessibilityLabel={`${memberName(member)}${isMe ? ' (you)' : ''}: ${done ? 'done' : 'not done yet'}`}>
      <View
        style={[
          styles.check,
          done ? { backgroundColor: colors.accent, borderColor: colors.accent } : null,
        ]}
      >
        {done ? <CheckGlyph size={14} /> : null}
      </View>
      <View style={styles.memberBody}>
        <Txt variant="bodySemi" numberOfLines={1}>
          {memberName(member)}
          {isMe ? ' (you)' : ''}
          {member.is_creator ? ' · host' : ''}
        </Txt>
        {member.xp_awarded !== null ? (
          <Txt variant="caption" color={colors.inkSoft}>
            +{member.xp_awarded} XP{note ? ` · ${note}` : ''}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

export function PartyQuestScreen({ navigation, route }: Props) {
  useTheme();
  const toast = useToast();
  const partyId = route.params.id;
  const myId = useAppSelector((state) => state.auth.userId);
  const party = useParty(partyId);
  const complete = useCompletePart();
  const undo = useUndoPart();
  const leave = useLeaveParty();
  const refreshAfterPayout = useRefreshAfterPayout();

  const state = party.data;
  const memberIds = useMemo(
    () => new Set((state?.members ?? []).map((m) => m.user_id)),
    [state?.members],
  );
  const onCompleted = useCallback(() => {
    refreshAfterPayout();
    toast.showToast({ message: 'Party complete! Everyone got the XP.' });
  }, [refreshAfterPayout, toast]);

  const channel = usePartyChannel({ partyId, myId, memberIds, onCompleted });

  useEffect(() => {
    if (state) navigation.setOptions({ title: PILLAR_LABELS[state.pillar] + ' party' });
  }, [navigation, state]);

  const nameOf = useCallback(
    (userId: string) => {
      if (userId === myId) return 'You';
      const m = state?.members.find((x) => x.user_id === userId);
      return m ? memberName(m) : 'Friend';
    },
    [myId, state?.members],
  );

  if (party.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={200} style={styles.gap} />
      </Screen>
    );
  }
  if (!state) {
    return (
      <Screen>
        <Txt variant="heading">This party is not available.</Txt>
        <Button title="Back" variant="secondary" onPress={() => navigation.goBack()} style={styles.gap} />
      </Screen>
    );
  }

  const me = state.members.find((m) => m.user_id === myId);
  const { done, total } = partyProgress(state.members);
  const open = state.status === 'open';
  const isHost = state.creator_id === myId;
  const pillarColor = colors.pillar[state.pillar];

  const doPart = async () => {
    try {
      const next = await complete.mutateAsync(state.id);
      if (next.status === 'completed') {
        const mine = next.members.find((m) => m.user_id === myId)?.xp_awarded ?? 0;
        toast.showToast({ message: `Party complete! +${mine} XP for you and everyone else.` });
      }
    } catch (e) {
      toast.showToast({ message: partyErrorText(e) });
    }
  };

  const undoPart = async () => {
    try {
      await undo.mutateAsync(state.id);
    } catch (e) {
      toast.showToast({ message: partyErrorText(e) });
    }
  };

  const leaveParty = async () => {
    try {
      await leave.mutateAsync(state.id);
      navigation.goBack();
    } catch (e) {
      toast.showToast({ message: partyErrorText(e) });
    }
  };

  const invite = () => {
    Share.share({ message: partyInviteMessage(state.invite_code, state.description) }).catch(
      () => undefined,
    );
  };

  return (
    <View style={styles.fill}>
      <Screen scroll>
        <Card>
          <View style={styles.head}>
            <View style={[styles.glyph, { backgroundColor: withAlpha(pillarColor, 0.16) }]}>
              <PillarGlyph pillar={state.pillar} size={26} />
            </View>
            <View style={styles.headBody}>
              <Txt variant="heading">{state.description}</Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                {PILLAR_LABELS[state.pillar]} · {state.xp_reward} XP each
              </Txt>
            </View>
          </View>
          <View style={styles.gap}>
            <PartyProgressBar
              done={done}
              total={total}
              color={pillarColor}
              complete={state.status === 'completed'}
            />
          </View>
          <Txt variant="body" color={colors.inkSoft} style={styles.gapSm}>
            {waitingText(state, myId)}
          </Txt>
          <Txt variant="caption" color={colors.inkFaint} style={styles.gapSm}>
            {channel.status === 'live'
              ? 'Live'
              : channel.status === 'connecting'
                ? 'Connecting…'
                : 'Not live right now. Reopen to reconnect.'}
          </Txt>
        </Card>

        {open && me ? (
          me.status === 'done' ? (
            <Button
              title="Not done yet? Undo my part"
              variant="ghost"
              onPress={undoPart}
              loading={undo.isPending}
              style={styles.gap}
            />
          ) : (
            <Button
              title="I did my part"
              onPress={doPart}
              loading={complete.isPending}
              style={styles.gap}
            />
          )
        ) : null}

        <Txt variant="label" style={styles.section}>
          Send a cheer
        </Txt>
        <View style={styles.cheers}>
          {PARTY_CHEERS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => channel.sendCheer(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`Send ${emoji === '🔥' ? 'fire' : 'flexed biceps'} cheer to the party`}
              style={({ pressed }) => [styles.cheerButton, pressed && styles.pressed]}
            >
              <Text style={styles.cheerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>

        <Txt variant="label" style={styles.section}>
          Members · {total}/{state.max_participants}
        </Txt>
        <Card padded={false}>
          {state.members.map((m) => (
            <MemberRow key={m.user_id} member={m} isMe={m.user_id === myId} />
          ))}
        </Card>

        {open ? (
          <View style={styles.actions}>
            {total < state.max_participants ? (
              <Button title="Invite friends" variant="secondary" onPress={invite} />
            ) : null}
            <Button
              title={isHost ? 'Cancel party' : 'Leave party'}
              variant="ghost"
              onPress={leaveParty}
              loading={leave.isPending}
            />
          </View>
        ) : null}
      </Screen>
      <CheerBurst cheers={channel.cheers} nameOf={nameOf} onDone={channel.removeCheer} />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    fill: { flex: 1 },
    gap: { marginTop: spacing.lg },
    gapSm: { marginTop: spacing.sm },
    section: { marginTop: spacing.xl, marginBottom: spacing.sm },
    head: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    headBody: { flex: 1, gap: spacing.xs },
    glyph: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    member: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      minHeight: 56,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.line,
    },
    memberBody: { flex: 1 },
    check: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cheers: { flexDirection: 'row', gap: spacing.md },
    cheerButton: {
      minWidth: 56,
      minHeight: 56,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
    },
    pressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
    cheerEmoji: { fontSize: 28 },
    actions: { marginTop: spacing.xl, gap: spacing.sm },
  }),
);

export default PartyQuestScreen;
