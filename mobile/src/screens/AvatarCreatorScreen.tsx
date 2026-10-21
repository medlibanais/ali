import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AvatarView from '../avatar/AvatarView';
import {
  CATEGORIES,
  optionLocked,
  randomAvatarConfig,
  type Category,
  type OptionItem,
} from '../avatar/options';
import { DEFAULT_AVATAR, sanitizeAvatarConfig, type AvatarConfig } from '../avatar/types';
import { VALID_OPTION_IDS } from '../avatar/options';
import Button from '../components/Button';
import Chip from '../components/Chip';
import Screen from '../components/Screen';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import type {
  AppStackParamList,
  OnboardingStackParamList,
} from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { onboardingCompletedLocally } from '../store/slices/authSlice';
import { saveAvatarConfig } from '../store/slices/userSlice';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

// Choices that only show below the shoulders. Picking one of these
// categories switches the preview to full body so the change is visible.
const BODY_KEYS: ReadonlySet<keyof AvatarConfig> = new Set<keyof AvatarConfig>([
  'bodyBuild',
  'height',
  'pose',
  'pantsColor',
  'shoes',
  'shoesColor',
]);

type Props = NativeStackScreenProps<
  AppStackParamList & OnboardingStackParamList,
  'AvatarCreator'
>;

export function AvatarCreatorScreen({ navigation, route }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const existing = useAppSelector((state) => state.user.profile?.avatar_config);
  const level = useAppSelector((state) => state.gamification.level);

  const initial = useMemo<AvatarConfig>(
    () => sanitizeAvatarConfig(existing, VALID_OPTION_IDS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [config, setConfig] = useState<AvatarConfig>(initial);
  const [categoryKey, setCategoryKey] = useState<keyof AvatarConfig>('face');
  const [previewMode, setPreviewMode] = useState<'head' | 'full-body'>('head');
  const [saving, setSaving] = useState(false);
  const undoStack = useRef<AvatarConfig[]>([]);
  const redoStack = useRef<AvatarConfig[]>([]);
  const [, setHistoryVersion] = useState(0);

  const category: Category =
    CATEGORIES.find((c) => c.key === categoryKey) ?? CATEGORIES[0];

  const applyOption = (option: OptionItem) => {
    if (optionLocked(option, level)) {
      toast.showToast({
        message: `${option.label} unlocks at level ${option.minLevel}. Keep going.`,
      });
      return;
    }
    undoStack.current.push(config);
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
    setConfig({ ...config, [category.key]: option.id });
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(config);
    setHistoryVersion((v) => v + 1);
    setConfig(prev);
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(config);
    setHistoryVersion((v) => v + 1);
    setConfig(next);
  };

  const randomize = () => {
    undoStack.current.push(config);
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
    setConfig(randomAvatarConfig(level));
  };

  const save = async () => {
    setSaving(true);
    const result = await dispatch(
      saveAvatarConfig(config as unknown as Record<string, unknown>),
    );
    setSaving(false);
    if (saveAvatarConfig.fulfilled.match(result)) {
      if (fromOnboarding) {
        dispatch(onboardingCompletedLocally());
      } else {
        toast.showToast({ message: 'Your avatar is saved.' });
        navigation.goBack();
      }
    } else {
      toast.showToast({
        message: result.payload ?? 'Could not save your avatar.',
      });
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.previewWrap}>
        <AvatarView
          config={config}
          size={previewMode === 'full-body' ? 250 : 190}
          mood="happy"
          animated={false}
          mode={previewMode}
        />
        <View style={styles.previewToggle}>
          <Chip
            label="Head"
            selected={previewMode === 'head'}
            onPress={() => setPreviewMode('head')}
          />
          <Chip
            label="Full body"
            selected={previewMode === 'full-body'}
            onPress={() => setPreviewMode('full-body')}
          />
        </View>
        <View style={styles.previewActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Randomize avatar"
            onPress={randomize}
            style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
          >
            <Txt variant="bodySemi" color={colors.accent}>
              Randomize
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            accessibilityState={{ disabled: undoStack.current.length === 0 }}
            onPress={undo}
            disabled={undoStack.current.length === 0}
            style={({ pressed }) => [
              styles.toolButton,
              undoStack.current.length === 0 && styles.toolDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Txt variant="bodySemi" color={colors.inkSoft}>
              Undo
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Redo"
            accessibilityState={{ disabled: redoStack.current.length === 0 }}
            onPress={redo}
            disabled={redoStack.current.length === 0}
            style={({ pressed }) => [
              styles.toolButton,
              redoStack.current.length === 0 && styles.toolDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Txt variant="bodySemi" color={colors.inkSoft}>
              Redo
            </Txt>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected={c.key === categoryKey}
              onPress={() => {
                setCategoryKey(c.key);
                if (BODY_KEYS.has(c.key)) setPreviewMode('full-body');
              }}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={category.options}
        // FlatList only re-renders rows when data or extraData change; the
        // rows depend on the current config (thumbnails, selected state).
        extraData={{ config, level }}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionsContent}
        style={styles.optionsList}
        renderItem={({ item }) => {
          const selected = config[category.key] === item.id;
          const locked = optionLocked(item, level);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.label}${locked ? `, unlocks at level ${item.minLevel}` : ''}`}
              accessibilityState={{ selected, disabled: locked }}
              onPress={() => applyOption(item)}
              style={({ pressed }) => [
                styles.optionCell,
                selected && styles.optionSelected,
                locked && styles.optionLocked,
                pressed && styles.pressed,
              ]}
            >
              {category.kind === 'color' ? (
                <View
                  style={[styles.swatch, { backgroundColor: item.swatch }]}
                />
              ) : (
                <View style={styles.miniPreview}>
                  <AvatarView
                    config={{ ...config, [category.key]: item.id }}
                    size={56}
                    mood="neutral"
                    animated={false}
                    mode={BODY_KEYS.has(category.key) ? 'full-body' : 'head'}
                  />
                </View>
              )}
              <Txt
                variant="caption"
                color={selected ? colors.accent : colors.inkSoft}
                align="center"
                style={styles.optionLabel}
              >
                {locked ? `🔒 ${item.label}` : item.label}
              </Txt>
            </Pressable>
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          title={fromOnboarding ? 'Meet my future self' : 'Save avatar'}
          onPress={save}
          loading={saving}
        />
        {!fromOnboarding ? (
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => navigation.goBack()}
            style={styles.cancelButton}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    previewWrap: {
      alignItems: 'center',
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.line,
    },
    previewActions: {
      flexDirection: 'row',
      marginTop: spacing.lg,
    },
    previewToggle: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    toolButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    toolDisabled: {
      opacity: 0.4,
    },
    tabsBar: {
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.line,
    },
    tabsContent: {
      paddingHorizontal: 24,
      paddingVertical: spacing.md,
      gap: spacing.sm,
      flexDirection: 'row',
    },
    optionsList: {
      flexGrow: 0,
      marginTop: spacing.md,
    },
    optionsContent: {
      paddingHorizontal: 24,
      gap: spacing.sm,
    },
    optionCell: {
      width: 76,
      alignItems: 'center',
      padding: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: borderWidth.hairline,
      borderColor: 'transparent',
      minHeight: 96,
    },
    optionSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.paperAlt,
    },
    optionLocked: {
      opacity: 0.45,
    },
    swatch: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
    },
    miniPreview: {
      width: 56,
      height: 56,
      borderRadius: 28,
      overflow: 'hidden',
    },
    optionLabel: {
      marginTop: spacing.xs,
      fontSize: 11,
    },
    footer: {
      padding: 24,
    },
    cancelButton: {
      marginTop: spacing.sm,
    },
    pressed: {
      opacity: 0.96,
    },
  }),
);

export default AvatarCreatorScreen;
