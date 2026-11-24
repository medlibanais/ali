// Party Quests hub: your parties, start a new one, or join with a code.

import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../components/Button';
import Card from '../components/Card';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import Screen from '../components/Screen';
import SegmentedControl from '../components/SegmentedControl';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { PillarGlyph } from '../components/icons';
import {
  DESCRIPTION_MAX,
  PARTY_SIZE_MAX,
  PARTY_SIZE_MIN,
  PARTY_XP,
  partyErrorText,
  partyInviteMessage,
  useCreateParty,
  useMyParties,
  type PartyDifficulty,
  type PartySummary,
} from '../features/party/api';
import type { AppStackParamList } from '../navigation/types';
import {
  borderWidth,
  colors,
  PILLAR_LABELS,
  PILLARS,
  radius,
  spacing,
  themed,
  type Pillar,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<AppStackParamList, 'PartyQuests'>;

const DIFFICULTIES: readonly { value: PartyDifficulty; label: string }[] = [
  { value: 'easy', label: `Easy · ${PARTY_XP.easy}` },
  { value: 'medium', label: `Medium · ${PARTY_XP.medium}` },
  { value: 'hard', label: `Hard · ${PARTY_XP.hard}` },
];

const STATUS_TEXT: Record<PartySummary['status'], string> = {
  open: 'Open',
  completed: 'Complete',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

function PartyRow({ party, onPress }: { party: PartySummary; onPress: () => void }) {
  const ratio = party.member_count === 0 ? 0 : party.done_count / party.member_count;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${party.description}, ${STATUS_TEXT[party.status]}, ${party.done_count} of ${party.member_count} done`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <PillarGlyph pillar={party.pillar} size={22} />
      <View style={styles.rowBody}>
        <Txt variant="bodySemi" numberOfLines={2}>
          {party.description}
        </Txt>
        <View style={styles.miniTrack}>
          <View
            style={[
              styles.miniFill,
              { width: `${ratio * 100}%`, backgroundColor: colors.pillar[party.pillar] },
            ]}
          />
        </View>
        <Txt variant="caption" color={colors.inkSoft}>
          {STATUS_TEXT[party.status]} · {party.done_count}/{party.member_count} done · {party.xp_reward} XP
        </Txt>
      </View>
    </Pressable>
  );
}

export function PartyQuestsScreen({ navigation }: Props) {
  useTheme();
  const toast = useToast();
  const parties = useMyParties();
  const create = useCreateParty();

  const [pillar, setPillar] = useState<Pillar>('health');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<PartyDifficulty>('medium');
  const [size, setSize] = useState(4);
  const [code, setCode] = useState('');

  const trimmed = description.trim();
  const canStart = trimmed.length >= 3 && trimmed.length <= DESCRIPTION_MAX;
  const startParty = async () => {
    if (!canStart) return;
    try {
      const state = await create.submit({
        pillar,
        description,
        difficulty,
        maxParticipants: size,
      });
      if (!state) return;
      setDescription('');
      navigation.navigate('PartyQuest', { id: state.id });
      // Offer the invite straight away; the screen also has a button.
      Share.share({ message: partyInviteMessage(state.invite_code, state.description) }).catch(
        () => undefined,
      );
    } catch (e) {
      toast.showToast({ message: partyErrorText(e) });
    }
  };

  return (
    <Screen scroll keyboardAvoiding>
      <Txt variant="title">Party quests</Txt>
      <Txt variant="body" color={colors.inkSoft} style={styles.lead}>
        Do one quest together with friends. When everyone has done their part, you all get the
        XP.
      </Txt>

      <Txt variant="heading" style={styles.section}>
        Your parties
      </Txt>
      {parties.isLoading ? (
        <Skeleton height={72} />
      ) : (parties.data ?? []).length === 0 ? (
        <EmptyState title="No parties yet" body="Start one below and invite your friends." />
      ) : (
        <Card padded={false}>
          {(parties.data ?? []).map((p) => (
            <PartyRow
              key={p.id}
              party={p}
              onPress={() => navigation.navigate('PartyQuest', { id: p.id })}
            />
          ))}
        </Card>
      )}

      <Txt variant="heading" style={styles.section}>
        Start a party
      </Txt>
      <Card>
        <Txt variant="label">Pillar</Txt>
        <View style={styles.chips}>
          {PILLARS.map((p) => (
            <Chip
              key={p}
              label={PILLAR_LABELS[p]}
              selected={pillar === p}
              onPress={() => setPillar(p)}
              dotColor={colors.pillar[p]}
            />
          ))}
        </View>

        <Txt variant="label" style={styles.fieldLabel}>
          The quest
        </Txt>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          editable={!create.isPending}
          onChangeText={(text) => {
            create.startNewDraftAfterSuccess();
            setDescription(text.slice(0, DESCRIPTION_MAX));
          }}
          placeholder="Walk 5 km after work"
          placeholderTextColor={colors.inkFaint}
          multiline
          maxLength={DESCRIPTION_MAX}
          accessibilityLabel="Party quest description"
        />
        <Txt variant="caption" color={colors.inkFaint} align="right">
          {trimmed.length}/{DESCRIPTION_MAX}
        </Txt>

        <Txt variant="label" style={styles.fieldLabel}>
          Difficulty · XP each
        </Txt>
        <SegmentedControl options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />

        <Txt variant="label" style={styles.fieldLabel}>
          Party size
        </Txt>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => setSize((s) => Math.max(PARTY_SIZE_MIN, s - 1))}
            disabled={size <= PARTY_SIZE_MIN}
            accessibilityRole="button"
            accessibilityLabel="Fewer people"
            style={styles.stepButton}
          >
            <Txt variant="heading">−</Txt>
          </Pressable>
          <Txt variant="bodySemi" accessibilityLiveRegion="polite">
            Up to {size} people
          </Txt>
          <Pressable
            onPress={() => setSize((s) => Math.min(PARTY_SIZE_MAX, s + 1))}
            disabled={size >= PARTY_SIZE_MAX}
            accessibilityRole="button"
            accessibilityLabel="More people"
            style={styles.stepButton}
          >
            <Txt variant="heading">+</Txt>
          </Pressable>
        </View>

        <Button
          title="Start party and invite"
          onPress={startParty}
          disabled={!canStart}
          loading={create.isPending}
          style={styles.startButton}
        />
        <Txt variant="caption" color={colors.inkFaint}>
          Only your friends can join with the link. The party lasts 24 hours.
        </Txt>
      </Card>

      <Txt variant="heading" style={styles.section}>
        Have a party code?
      </Txt>
      <View style={styles.codeRow}>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="A1B2C3D4E5"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Party code"
        />
        <Button
          title="Open"
          onPress={() => navigation.navigate('PartyInvite', { code: code.trim() })}
          disabled={code.trim().length < 6}
        />
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    lead: { marginTop: spacing.xs },
    section: { marginTop: spacing.xl, marginBottom: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      minHeight: 64,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.line,
    },
    pressed: { opacity: 0.7 },
    rowBody: { flex: 1, gap: spacing.xs },
    miniTrack: {
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.line,
      overflow: 'hidden',
    },
    miniFill: { height: '100%', borderRadius: radius.pill },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    fieldLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
    input: {
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      minHeight: 48,
      color: colors.ink,
      fontSize: 16,
    },
    multiline: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stepButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
    },
    startButton: { marginTop: spacing.xl, marginBottom: spacing.sm },
    codeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    codeInput: { flex: 1, minWidth: 0 },
  }),
);

export default PartyQuestsScreen;
