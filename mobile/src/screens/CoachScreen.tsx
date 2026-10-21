import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Backdrop } from '../components/Backdrop';
import Chip from '../components/Chip';
import ProfileAvatar from '../components/ProfileAvatar';
import EmptyState from '../components/EmptyState';
import { PressableScale } from '../components/Motion';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import { ArrowUpGlyph, ComposeGlyph } from '../components/icons';
import type { ChatMessage } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  chatErrorCleared,
  fetchChatHistory,
  isPendingMessage,
  MESSAGE_MAX_LENGTH,
  remainingMessages,
  sendChatMessage,
  setMessageFeedback,
  startNewChat,
} from '../store/slices/chatSlice';
import {
  colors,
  fonts,
  radius,
  softShadow,
  softSurface,
  spacing,
  themed,
  withAlpha,
} from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const DEFAULT_QUICK_REPLIES = [
  'Am I on track?',
  'Motivate me',
  'What should I do next?',
];

/** Shown in the subtitle once the daily allowance runs low. */
const LOW_REMAINING = 5;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Two soft color washes behind the chat, as in the Figma Coach frame. */
function CoachBackdrop() {
  const { height } = useWindowDimensions();
  return (
    <Backdrop
      height={height}
      blobs={[
        { x: 0.05, y: 130, r: 230, color: colors.accent, strength: 0.14 },
        { x: 0.98, y: height * 0.7, r: 240, color: colors.pillar.spirituality, strength: 0.14 },
      ]}
    />
  );
}

function TypingBubble() {
  return (
    <View style={[styles.bubbleRow, styles.coachRow]}>
      <View
        style={[styles.bubble, styles.coachBubble, styles.typingBubble]}
        accessibilityLabel="Coach is typing"
      >
        <Skeleton width={140} height={12} style={styles.typingLine} />
        <Skeleton width={110} height={12} style={styles.typingLine} />
        <Skeleton width={70} height={12} />
      </View>
    </View>
  );
}

function ThumbButton({
  direction,
  active,
  onPress,
}: {
  direction: 'up' | 'down';
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? 'Helpful response' : 'Not helpful'}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.thumbButton,
        !active && styles.thumbIdle,
        pressed && styles.pressed,
      ]}
    >
      <Txt variant="caption" style={styles.thumbText}>
        {direction === 'up' ? '👍' : '👎'}
      </Txt>
    </Pressable>
  );
}

function MessageBubble({
  message,
  onFeedback,
  onRegenerate,
  canRegenerate,
}: {
  message: ChatMessage;
  onFeedback: (messageId: string, feedback: -1 | 0 | 1) => void;
  onRegenerate: () => void;
  canRegenerate: boolean;
}) {
  const isUser = message.role === 'user';
  const pending = isPendingMessage(message);
  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.userRow : styles.coachRow,
        pending && styles.pendingRow,
      ]}
    >
      <View style={[styles.bubbleColumn, isUser && styles.userColumn]}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.coachBubble,
          ]}
        >
          <Txt
            variant="body"
            color={isUser ? colors.onAccent : colors.ink}
            style={styles.bubbleText}
          >
            {message.content}
          </Txt>
        </View>
        <View style={[styles.metaRow, isUser ? styles.metaRowUser : null]}>
          <Txt variant="caption" color={colors.inkFaint} style={styles.metaTime}>
            {formatTime(message.timestamp)}
          </Txt>
          {!isUser ? (
            <>
              <ThumbButton
                direction="up"
                active={message.feedback === 1}
                onPress={() =>
                  onFeedback(message.id, message.feedback === 1 ? 0 : 1)
                }
              />
              <ThumbButton
                direction="down"
                active={message.feedback === -1}
                onPress={() =>
                  onFeedback(message.id, message.feedback === -1 ? 0 : -1)
                }
              />
              {canRegenerate ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Regenerate response"
                  onPress={onRegenerate}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.regenerateButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Txt variant="caption" color={colors.accent}>
                    Regenerate
                  </Txt>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function HistorySkeleton() {
  return (
    <View style={styles.historySkeleton}>
      <Skeleton height={56} width="72%" style={styles.historyBlock} />
      <Skeleton height={40} width="58%" style={styles.historyBlockRight} />
      <Skeleton height={64} width="80%" style={styles.historyBlock} />
    </View>
  );
}

export function CoachScreen() {
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const chat = useAppSelector((state) => state.chat);
  const profile = useAppSelector((state) => state.user.profile);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    dispatch(fetchChatHistory());
  }, [dispatch]);

  const remaining = remainingMessages(chat);
  const canSend = draft.trim().length > 0 && !chat.sending && remaining > 0;
  const hasMessages = chat.messages.length > 0;
  const canStartNewChat =
    hasMessages && !chat.sending && !chat.startingNewChat && !chat.loadingHistory;

  const send = async (text?: string) => {
    const toSend = (text ?? draft).trim();
    if (!toSend || chat.sending || remaining <= 0) {
      return;
    }
    setDraft('');
    // On failure the slice keeps the text and the banner offers a retry.
    await dispatch(sendChatMessage(toSend));
  };

  const retry = () => {
    const text = chat.failedText;
    if (!text) return;
    dispatch(chatErrorCleared());
    send(text);
  };

  const newChat = async () => {
    if (!canStartNewChat) return;
    const result = await dispatch(startNewChat());
    if (startNewChat.fulfilled.match(result)) {
      setDraft('');
      toast.showToast({ message: 'New chat started. Your old one is saved.' });
    }
  };

  const quickReplies = chat.suggestions.length
    ? chat.suggestions
    : DEFAULT_QUICK_REPLIES;

  const lastUserMessage = [...chat.messages]
    .reverse()
    .find((m) => m.role === 'user' && !isPendingMessage(m));

  const regenerate = () => {
    if (lastUserMessage && !chat.sending && remaining > 0) {
      send(lastUserMessage.content);
    }
  };

  const lastAssistantId = [...chat.messages]
    .reverse()
    .find((m) => m.role === 'assistant')?.id;

  const orderedMessages = [...chat.messages].reverse();

  const subtitle = chat.rateLimitedMessage || remaining <= 0
    ? 'Resting until midnight'
    : remaining <= LOW_REMAINING
      ? `${remaining} ${remaining === 1 ? 'message' : 'messages'} left today`
      : 'Your coach · knows your 5 pillars';

  const context = chat.contextUsed;
  const contextLine = context
    ? `Level ${context.user_level ?? '-'} · ${context.daily_score ?? '-'}% today · ${context.streak ?? '-'}-day streak`
    : null;

  return (
    <Screen padded={false} keyboardAvoiding>
      <CoachBackdrop />
      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <ProfileAvatar profile={profile} size={52} animated={false} />
        </View>
        <View style={styles.headerText}>
          <Txt variant="title" style={styles.headerTitle} numberOfLines={1}>
            Future you
          </Txt>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                remaining <= 0 && styles.statusDotResting,
              ]}
            />
            <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
              {subtitle}
            </Txt>
          </View>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="New chat"
          accessibilityHint="Starts a fresh conversation. Your current chat stays saved."
          accessibilityState={{ disabled: !canStartNewChat }}
          disabled={!canStartNewChat}
          onPress={newChat}
          pressedScale={0.9}
          style={[styles.newChat, !canStartNewChat && styles.newChatDisabled]}
          testID="coach-new-chat"
        >
          <ComposeGlyph color={colors.accent} />
        </PressableScale>
      </View>

      {chat.loadingHistory ? (
        <HistorySkeleton />
      ) : (
        <FlatList
          ref={listRef}
          data={orderedMessages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onFeedback={(id, feedback) =>
                dispatch(setMessageFeedback({ messageId: id, feedback }))
              }
              onRegenerate={regenerate}
              canRegenerate={item.id === lastAssistantId && Boolean(lastUserMessage)}
            />
          )}
          inverted
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyFlip}>
              <EmptyState
                title={chat.conversationId ? 'Fresh page' : 'No messages yet'}
                body="Ask your future self about today's quests, your streak, or the week ahead."
              />
            </View>
          }
          // Inverted list: the footer renders at the top, above the oldest message.
          ListFooterComponent={
            hasMessages ? (
              <Txt
                variant="caption"
                color={colors.inkFaint}
                align="center"
                style={styles.dayLabel}
              >
                {contextLine ? `Today · ${contextLine}` : 'Today'}
              </Txt>
            ) : null
          }
          ListHeaderComponent={chat.sending ? <TypingBubble /> : null}
        />
      )}

      {chat.degradedReply && !chat.error ? (
        <View style={[styles.banner, styles.infoBanner]}>
          <Txt variant="caption" color={colors.inkSoft}>
            The AI could not be reached, so that reply came from your saved
            plan. Try again in a moment for a full answer.
          </Txt>
        </View>
      ) : null}
      {chat.rateLimitedMessage ? (
        <View style={[styles.banner, styles.errorBanner]}>
          <Txt variant="caption" color={colors.danger}>
            {chat.rateLimitedMessage}
          </Txt>
        </View>
      ) : null}
      {chat.error ? (
        <View
          style={[styles.banner, styles.errorBanner]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Txt variant="caption" color={colors.danger} style={styles.errorText}>
            {chat.error}
          </Txt>
          {chat.failedText ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry sending"
              onPress={retry}
              disabled={chat.sending}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Txt variant="bodySemi" color={colors.accent}>
                Retry
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {remaining > 0 ? (
          <View style={styles.quickReplies}>
            {quickReplies.map((reply) => (
              <Chip
                key={reply}
                label={reply}
                selected={false}
                onPress={() => send(reply)}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask your future self"
            placeholderTextColor={colors.inkFaint}
            maxLength={MESSAGE_MAX_LENGTH}
            multiline
            // Web renders a multiline input as a 2-row textarea by default.
            numberOfLines={1}
            editable={remaining > 0}
            accessibilityLabel="Message your future self"
          />
          {draft.length > MESSAGE_MAX_LENGTH - 100 ? (
            <Txt variant="caption" color={colors.inkFaint} style={styles.counter}>
              {`${draft.length}/${MESSAGE_MAX_LENGTH}`}
            </Txt>
          ) : null}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
            onPress={() => send()}
            disabled={!canSend}
            pressedScale={0.9}
            style={[styles.sendButton, !canSend && styles.sendDisabled]}
          >
            <ArrowUpGlyph size={20} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    headerAvatar: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      ...softSurface(1),
    },
    headerText: {
      marginLeft: spacing.md,
      flex: 1,
    },
    headerTitle: {
      fontSize: 24,
      lineHeight: 30,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
      backgroundColor: colors.accent,
    },
    statusDotResting: {
      backgroundColor: colors.inkFaint,
    },
    // Same round, soft button as the bell on Today.
    newChat: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.sm,
      ...softSurface(1),
    },
    newChatDisabled: {
      opacity: 0.45,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      flexGrow: 1,
    },
    emptyFlip: {
      transform: [{ scaleY: -1 }],
      flex: 1,
      justifyContent: 'center',
    },
    dayLabel: {
      marginBottom: spacing.md,
    },
    bubbleRow: {
      flexDirection: 'row',
      marginBottom: spacing.sm,
    },
    userRow: {
      justifyContent: 'flex-end',
    },
    coachRow: {
      justifyContent: 'flex-start',
    },
    bubbleColumn: {
      maxWidth: '80%',
    },
    userColumn: {
      alignItems: 'flex-end',
    },
    bubble: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.md - 2,
    },
    userBubble: {
      backgroundColor: colors.accent,
      borderBottomRightRadius: radius.xs,
    },
    coachBubble: {
      ...softSurface(1),
      borderBottomLeftRadius: radius.xs,
    },
    bubbleText: {
      fontSize: 15,
      lineHeight: 21,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      minHeight: 28,
    },
    metaRowUser: {
      justifyContent: 'flex-end',
    },
    metaTime: {
      fontSize: 11,
      marginRight: spacing.sm,
    },
    thumbButton: {
      minWidth: 30,
      minHeight: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbIdle: {
      opacity: 0.4,
    },
    thumbText: {
      fontSize: 13,
    },
    regenerateButton: {
      minHeight: 28,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    typingBubble: {
      width: 160,
    },
    typingLine: {
      marginBottom: spacing.xs,
    },
    historySkeleton: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      flex: 1,
    },
    historyBlock: {
      marginBottom: spacing.md,
    },
    historyBlockRight: {
      marginBottom: spacing.md,
      alignSelf: 'flex-end',
    },
    pendingRow: {
      opacity: 0.6,
    },
    banner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
    errorBanner: {
      backgroundColor: withAlpha(colors.danger, 0.08),
    },
    infoBanner: {
      backgroundColor: colors.paperAlt,
    },
    errorText: {
      flex: 1,
    },
    retryButton: {
      minHeight: 36,
      justifyContent: 'center',
      paddingLeft: spacing.md,
    },
    quickReplies: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: 6,
      paddingVertical: 6,
      borderRadius: radius.lg,
      ...softSurface(2),
    },
    input: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.ink,
      maxHeight: 110,
      minHeight: 44,
      paddingTop: 12,
      paddingBottom: 12,
    },
    counter: {
      alignSelf: 'center',
      fontSize: 11,
      marginHorizontal: spacing.xs,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      ...softShadow(1),
    },
    sendDisabled: {
      opacity: 0.45,
    },
    pressed: {
      opacity: 0.7,
    },
  }),
);

export default CoachScreen;
