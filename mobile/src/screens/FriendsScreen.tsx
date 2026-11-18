import React, { useEffect, useMemo, useState } from 'react';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Hairline from '../components/Hairline';
import ProfileAvatar from '../components/ProfileAvatar';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import {
  friendErrorText as errorText,
  inviteResultText,
  useBlockedUsers,
  useBlockUser,
  useCircle,
  useFriendRequests,
  useRedeemInvite,
  useRespondRequest,
  useSendRequest,
  useUnblockUser,
  useUnfriend,
  useUserSearch,
  type FriendRequest,
  type FriendRow,
  type SearchHit,
  type UserSearchResult,
} from '../features/friends/api';
import { displayName, friendsOnly, inviteMessage, rankLeaderboard } from '../features/friends/logic';
import { pluralize, streakLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAppSelector } from '../store/hooks';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Section = 'friends' | 'requests' | 'find';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'friends', get label() { return i18n.t('friends.friends'); } },
  { key: 'requests', get label() { return i18n.t('friends.requests'); } },
  { key: 'find', get label() { return i18n.t('friends.find'); } },
];

function userToProfile(u: UserSearchResult) {
  return {
    photo_url: u.photo_url,
    avatar_mode: u.avatar_mode,
    avatar_config: u.avatar_config,
    first_name: u.first_name,
  };
}

const SEARCH_ACTION: Record<SearchHit['relation'], string> = {
  get none() {
    return i18n.t('friends.add');
  },
  get incoming() {
    return i18n.t('friends.accept');
  },
  get outgoing() {
    return i18n.t('friends.requested');
  },
  get friends() {
    return i18n.t('friends.friends');
  },
};

export function FriendsScreen({ route }: { route?: { params?: { code?: string } } }) {
  const { t } = useTranslation();
  useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const myProfile = useAppSelector((state) => state.user.profile);
  const [section, setSection] = useState<Section>('friends');
  const [query, setQuery] = useState('');
  const [inviteCode, setInviteCode] = useState(route?.params?.code ?? '');

  const circle = useCircle();
  const requests = useFriendRequests();
  const search = useUserSearch(query);
  const blocked = useBlockedUsers(section === 'find');
  const sendRequest = useSendRequest();
  const respond = useRespondRequest();
  const unfriend = useUnfriend();
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const redeem = useRedeemInvite();

  const friends = useMemo(() => friendsOnly(circle.data ?? []), [circle.data]);
  const leaderboard = useMemo(() => rankLeaderboard(circle.data ?? []), [circle.data]);
  const privateCount = friends.filter((f) => !f.stats_shared).length;

  const incomingCount = (requests.data ?? []).filter(
    (r) => r.direction === 'incoming',
  ).length;

  // Realtime: requests to you and answers to your requests refresh
  // the lists instantly.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || cancelled) return;
      const refresh = () => queryClient.invalidateQueries({ queryKey: ['friends'] });
      channel = supabase
        .channel(`friendships:${data.user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friendships', filter: `addressee=eq.${data.user.id}` },
          refresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friendships', filter: `requester=eq.${data.user.id}` },
          refresh,
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Deep-link invite code arrives prefilled.
  useEffect(() => {
    if (route?.params?.code) {
      setSection('find');
      setInviteCode(route.params.code);
    }
  }, [route?.params?.code]);

  const shareInvite = async () => {
    const code = myProfile?.invite_code ?? '';
    try {
      await Share.share({ message: inviteMessage(code) });
    } catch {
      toast.showToast({ message: t('friends.sharingIsNotAvailable') });
    }
  };

  const redeemCode = async () => {
    const code = inviteCode.trim();
    if (code.length < 4) return;
    try {
      const result = await redeem.mutateAsync(code);
      if (result.redeemed) {
        toast.showToast({ message: t('friends.youAreConnectedWelcome') });
        setInviteCode('');
        setSection('friends');
      } else {
        toast.showToast({ message: inviteResultText(result.reason) });
      }
    } catch (e) {
      toast.showToast({ message: errorText(e) });
    }
  };

  const onError = (e: unknown) => toast.showToast({ message: errorText(e) });

  const confirmUnfriend = (friend: FriendRow) => {
    Alert.alert(t('friends.unfriend'), t('friends.removeFromYourFriends', { v1: displayName(friend) }), [
      { text: t('friends.cancel'), style: 'cancel' },
      {
        text: t('friends.unfriend'),
        style: 'destructive',
        onPress: () => unfriend.mutate(friend.friendship_id, { onError }),
      },
    ]);
  };

  const confirmBlock = (userId: string, name: string) => {
    Alert.alert(t('friends.blockUser'), t('friends.blockTheyWillNot', { name }), [
      { text: t('friends.cancel'), style: 'cancel' },
      {
        text: t('friends.block'),
        style: 'destructive',
        onPress: () => block.mutate(userId, { onError }),
      },
    ]);
  };

  const friendOptions = (friend: FriendRow) =>
    Alert.alert(displayName(friend), `@${friend.username}`, [
      { text: t('friends.close'), style: 'cancel' },
      { text: t('friends.unfriend'), style: 'destructive', onPress: () => confirmUnfriend(friend) },
      {
        text: t('friends.block'),
        style: 'destructive',
        onPress: () => confirmBlock(friend.id, displayName(friend)),
      },
    ]);

  const answer = (request: FriendRequest, accept: boolean) =>
    respond.mutate(
      { friendshipId: request.friendship_id, accept },
      {
        onSuccess: () =>
          toast.showToast({
            message: accept
              ? t('friends.youAndAreNow', { v1: displayName(request.user) })
              : t('friends.requestDeclined'),
          }),
        onError,
      },
    );

  const onSearchAction = (user: SearchHit) => {
    if (user.relation !== 'none' && user.relation !== 'incoming') return;
    sendRequest.mutate(user.id, {
      onSuccess: (row) =>
        toast.showToast({
          message:
            row.status === 'accepted'
              ? t('friends.youAndAreNow', { v1: displayName(user) })
              : t('friends.requestSent'),
        }),
      onError,
    });
  };

  const isBusy = (id: string) =>
    (respond.isPending && respond.variables?.friendshipId === id) ||
    (unfriend.isPending && unfriend.variables === id);

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <Txt variant="title">{t('friends.friends')}</Txt>
        <Txt variant="caption" color={colors.inkFaint}>
          {t('friends.growTogetherYourStats')}
        </Txt>
      </View>

      <View style={styles.tabs}>
        {SECTIONS.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityState={{ selected: section === s.key }}
            onPress={() => setSection(s.key)}
            style={[styles.tab, section === s.key && styles.tabActive]}
          >
            <Txt
              variant="bodySemi"
              color={section === s.key ? colors.accent : colors.inkFaint}
            >
              {s.label}
              {s.key === 'requests' && incomingCount > 0
                ? ` (${incomingCount})`
                : ''}
            </Txt>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {section === 'friends' ? (
          <>
            <Button title={t('friends.inviteFriends')} onPress={shareInvite} style={styles.inviteButton} />
            {circle.isLoading ? (
              <View>
                <Skeleton height={72} style={styles.skeletonBlock} />
                <Skeleton height={72} style={styles.skeletonBlock} />
              </View>
            ) : circle.isError ? (
              <>
                <EmptyState
                  title={t('friends.couldNotLoadYour')}
                  body={t('friends.checkYourConnectionAnd')}
                />
                <Button
                  title={t('friends.tryAgain')}
                  variant="secondary"
                  onPress={() => circle.refetch()}
                  style={styles.inviteButton}
                />
              </>
            ) : friends.length === 0 ? (
              <EmptyState
                title={t('friends.noFriendsYet')}
                body={t('friends.invitePeopleYouTrust')}
              />
            ) : (
              <>
                <Card padded={false} style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <Txt variant="label">{t('friends.thisWeekByXp')}</Txt>
                  </View>
                  <Hairline />
                  {leaderboard.map((row, index) => (
                    <View key={row.id}>
                      {index > 0 ? <Hairline /> : null}
                      <View style={[styles.row, row.is_me && styles.meRow]}>
                        <Txt variant="bodySemi" color={colors.gold} style={styles.rank}>
                          {`${row.rank}`}
                        </Txt>
                        <ProfileAvatar profile={userToProfile(row)} size={44} animated={false} />
                        <View style={styles.rowBody}>
                          <Txt variant="bodySemi">
                            {row.is_me ? t('friends.you') : displayName(row)}
                          </Txt>
                          <Txt variant="caption" color={colors.inkFaint}>
                            {t('friends.level', { v1: row.level ?? 1, v2: streakLabel(row.current_streak ?? 0) })}
                          </Txt>
                        </View>
                        <Txt variant="bodySemi" color={colors.accent}>
                          {`${row.weekly_xp ?? 0} XP`}
                        </Txt>
                      </View>
                    </View>
                  ))}
                  {privateCount > 0 ? (
                    <>
                      <Hairline />
                      <View style={styles.sectionHeader}>
                        <Txt variant="caption" color={colors.inkFaint}>
                          {t('friends.keepStatsPrivate', { v1: pluralize(privateCount, 'friend'), v2: privateCount === 1 ? 's' : '' })}
                        </Txt>
                      </View>
                    </>
                  ) : null}
                </Card>

                <Card padded={false} style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <Txt variant="label">{t('friends.yourFriends', { length: friends.length })}</Txt>
                  </View>
                  <Hairline />
                  {friends.map((friend, index) => (
                    <View key={friend.id}>
                      {index > 0 ? <Hairline /> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('friends.optionsFor', { v1: displayName(friend) })}
                        onPress={() => friendOptions(friend)}
                        onLongPress={() => friendOptions(friend)}
                        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                      >
                        <ProfileAvatar profile={userToProfile(friend)} size={44} animated={false} />
                        <View style={styles.rowBody}>
                          <Txt variant="bodySemi">{displayName(friend)}</Txt>
                          <Txt variant="caption" color={colors.inkFaint}>
                            {friend.stats_shared
                              ? t('friends.levelBest', { v1: friend.level ?? 1, v2: pluralize(friend.best_streak ?? 0, 'day') })
                              : t('friends.statsPrivate', { username: friend.username })}
                          </Txt>
                        </View>
                        <Txt variant="bodySemi" color={colors.inkFaint}>
                          ···
                        </Txt>
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </>
            )}
          </>
        ) : null}

        {section === 'requests' ? (
          requests.isLoading ? (
            <Skeleton height={72} style={styles.skeletonBlock} />
          ) : (requests.data ?? []).length === 0 ? (
            <EmptyState
              title={t('friends.noPendingRequests')}
              body={t('friends.whenSomeoneAddsYou')}
            />
          ) : (
            (requests.data ?? []).map((request: FriendRequest) => (
              <Card key={request.friendship_id} style={styles.requestCard}>
                <View style={styles.row}>
                  <ProfileAvatar profile={userToProfile(request.user)} size={44} animated={false} />
                  <View style={styles.rowBody}>
                    <Txt variant="bodySemi">{displayName(request.user)}</Txt>
                    <Txt variant="caption" color={colors.inkFaint}>
                      {request.direction === 'incoming'
                        ? t('friends.wantsToConnect', { username: request.user.username })
                        : t('friends.waitingForThemTo')}
                    </Txt>
                  </View>
                </View>
                {request.direction === 'incoming' ? (
                  <View style={styles.requestActions}>
                    <Button
                      title={t('friends.accept')}
                      onPress={() => answer(request, true)}
                      disabled={isBusy(request.friendship_id)}
                      loading={isBusy(request.friendship_id) && respond.variables?.accept === true}
                      style={styles.acceptButton}
                    />
                    <Button
                      title={t('friends.decline')}
                      variant="ghost"
                      onPress={() => answer(request, false)}
                      disabled={isBusy(request.friendship_id)}
                      style={styles.declineButton}
                    />
                  </View>
                ) : (
                  <Button
                    title={t('friends.cancelRequest')}
                    variant="ghost"
                    onPress={() => unfriend.mutate(request.friendship_id, { onError })}
                    disabled={isBusy(request.friendship_id)}
                    style={styles.cancelRequest}
                  />
                )}
              </Card>
            ))
          )
        ) : null}

        {section === 'find' ? (
          <>
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder={t('friends.searchByUsername')}
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('friends.searchByUsername')}
              />
            </View>
            {query.trim().length >= 2 ? (
              search.isLoading ? (
                <Skeleton height={64} style={styles.skeletonBlock} />
              ) : (search.data ?? []).length === 0 ? (
                <EmptyState
                  title={t('friends.noOneFound')}
                  body={t('friends.checkTheSpellingOr')}
                />
              ) : (
                <Card padded={false} style={styles.card}>
                  {(search.data ?? []).map((user, index) => {
                    const sending = sendRequest.isPending && sendRequest.variables === user.id;
                    const actionable = user.relation === 'none' || user.relation === 'incoming';
                    return (
                      <View key={user.id}>
                        {index > 0 ? <Hairline /> : null}
                        <View style={styles.row}>
                          <ProfileAvatar profile={userToProfile(user)} size={44} animated={false} />
                          <View style={styles.rowBody}>
                            <Txt variant="bodySemi">{displayName(user)}</Txt>
                            <Txt variant="caption" color={colors.inkFaint}>
                              {`@${user.username}`}
                            </Txt>
                          </View>
                          <Button
                            title={SEARCH_ACTION[user.relation]}
                            variant={actionable ? 'secondary' : 'ghost'}
                            disabled={!actionable || sending}
                            loading={sending}
                            onPress={() => onSearchAction(user)}
                            style={styles.addButton}
                          />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              )
            ) : null}

            <Card style={styles.card}>
              <Txt variant="label" style={styles.haveCodeLabel}>
                {t('friends.haveAnInviteCode')}
              </Txt>
              <View style={styles.codeRow}>
                <TextInput
                  style={styles.codeInput}
                  value={inviteCode}
                  onChangeText={(t) => setInviteCode(t.toUpperCase())}
                  placeholder="ABC12345"
                  placeholderTextColor={colors.inkFaint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel={t('friends.inviteCode')}
                />
                <Button
                  title={t('friends.connect')}
                  onPress={redeemCode}
                  loading={redeem.isPending}
                  style={styles.codeButton}
                />
              </View>
            </Card>

            <Button
              title={t('friends.shareMyInviteLink')}
              variant="secondary"
              onPress={shareInvite}
              style={styles.shareButton}
            />

            {(blocked.data ?? []).length > 0 ? (
              <Card padded={false} style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Txt variant="label">{t('friends.blocked', { length: (blocked.data ?? []).length })}</Txt>
                </View>
                {(blocked.data ?? []).map((user) => (
                  <View key={user.id}>
                    <Hairline />
                    <View style={styles.row}>
                      <View style={styles.rowBodyFlat}>
                        <Txt variant="bodySemi">{displayName(user)}</Txt>
                        <Txt variant="caption" color={colors.inkFaint}>
                          {`@${user.username}`}
                        </Txt>
                      </View>
                      <Button
                        title={t('friends.unblock')}
                        variant="ghost"
                        loading={unblock.isPending && unblock.variables === user.id}
                        onPress={() => unblock.mutate(user.id, { onError })}
                        style={styles.addButton}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: {
      paddingHorizontal: 24,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.line,
      paddingHorizontal: 24,
    },
    tab: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      justifyContent: 'center',
    },
    tabActive: {
      borderBottomWidth: 2,
      borderBottomColor: colors.accent,
    },
    body: {
      padding: 24,
    },
    inviteButton: {
      marginBottom: spacing.lg,
    },
    card: {
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      padding: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.lg,
      minHeight: 64,
    },
    rank: {
      width: 24,
    },
    rowBody: {
      flex: 1,
      marginLeft: spacing.md,
    },
    rowBodyFlat: {
      flex: 1,
    },
    meRow: {
      backgroundColor: colors.paperAlt,
    },
    requestCard: {
      marginBottom: spacing.md,
    },
    requestActions: {
      flexDirection: 'row',
      marginTop: spacing.md,
    },
    acceptButton: {
      flex: 1,
      marginRight: spacing.sm,
    },
    declineButton: {
      flex: 1,
    },
    cancelRequest: {
      marginTop: spacing.md,
    },
    searchWrap: {
      marginBottom: spacing.lg,
    },
    search: {
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      minHeight: 48,
      color: colors.ink,
      fontSize: 15,
    },
    addButton: {
      minWidth: 72,
    },
    haveCodeLabel: {
      marginBottom: spacing.md,
      textTransform: 'uppercase',
    },
    codeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    codeInput: {
      flex: 1,
      minWidth: 0,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      minHeight: 48,
      color: colors.ink,
      fontSize: 16,
      letterSpacing: 2,
      marginRight: spacing.sm,
    },
    codeButton: {
      minWidth: 96,
    },
    shareButton: {
      marginBottom: spacing.xl,
    },
    skeletonBlock: {
      marginBottom: spacing.md,
    },
    pressed: {
      opacity: 0.96,
    },
  }),
);

export default FriendsScreen;
