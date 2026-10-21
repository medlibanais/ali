import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Chip from '../components/Chip';
import ProfileAvatar from '../components/ProfileAvatar';
import EmptyState from '../components/EmptyState';
import Screen from '../components/Screen';
import Skeleton from '../components/Skeleton';
import Txt from '../components/Txt';
import { SendGlyph } from '../components/icons';
import type { ChatMessage } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  chatErrorCleared,
  DAILY_MESSAGE_LIMIT,
  fetchChatHistory,
  isPendingMessage,
  MESSAGE_MAX_LENGTH,
  remainingMessages,
  sendChatMessage,
  setMessageFeedback,
} from '../store/slices/chatSlice';
import { borderWidth, colors, fonts, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const DEFAULT_QUICK_REPLIES = [
  'Am I on track?',
  'Motivate me',
  'What should I do next?',
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
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
      style={({ pressed }) => [
        styles.thumbButton,
        active && styles.thumbActive,
        pressed && styles.pressed,
      ]}
    >
      <Txt
        variant="caption"
        color={active ? colors.accent : colors.inkFaint}
        style={styles.thumbText}
      >
        {direction === 'up' ? '👍' : '👎'}
      </Txt>
    </Pressable>
  );
}

function MessageBubble({
  message,
  coachProfile,
  onFeedback,
  onRegenerate,
  canRegenerate,
}: {
  message: ChatMessage;
  coachProfile: Parameters<typeof ProfileAvatar>[0]['profile'];
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
      {!isUser ? (
        <View style={styles.coachAvatarWrap}>
          <ProfileAvatar profile={coachProfile} size={28} animated={false} />
        </View>
      ) : null}
      <View style={styles.bubbleColumn}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.coachBubble,
          ]}
        >
          <Txt variant="body" style={styles.bubbleText}>
            {message.content}
          </Txt>
        </View>
        <View
          style={[styles.metaRow, isUser ? styles.metaRowUser : null]}
        >
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
  const chat = useAppSelector((state) => state.chat);
  const profile = useAppSelector((state) => state.user.profile);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    dispatch(fetchChatHistory());
  }, [dispatch]);

  const remaining = remainingMessages(chat);
  const canSend = draft.trim().length > 0 && !chat.sending && remaining > 0;

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

  return (
    <Screen padded={false} keyboardAvoiding>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <ProfileAvatar profile={profile} size={40} animated={false} />
          <View style={styles.headerText}>
            <Txt variant="heading">Future Self</Txt>
            <Txt variant="caption" color={colors.inkFaint}>
              {chat.rateLimitedMessage
                ? 'Resting until midnight'
                : `${remaining} of ${DAILY_MESSAGE_LIMIT} messages left today`}
            </Txt>
          </View>
        </View>
        {chat.contextUsed ? (
          <View style={styles.contextChip}>
            <Txt variant="caption" color={colors.inkSoft}>
              {`Coach can see: Level ${chat.contextUsed.user_level ?? '-'}, score ${chat.contextUsed.daily_score ?? '-'}%, streak ${chat.contextUsed.streak ?? '-'} days`}
            </Txt>
          </View>
        ) : (
          <View style={styles.contextChip}>
            <Txt variant="caption" color={colors.inkFaint}>
              Your coach loads your level, score, and streak with each reply.
            </Txt>
          </View>
        )}
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
              coachProfile={profile}
              onFeedback={(id, feedback) =>
                dispatch(setMessageFeedback({ messageId: id, feedback }))
              }
              onRegenerate={regenerate}
              canRegenerate={item.id === lastAssistantId && Boolean(lastUserMessage)}
            />
          )}
          inverted
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyFlip}>
              <EmptyState
                title="No messages yet"
                body="Ask your future self a question about today's quests, your streak, or the week ahead."
              />
            </View>
          }
          ListHeaderComponent={chat.sending ? <TypingBubble /> : null}
        />
      )}

      {chat.rateLimitedMessage ? (
        <View style={styles.limitBanner}>
          <Txt variant="caption" color={colors.danger}>
            {chat.rateLimitedMessage}
          </Txt>
        </View>
      ) : null}
      {chat.error ? (
        <View style={[styles.limitBanner, styles.errorBanner]}>
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
              <Txt variant="caption" color={colors.accent}>
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
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask your future self"
              placeholderTextColor={colors.inkFaint}
              maxLength={MESSAGE_MAX_LENGTH}
              multiline
              editable={remaining > 0}
              accessibilityLabel="Message your future self"
            />
            <Txt
              variant="caption"
              color={colors.inkFaint}
              style={styles.counter}
            >
              {`${draft.length}/${MESSAGE_MAX_LENGTH}`}
            </Txt>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
            onPress={() => send()}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && styles.sendDisabled,
              pressed && canSend && styles.pressed,
            ]}
          >
            <SendGlyph size={20} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.line,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  contextChip: {
    marginTop: spacing.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.paperAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingVertical: spacing.lg,
    flexGrow: 1,
  },
  emptyFlip: {
    transform: [{ scaleY: -1 }],
    flex: 1,
    justifyContent: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  coachRow: {
    justifyContent: 'flex-start',
  },
  coachAvatarWrap: {
    marginRight: spacing.sm,
    alignSelf: 'flex-end',
  },
  bubbleColumn: {
    maxWidth: '78%',
  },
  bubble: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  userBubble: {
    backgroundColor: colors.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.line,
  },
  coachBubble: {
    backgroundColor: colors.paperAlt,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  metaRowUser: {
    justifyContent: 'flex-end',
  },
  metaTime: {
    fontSize: 11,
    marginRight: spacing.sm,
  },
  thumbButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  thumbActive: {
    opacity: 1,
  },
  thumbText: {
    fontSize: 13,
  },
  regenerateButton: {
    minHeight: 44,
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
    paddingHorizontal: 24,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  limitBanner: {
    paddingHorizontal: 24,
    paddingVertical: spacing.sm,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.line,
  },
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: 24,
    paddingTop: spacing.sm,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: spacing.md,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
  inputWrap: {
    flex: 1,
    borderWidth: borderWidth.hairline,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginRight: spacing.sm,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    maxHeight: 110,
    minHeight: 36,
  },
  counter: {
    alignSelf: 'flex-end',
    paddingBottom: spacing.xs,
    fontSize: 11,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.96,
  },
  }),
);

export default CoachScreen;
