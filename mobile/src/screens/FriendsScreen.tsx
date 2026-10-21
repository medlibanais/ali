import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
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
  useBlockUser,
  useFriendRequests,
  useFriends,
  useRedeemInvite,
  useRespondRequest,
  useSendRequest,
  useUnfriend,
  useUserSearch,
  type FriendRequest,
  type FriendRow,
  type UserSearchResult,
} from '../features/friends/api';
import { pluralize, streakLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAppSelector } from '../store/hooks';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Section = 'friends' | 'requests' | 'find';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'friends', label: 'Friends' },
  { key: 'requests', label: 'Requests' },
  { key: 'find', label: 'Find' },
];

function userToProfile(u: UserSearchResult | FriendRow) {
  return {
    photo_url: u.photo_url,
    avatar_mode: u.avatar_mode,
    avatar_config: u.avatar_config,
    first_name: u.first_name,
  };
}

export function FriendsScreen({ route }: { route?: { params?: { code?: string } } }) {
  useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const myProfile = useAppSelector((state) => state.user.profile);
  const [section, setSection] = useState<Section>('friends');
  const [query, setQuery] = useState('');
  const [inviteCode, setInviteCode] = useState(route?.params?.code ?? '');

  const friends = useFriends();
  const requests = useFriendRequests();
  const search = useUserSearch(query);
  const sendRequest = useSendRequest();
  const respond = useRespondRequest();
  const unfriend = useUnfriend();
  const block = useBlockUser();
  const redeem = useRedeemInvite();

  const incomingCount = (requests.data ?? []).filter(
    (r) => r.direction === 'incoming',
  ).length;

  // Realtime: new/updated requests refresh the inbox instantly.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      channel = supabase
        .channel(`friendships:${data.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `addressee=eq.${data.user.id}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['friends'] });
          },
        )
        .subscribe();
    });
    return () => {
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

  const leaderboard = useMemo(() => {
    const rows = [...(friends.data ?? [])];
    rows.sort((a, b) => b.weekly_xp - a.weekly_xp);
    return rows;
  }, [friends.data]);

  const shareInvite = async () => {
    const code = myProfile?.invite_code ?? '';
    const link = `prayerlock://add-friend?code=${code}`;
    try {
      await Share.share({
        message: `Become who you want to be with me on PrayerLock. Add me with my code ${code}: ${link}`,
      });
    } catch {
      toast.showToast({ message: 'Sharing is not available on this device.' });
    }
  };

  const redeemCode = async () => {
    const code = inviteCode.trim();
    if (code.length < 4) return;
    const result = await redeem.mutateAsync(code);
    if (result.redeemed) {
      toast.showToast({ message: 'You are connected. Welcome to your circle.' });
      setInviteCode('');
    } else {
      const reason =
        result.reason === 'own_code'
          ? 'That is your own code.'
          : result.reason === 'already_connected'
            ? 'You are already connected.'
            : 'That code is not valid.';
      toast.showToast({ message: reason });
    }
  };

  const confirmUnfriend = (friend: FriendRow) => {
    Alert.alert('Unfriend', `Remove ${friend.first_name ?? friend.username} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfriend',
        style: 'destructive',
        onPress: () => unfriend.mutate(friend.friendship_id),
      },
    ]);
  };

  const confirmBlock = (userId: string, name: string) => {
    Alert.alert('Block user', `Block ${name}? They will not find you in search.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => block.mutate(userId),
      },
    ]);
  };

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <Txt variant="title">Friends</Txt>
        <Txt variant="caption" color={colors.inkFaint}>
          Grow together. Your stats stay private unless you share them.
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
            <Button title="Invite friends" onPress={shareInvite} style={styles.inviteButton} />
            {friends.isLoading ? (
              <View>
                <Skeleton height={72} style={styles.skeletonBlock} />
                <Skeleton height={72} style={styles.skeletonBlock} />
              </View>
            ) : (friends.data ?? []).length === 0 ? (
              <EmptyState
                title="No friends yet"
                body="Invite people you trust, or find them by username in the Find tab."
              />
            ) : (
              <>
                <Card padded={false} style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <Txt variant="label">This week, by XP</Txt>
                  </View>
                  <Hairline />
                  {leaderboard.map((friend, index) => (
                    <View key={friend.id}>
                      {index > 0 ? <Hairline /> : null}
                      <View style={styles.row}>
                        <Txt variant="bodySemi" color={colors.gold} style={styles.rank}>
                          {`${index + 1}`}
                        </Txt>
                        <ProfileAvatar profile={userToProfile(friend)} size={44} animated={false} />
                        <View style={styles.rowBody}>
                          <Txt variant="bodySemi">
                            {friend.first_name ?? friend.username}
                          </Txt>
                          <Txt variant="caption" color={colors.inkFaint}>
                            {friend.stats_shared
                              ? `Level ${friend.level} · ${streakLabel(friend.current_streak)}`
                              : 'Stats private'}
                          </Txt>
                        </View>
                        <Txt variant="bodySemi" color={colors.accent}>
                          {`${friend.weekly_xp} XP`}
                        </Txt>
                      </View>
                    </View>
                  ))}
                </Card>

                <Card padded={false} style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <Txt variant="label">{`Your friends (${(friends.data ?? []).length})`}</Txt>
                  </View>
                  <Hairline />
                  {(friends.data ?? []).map((friend, index) => (
                    <View key={friend.id}>
                      {index > 0 ? <Hairline /> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Options for ${friend.first_name ?? friend.username}`}
                        onLongPress={() =>
                          Alert.alert(
                            friend.first_name ?? friend.username,
                            undefined,
                            [
                              { text: 'Close', style: 'cancel' },
                              {
                                text: 'Unfriend',
                                style: 'destructive',
                                onPress: () => confirmUnfriend(friend),
                              },
                              {
                                text: 'Block',
                                style: 'destructive',
                                onPress: () =>
                                  confirmBlock(
                                    friend.id,
                                    friend.first_name ?? friend.username,
                                  ),
                              },
                            ],
                          )
                        }
                        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                      >
                        <ProfileAvatar profile={userToProfile(friend)} size={44} animated={false} />
                        <View style={styles.rowBody}>
                          <Txt variant="bodySemi">
                            {friend.first_name ?? friend.username}
                          </Txt>
                          <Txt variant="caption" color={colors.inkFaint}>
                            {friend.stats_shared
                              ? `Level ${friend.level} · best ${pluralize(friend.best_streak, 'day')}`
                              : `@${friend.username}`}
                          </Txt>
                        </View>
                        <Txt variant="caption" color={colors.inkFaint}>
                          Long-press for options
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
              title="No pending requests"
              body="When someone adds you, their request lands here in real time."
            />
          ) : (
            (requests.data ?? []).map((request: FriendRequest) => (
              <Card key={request.friendship_id} style={styles.requestCard}>
                <View style={styles.row}>
                  <ProfileAvatar profile={userToProfile(request.user)} size={44} animated={false} />
                  <View style={styles.rowBody}>
                    <Txt variant="bodySemi">
                      {request.user.first_name ?? request.user.username}
                    </Txt>
                    <Txt variant="caption" color={colors.inkFaint}>
                      {request.direction === 'incoming'
                        ? `@${request.user.username} wants to connect`
                        : 'Waiting for them to answer'}
                    </Txt>
                  </View>
                </View>
                {request.direction === 'incoming' ? (
                  <View style={styles.requestActions}>
                    <Button
                      title="Accept"
                      onPress={() =>
                        respond.mutate(
                          { friendshipId: request.friendship_id, accept: true },
                          {
                            onError: (e) =>
                              toast.showToast({ message: errorText(e) }),
                          },
                        )
                      }
                      style={styles.acceptButton}
                    />
                    <Button
                      title="Decline"
                      variant="ghost"
                      onPress={() =>
                        respond.mutate({
                          friendshipId: request.friendship_id,
                          accept: false,
                        })
                      }
                      style={styles.declineButton}
                    />
                  </View>
                ) : (
                  <Button
                    title="Cancel request"
                    variant="ghost"
                    onPress={() => unfriend.mutate(request.friendship_id)}
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
                placeholder="Search by username"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search by username"
              />
            </View>
            {query.trim().length >= 2 ? (
              search.isLoading ? (
                <Skeleton height={64} style={styles.skeletonBlock} />
              ) : (search.data ?? []).length === 0 ? (
                <EmptyState
                  title="No one found"
                  body="Check the spelling, or invite them with your personal link."
                />
              ) : (
                <Card padded={false} style={styles.card}>
                  {(search.data ?? []).map((user, index) => (
                    <View key={user.id}>
                      {index > 0 ? <Hairline /> : null}
                      <View style={styles.row}>
                        <ProfileAvatar profile={userToProfile(user)} size={44} animated={false} />
                        <View style={styles.rowBody}>
                          <Txt variant="bodySemi">
                            {user.first_name ?? user.username}
                          </Txt>
                          <Txt variant="caption" color={colors.inkFaint}>
                            {`@${user.username}`}
                          </Txt>
                        </View>
                        <Button
                          title={sendRequest.isPending ? 'Sending' : 'Add'}
                          variant="secondary"
                          onPress={() =>
                            sendRequest.mutate(user.id, {
                              onSuccess: () =>
                                toast.showToast({ message: 'Request sent.' }),
                              onError: (e) =>
                                toast.showToast({ message: errorText(e) }),
                            })
                          }
                          style={styles.addButton}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              )
            ) : null}

            <Card style={styles.card}>
              <Txt variant="label" style={styles.haveCodeLabel}>
                Have an invite code?
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
                  accessibilityLabel="Invite code"
                />
                <Button
                  title="Connect"
                  onPress={redeemCode}
                  loading={redeem.isPending}
                  style={styles.codeButton}
                />
              </View>
            </Card>

            <Button
              title="Share my invite link"
              variant="secondary"
              onPress={shareInvite}
              style={styles.shareButton}
            />
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
