// Avatar editor: a big live preview on top, a sheet below with one icon
// tab per part of the avatar and a grid of choices, each drawn on the
// avatar itself so you see the result before you tap it.

import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AvatarView from '../avatar/AvatarView';
import {
  categoryFor,
  EDITOR_GROUPS,
  optionLocked,
  randomAvatarConfig,
  VALID_OPTION_IDS,
  type Category,
  type EditorGroup,
  type OptionItem,
} from '../avatar/options';
import { bgStyle } from '../avatar/palettes';
import { sanitizeAvatarConfig, type AvatarConfig } from '../avatar/types';
import {
  BackdropGlyph,
  BeardGlyph,
  BodyToggleGlyph,
  CheckGlyph,
  CloseGlyph,
  DiceGlyph,
  EyeGlyph,
  FaceGlyph,
  GlassesGlyph,
  HairGlyph,
  LipsGlyph,
  LockGlyph,
  PantsGlyph,
  PersonGlyph,
  RedoGlyph,
  ShirtGlyph,
  ShoeGlyph,
  UndoGlyph,
  type IconProps,
} from '../components/icons';
import { PressableScale } from '../components/Motion';
import Txt from '../components/Txt';
import { useToast } from '../components/Toast';
import type {
  AppStackParamList,
  OnboardingStackParamList,
} from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { onboardingCompletedLocally } from '../store/slices/authSlice';
import { saveAvatarConfig } from '../store/slices/userSlice';
import { colors, fonts, mix, radius, softShadow, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<
  AppStackParamList & OnboardingStackParamList,
  'AvatarCreator'
>;

const GROUP_ICONS: Record<string, (props: IconProps) => React.ReactElement> = {
  face: FaceGlyph,
  hair: HairGlyph,
  eyes: EyeGlyph,
  mouth: LipsGlyph,
  beard: BeardGlyph,
  extras: GlassesGlyph,
  outfit: ShirtGlyph,
  bottoms: PantsGlyph,
  shoes: ShoeGlyph,
  body: PersonGlyph,
  bg: BackdropGlyph,
};

const GAP = 10;
const SIDE = 16;
const TOP_BAR = 64;

export function AvatarCreatorScreen({ navigation, route }: Props) {
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { width: winW, height: winH } = useWindowDimensions();
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const existing = useAppSelector((state) => state.user.profile?.avatar_config);
  const level = useAppSelector((state) => state.gamification.level);

  const initial = useMemo<AvatarConfig>(
    () => sanitizeAvatarConfig(existing, VALID_OPTION_IDS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [config, setConfig] = useState<AvatarConfig>(initial);
  const [groupKey, setGroupKey] = useState<string>(EDITOR_GROUPS[0].key);
  const [view, setView] = useState<'head' | 'full-body'>(EDITOR_GROUPS[0].view);
  const [saving, setSaving] = useState(false);
  const undoStack = useRef<AvatarConfig[]>([]);
  const redoStack = useRef<AvatarConfig[]>([]);
  const [, setHistoryVersion] = useState(0);

  const group: EditorGroup = EDITOR_GROUPS.find((g) => g.key === groupKey) ?? EDITOR_GROUPS[0];

  const commit = (next: AvatarConfig) => {
    undoStack.current.push(config);
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
    setConfig(next);
  };

  const applyOption = (category: Category, option: OptionItem) => {
    if (optionLocked(option, level)) {
      toast.showToast({
        message: `${option.label} unlocks at level ${option.minLevel}. Keep going.`,
      });
      return;
    }
    if (config[category.key] === option.id) return;
    commit({ ...config, [category.key]: option.id });
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

  const selectGroup = (next: EditorGroup) => {
    setGroupKey(next.key);
    setView(next.view);
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

  // Layout: the preview takes a bit under half the screen.
  const contentW = Math.min(winW, 720);
  const previewH = Math.max(260, Math.min(winH * 0.44, 420));
  const shapeCell = Math.floor((contentW - SIDE * 2 - GAP * 3) / 4);
  const colorCell = Math.floor((contentW - SIDE * 2 - GAP * 5) / 6);
  const bg = bgStyle(config.bg);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  // Room for the figure: below the top bar, above the sheet's rounded edge.
  const stageH = previewH - TOP_BAR - radius.lg;
  const headSize = Math.min(stageH * 0.92, contentW * 0.7);

  return (
    <View style={styles.root}>
      <View style={[styles.preview, { height: previewH }]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
          <Defs>
            <LinearGradient id={`editorBg${config.bg}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={mix(bg.from, '#FFFFFF', 0.25)} />
              <Stop offset="1" stopColor={bg.to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={10} height={10} fill={`url(#editorBg${config.bg})`} />
        </Svg>
        <SafeAreaView edges={['top']} style={styles.previewInner}>
          <View style={styles.topBar}>
            {navigation.canGoBack() ? (
              <RoundButton label="Close without saving" onPress={() => navigation.goBack()}>
                <CloseGlyph />
              </RoundButton>
            ) : (
              <View style={styles.roundButtonSpacer} />
            )}
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={fromOnboarding ? 'Save and continue' : 'Save avatar'}
              onPress={save}
              disabled={saving}
              style={[styles.savePill, saving && styles.dim]}
            >
              <Txt variant="bodySemi" color={colors.onAccent}>
                {saving ? 'Saving…' : fromOnboarding ? 'Continue' : 'Save'}
              </Txt>
            </PressableScale>
          </View>
          <View style={styles.stage} pointerEvents="none">
            {view === 'full-body' ? (
              <AvatarView config={config} size={stageH} mood="happy" mode="full-body" bare animated={false} />
            ) : (
              <View style={styles.bust}>
                <AvatarView config={config} size={headSize} mood="happy" mode="head" bare animated={false} />
              </View>
            )}
          </View>
          <View style={styles.bottomBar}>
            <View style={styles.row}>
              <RoundButton label="Undo" onPress={undo} disabled={!canUndo}>
                <UndoGlyph color={canUndo ? colors.ink : colors.inkFaint} />
              </RoundButton>
              <RoundButton label="Redo" onPress={redo} disabled={!canRedo}>
                <RedoGlyph color={canRedo ? colors.ink : colors.inkFaint} />
              </RoundButton>
            </View>
            <View style={styles.row}>
              <RoundButton label="Surprise me" onPress={() => commit(randomAvatarConfig(level))}>
                <DiceGlyph />
              </RoundButton>
              <RoundButton
                label={view === 'head' ? 'Show full body' : 'Show close-up'}
                onPress={() => setView(view === 'head' ? 'full-body' : 'head')}
                selected={view === 'full-body'}
              >
                <BodyToggleGlyph color={view === 'full-body' ? colors.onAccent : colors.ink} />
              </RoundButton>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.sheet}>
        <Txt variant="label" color={colors.inkSoft} style={styles.sheetTitle}>
          {`Avatar · ${group.label}`}
        </Txt>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          style={styles.tabsBar}
        >
          {EDITOR_GROUPS.map((g) => {
            const Icon = GROUP_ICONS[g.key];
            const selected = g.key === group.key;
            return (
              <Pressable
                key={g.key}
                accessibilityRole="tab"
                accessibilityLabel={g.label}
                accessibilityState={{ selected }}
                onPress={() => selectGroup(g)}
                style={styles.tab}
              >
                <Icon size={24} color={selected ? colors.accent : colors.inkSoft} />
                <View style={[styles.tabBar, selected && styles.tabBarOn]} />
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          key={group.key}
          style={styles.flex}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {group.categories.map((key) => {
            const category = categoryFor(key);
            const color = category.kind === 'color';
            return (
              <View key={key} style={styles.section}>
                {group.categories.length > 1 ? (
                  <Txt variant="label" style={styles.sectionTitle}>
                    {category.label}
                  </Txt>
                ) : null}
                <View style={styles.cells}>
                  {category.options.map((option) => {
                    const selected = config[category.key] === option.id;
                    const locked = optionLocked(option, level);
                    const a11y = `${category.label}: ${option.label}${locked ? `, unlocks at level ${option.minLevel}` : ''}`;
                    if (color) {
                      return (
                        <Pressable
                          key={option.id}
                          accessibilityRole="button"
                          accessibilityLabel={a11y}
                          accessibilityState={{ selected, disabled: locked }}
                          onPress={() => applyOption(category, option)}
                          style={[
                            styles.swatchRing,
                            { width: colorCell, height: colorCell, borderRadius: colorCell / 2 },
                            selected && styles.swatchRingOn,
                            locked && styles.dim,
                          ]}
                        >
                          <View
                            style={[
                              styles.swatch,
                              {
                                width: colorCell - 10,
                                height: colorCell - 10,
                                borderRadius: (colorCell - 10) / 2,
                                backgroundColor: option.swatch,
                              },
                            ]}
                          />
                        </Pressable>
                      );
                    }
                    const body = group.view === 'full-body';
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="button"
                        accessibilityLabel={a11y}
                        accessibilityState={{ selected, disabled: locked }}
                        onPress={() => applyOption(category, option)}
                        style={({ pressed }) => [
                          styles.cell,
                          { width: shapeCell, height: body ? shapeCell * 1.3 : shapeCell },
                          selected && styles.cellOn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.thumb, locked && styles.dim]} pointerEvents="none">
                          <AvatarView
                            config={{ ...config, [category.key]: option.id }}
                            size={body ? shapeCell * 1.22 : shapeCell - 4}
                            mood="neutral"
                            mode={body ? 'full-body' : 'head'}
                            bare
                            animated={false}
                          />
                        </View>
                        <Txt variant="caption" color={colors.inkSoft} numberOfLines={1} style={styles.cellLabel}>
                          {option.label}
                        </Txt>
                        {selected ? (
                          <View style={styles.badge}>
                            <CheckGlyph size={11} />
                          </View>
                        ) : null}
                        {locked ? (
                          <View style={[styles.badge, styles.lockBadge]}>
                            <LockGlyph size={12} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function RoundButton({
  label,
  onPress,
  disabled = false,
  selected = false,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.92}
      hitSlop={4}
      style={[styles.roundButton, selected && styles.roundButtonOn]}
    >
      {children}
    </PressableScale>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.paper,
    },
    flex: {
      flex: 1,
    },
    preview: {
      overflow: 'hidden',
    },
    previewInner: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SIDE,
      paddingTop: spacing.sm,
      zIndex: 2,
    },
    stage: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: radius.lg,
    },
    bust: {
      // The close-up crop ends at the shoulders, right on the sheet's edge.
      marginBottom: -1,
    },
    bottomBar: {
      position: 'absolute',
      left: SIDE,
      right: SIDE,
      bottom: radius.lg + spacing.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    roundButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: mix(colors.card, colors.paper, 0.1),
      ...softShadow(1),
    },
    roundButtonOn: {
      backgroundColor: colors.accent,
    },
    roundButtonSpacer: {
      width: 44,
      height: 44,
    },
    savePill: {
      minHeight: 44,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      ...softShadow(2),
    },
    sheet: {
      flex: 1,
      marginTop: -radius.lg,
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.lg,
      ...softShadow(3),
    },
    sheetTitle: {
      paddingHorizontal: SIDE + 4,
      fontFamily: fonts.bodySemi,
    },
    tabsBar: {
      flexGrow: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    tabs: {
      paddingHorizontal: SIDE - 6,
      paddingTop: spacing.sm,
    },
    tab: {
      width: 52,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBar: {
      position: 'absolute',
      bottom: 0,
      width: 26,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'transparent',
    },
    tabBarOn: {
      backgroundColor: colors.accent,
    },
    grid: {
      paddingHorizontal: SIDE,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.ink,
    },
    cells: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GAP,
    },
    cell: {
      borderRadius: radius.sm,
      backgroundColor: mix(colors.paperAlt, colors.card, 0.35),
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    cellOn: {
      borderColor: colors.accent,
      backgroundColor: mix(colors.accent, colors.card, 0.88),
    },
    thumb: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    cellLabel: {
      fontSize: 10,
      lineHeight: 13,
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginBottom: 2,
      borderRadius: radius.xs,
      overflow: 'hidden',
      backgroundColor: mix(colors.card, colors.paper, 0.2),
      maxWidth: '94%',
    },
    badge: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lockBadge: {
      backgroundColor: colors.card,
      left: 5,
      right: undefined,
    },
    swatchRing: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    swatchRingOn: {
      borderColor: colors.accent,
    },
    swatch: {
      borderWidth: 1,
      borderColor: colors.line,
    },
    dim: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.9,
    },
  }),
);

export default AvatarCreatorScreen;
