// Avatar editor, laid out like a game's character creator: a live 3D
// preview on a studio backdrop (drag to turn it, zoom from full body to
// a close-up), a row of pill tabs from Presets to Style, and below them
// picture grids to pick from. Basic edit shows presets and choices;
// Detailed edit adds every shape slider. A preset moves a group of
// sliders, and every slider stays free to fine-tune.
//
// It edits two avatars: Current You, the person you are today, and
// Future You, the person you are becoming. Both are saved together in
// profiles.avatar_config.

import React, { useMemo, useRef, useState } from 'react';
import i18n, { labelFor } from '../i18n';
import { useTranslation } from 'react-i18next';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Avatar3D from '../avatar/Avatar3D';
import {
  applyPreset,
  matchingPreset,
  sliderDef,
  sv,
  type Preset,
  type SliderId,
} from '../avatar/custom';
import {
  categoryFor,
  EDITOR_TABS,
  fitToSex,
  LOOKS,
  optionLocked,
  optionsFor,
  randomAvatarConfig,
  randomizeTab,
  resetTab,
  VALID_OPTION_IDS,
  type EditorSection,
  type EditorTab,
  type EditorView,
  type OptionItem,
} from '../avatar/options';
import { bgStyle, isHex } from '../avatar/palettes';
import { wornOutfit } from '../avatar/shape';
import {
  DEFAULT_AVATAR,
  MAX_LOOKS,
  readAvatarDoc,
  suggestFuture,
  writeAvatarDoc,
  type AvatarChoiceKey,
  type AvatarConfig,
  type SavedLook,
} from '../avatar/types';
import ColorPicker from '../components/ColorPicker';
import PhotorealSheet from '../components/PhotorealSheet';
import {
  BackdropGlyph,
  CameraGlyph,
  CloseGlyph,
  CompareGlyph,
  DiceGlyph,
  LockGlyph,
  RedoGlyph,
  ResetGlyph,
  RotateGlyph,
  UndoGlyph,
  ZoomGlyph,
} from '../components/icons';
import { PressableScale } from '../components/Motion';
import Slider from '../components/Slider';
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

type Who = 'current' | 'future';

/** Both avatars at one moment: what undo and redo step through. */
interface Draft {
  current: AvatarConfig;
  future: AvatarConfig | null;
}

const SIDE = 16;
const TOP_BAR = 64;
// The camera turns in steps, so looks you come back to are already drawn.
const YAW_STEP = Math.PI / 12;
const FRONT = 0.3;
const VIEWS: EditorView[] = ['full-body', 'head', 'face'];
/** Avatar data labels are stored in English; this shows them in the app language. */
const L = (label: string): string => labelFor('avatarText', label);

const VIEW_LABEL: Readonly<Record<EditorView, string>> = {
  get 'full-body'() {
    return i18n.t('avatarCreator.fullBody');
  },
  get head() {
    return i18n.t('avatarCreator.headAndShoulders');
  },
  get face() {
    return i18n.t('avatarCreator.faceCloseUp');
  },
};
const FACE_ZOOM = 1.7;

export function AvatarCreatorScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { width: winW, height: winH } = useWindowDimensions();
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const existing = useAppSelector((state) => state.user.profile?.avatar_config);
  const level = useAppSelector((state) => state.gamification.level);

  const saved = useMemo(
    () => readAvatarDoc(existing, VALID_OPTION_IDS),
    // Read once: edits live in this screen until Save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [draft, setDraft] = useState<Draft>({ current: saved.current, future: saved.future });
  const [looks, setLooks] = useState<SavedLook[]>(saved.looks);
  const [who, setWho] = useState<Who>(route.params?.who ?? 'current');
  const [tabKey, setTabKey] = useState<string>(EDITOR_TABS[0].key);
  const [view, setView] = useState<EditorView>(EDITOR_TABS[0].view);
  const [yawSteps, setYawSteps] = useState(0);
  const [comparing, setComparing] = useState(false);
  // Basic edit: presets and choices. Detailed edit: every slider too.
  const [detailed, setDetailed] = useState(false);
  const [customFor, setCustomFor] = useState<AvatarChoiceKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const undoStack = useRef<Draft[]>([]);
  const redoStack = useRef<Draft[]>([]);
  // Where a slider drag started, so the whole drag is one undo step.
  const dragFrom = useRef<Draft | null>(null);
  const [, setHistoryVersion] = useState(0);

  const tab: EditorTab = EDITOR_TABS.find((t) => t.key === tabKey) ?? EDITOR_TABS[0];
  const config = who === 'future' ? draft.future : draft.current;
  const before = who === 'future' ? saved.future ?? saved.current : saved.current;
  const shown = comparing ? before : config;

  const pushHistory = (from: Draft) => {
    undoStack.current.push(from);
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  };

  const withConfig = (next: AvatarConfig): Draft =>
    who === 'future' ? { ...draft, future: next } : { ...draft, current: next };

  /** One finished change: goes on the undo stack. */
  const commit = (next: AvatarConfig) => {
    pushHistory(dragFrom.current ?? draft);
    dragFrom.current = null;
    setDraft(withConfig(next));
  };

  /** A change still in progress (a slider being dragged): preview only. */
  const preview = (next: AvatarConfig) => {
    if (!dragFrom.current) dragFrom.current = draft;
    setDraft(withConfig(next));
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(draft);
    setHistoryVersion((v) => v + 1);
    setDraft(prev);
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(draft);
    setHistoryVersion((v) => v + 1);
    setDraft(next);
  };

  const selectTab = (next: EditorTab) => {
    setTabKey(next.key);
    setView(next.view);
    // Face tabs start from the front again.
    if (next.view !== 'full-body') setYawSteps(0);
    setCustomFor(null);
  };

  const setChoice = (key: AvatarChoiceKey, value: string, live = false) => {
    if (!config || config[key] === value) return;
    let next = { ...config, [key]: value } as AvatarConfig;
    // A new body: swap what was cut for the other one.
    if (key === 'sex') next = fitToSex(next);
    if (live) preview(next);
    else commit(next);
  };

  const pickOption = (key: AvatarChoiceKey, option: OptionItem) => {
    if (optionLocked(option, level)) {
      toast.showToast({ message: t('avatarCreator.unlocksAtLevelKeep', { label: L(option.label), minLevel: option.minLevel }) });
      return;
    }
    setCustomFor(null);
    setChoice(key, option.id);
  };

  const setSlider = (id: SliderId, value: number, live: boolean) => {
    if (!config) return;
    const sliders = { ...config.sliders };
    if (value) sliders[id] = value;
    else delete sliders[id];
    const next = { ...config, sliders };
    if (live) preview(next);
    else commit(next);
  };

  const pickPreset = (owns: SliderId[], preset: Preset) => {
    if (!config) return;
    commit({ ...config, sliders: applyPreset(config.sliders, owns, preset) });
  };

  const startFuture = (suggest: boolean) => {
    pushHistory(draft);
    setDraft({ ...draft, future: suggest ? suggestFuture(draft.current) : { ...draft.current, sliders: { ...draft.current.sliders } } });
  };

  const saveLook = () => {
    if (!config) return;
    if (looks.length >= MAX_LOOKS) {
      toast.showToast({ message: t('avatarCreator.youCanKeepLooks', { MAX_LOOKS }) });
      return;
    }
    const used = new Set(looks.map((l) => l.name));
    let n = looks.length + 1;
    while (used.has(t('avatarCreator.look', { n }))) n++;
    setLooks([...looks, { name: t('avatarCreator.look', { n }), config }]);
    toast.showToast({ message: t('avatarCreator.savedAsLookTap', { n }) });
  };

  const save = async () => {
    setSaving(true);
    const result = await dispatch(saveAvatarConfig(writeAvatarDoc({ current: draft.current, future: draft.future, looks })));
    setSaving(false);
    if (saveAvatarConfig.fulfilled.match(result)) {
      if (fromOnboarding) {
        dispatch(onboardingCompletedLocally());
      } else {
        toast.showToast({ message: t('avatarCreator.yourAvatarIsSaved') });
        navigation.goBack();
      }
    } else {
      toast.showToast({ message: result.payload ?? t('avatarCreator.couldNotSaveYour') });
    }
  };

  // Drag across the preview to turn the avatar.
  const yawRef = useRef(0);
  yawRef.current = yawSteps;
  const turn = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        start = yawRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const next = start + Math.round(g.dx / 28);
        if (next !== yawRef.current) setYawSteps(next);
      },
    });
  }, []);

  // Layout: the preview takes a bit under half the screen.
  const contentW = Math.min(winW, 720);
  const previewH = Math.max(280, Math.min(winH * 0.44, 440));
  const colorCell = Math.floor((contentW - SIDE * 2 - 8 * 5) / 6);
  const thumbCols = contentW > 560 ? 6 : 4;
  const thumbCell = Math.floor((contentW - SIDE * 2 - 10 * (thumbCols - 1)) / thumbCols);
  const bg = bgStyle((shown ?? draft.current).bg);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  // Room for the figure: below the top bar, above the sheet's rounded edge.
  const stageH = previewH - TOP_BAR - radius.lg;
  const headSize = Math.min(stageH * 0.98, contentW * 0.8);
  const camera = useMemo(
    () => ({ yaw: FRONT + yawSteps * YAW_STEP, zoom: view === 'face' ? FACE_ZOOM : 1 }),
    [yawSteps, view],
  );
  const nextView = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];

  return (
    <View style={styles.root}>
      <View style={[styles.preview, { height: previewH }]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
          <Defs>
            <LinearGradient id={`editorBg${bg.id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={mix(bg.from, '#FFFFFF', 0.25)} />
              <Stop offset="1" stopColor={bg.to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={10} height={10} fill={`url(#editorBg${bg.id})`} />
        </Svg>
        <SafeAreaView edges={['top']} style={styles.previewInner}>
          <View style={styles.stage} {...turn.panHandlers}>
            {shown ? (
              <View pointerEvents="none" style={view === 'full-body' ? null : styles.bust}>
                <Avatar3D
                  config={shown}
                  size={view === 'full-body' ? stageH : headSize}
                  mood="happy"
                  mode={view === 'full-body' ? 'full-body' : 'head'}
                  bare
                  animated={false}
                  camera={camera}
                  live="editor"
                />
              </View>
            ) : null}
          </View>
          <View style={styles.topBar} pointerEvents="box-none">
            {navigation.canGoBack() ? (
              <RoundButton label={t('avatarCreator.closeWithoutSaving')} onPress={() => navigation.goBack()}>
                <CloseGlyph />
              </RoundButton>
            ) : (
              <View style={styles.roundButtonSpacer} />
            )}
            <View style={styles.who} accessibilityRole="tablist">
              {(['current', 'future'] as const).map((w) => {
                const on = who === w;
                return (
                  <Pressable
                    key={w}
                    accessibilityRole="tab"
                    accessibilityLabel={w === 'current' ? t('avatarCreator.currentYouThePerson') : t('avatarCreator.futureYouThePerson')}
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setWho(w);
                      setCustomFor(null);
                    }}
                    style={[styles.whoTab, on && styles.whoTabOn]}
                  >
                    <Txt variant="caption" color={on ? colors.onAccent : colors.ink} style={styles.whoText}>
                      {w === 'current' ? t('avatarCreator.currentYou') : t('avatarCreator.futureYou')}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={fromOnboarding ? t('avatarCreator.saveAndContinue') : t('avatarCreator.saveAvatar')}
              onPress={save}
              disabled={saving}
              style={[styles.savePill, saving && styles.dim]}
            >
              <Txt variant="bodySemi" color={colors.onAccent}>
                {saving ? t('avatarCreator.saving') : fromOnboarding ? t('avatarCreator.continue') : t('avatarCreator.save')}
              </Txt>
            </PressableScale>
          </View>
          {comparing ? (
            <View style={styles.compareTag} pointerEvents="none">
              <Txt variant="caption" color={colors.onAccent}>{t('avatarCreator.before')}</Txt>
            </View>
          ) : null}
          <View style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.row}>
              <RoundButton label={t('avatarCreator.undo')} onPress={undo} disabled={!canUndo}>
                <UndoGlyph color={canUndo ? colors.ink : colors.inkFaint} />
              </RoundButton>
              <RoundButton label={t('avatarCreator.redo')} onPress={redo} disabled={!canRedo}>
                <RedoGlyph color={canRedo ? colors.ink : colors.inkFaint} />
              </RoundButton>
              <RoundButton
                label={t('avatarCreator.holdToSeeHow')}
                onPress={() => undefined}
                onPressIn={() => setComparing(true)}
                onPressOut={() => setComparing(false)}
                selected={comparing}
                disabled={!config}
              >
                <CompareGlyph color={comparing ? colors.onAccent : colors.ink} />
              </RoundButton>
            </View>
            <View style={styles.row}>
              <RoundButton
                label={t('avatarCreator.surpriseMeAWhole')}
                onPress={() => config && commit(randomAvatarConfig(level))}
                disabled={!config}
              >
                <DiceGlyph />
              </RoundButton>
              <RoundButton label={t('avatarCreator.turnTheAvatarYou')} onPress={() => setYawSteps(yawSteps + 3)}>
                <RotateGlyph />
              </RoundButton>
              <RoundButton label={t('avatarCreator.zoomNowNext', { now: VIEW_LABEL[view], next: VIEW_LABEL[nextView] })} onPress={() => setView(nextView)}>
                <ZoomGlyph />
              </RoundButton>
              <RoundButton label={t('avatarCreator.makeAPhotoOf')} onPress={() => setPhotoOpen(true)} disabled={!config}>
                <CameraGlyph color={colors.ink} size={20} />
              </RoundButton>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.sheet}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          style={styles.tabsBar}
        >
          <View style={styles.tabPills} accessibilityRole="tablist">
            {EDITOR_TABS.map((editorTab) => {
              const selected = editorTab.key === tab.key;
              return (
                <Pressable
                  key={editorTab.key}
                  accessibilityRole="tab"
                  accessibilityLabel={L(editorTab.label)}
                  accessibilityState={{ selected }}
                  onPress={() => selectTab(editorTab)}
                  style={[styles.tab, selected && styles.tabOn]}
                >
                  <Txt variant="caption" color={selected ? colors.onAccent : colors.ink} numberOfLines={1} style={styles.tabLabel}>
                    {L(editorTab.label)}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {config ? (
          <ScrollView
            key={`${who}-${tab.key}`}
            style={styles.flex}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {tab.sections.some((x) => x.kind === 'sliders' && x.detail) ? (
              <View style={styles.modes} accessibilityRole="tablist">
                {([false, true] as const).map((d) => (
                  <Pressable
                    key={d ? 'detailed' : 'basic'}
                    accessibilityRole="tab"
                    accessibilityLabel={d ? t('avatarCreator.detailedEditModeEvery') : t('avatarCreator.basicEditModePresets')}
                    accessibilityState={{ selected: detailed === d }}
                    onPress={() => setDetailed(d)}
                    style={[styles.mode, detailed === d && styles.modeOn]}
                  >
                    <Txt variant="caption" color={colors.ink} style={styles.whoText}>{d ? t('avatarCreator.detailedEdit') : t('avatarCreator.basicEdit')}</Txt>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.tabHead}>
              <Txt variant="label" color={colors.inkSoft} style={styles.sheetTitle}>
                {`${who === 'future' ? t('becoming.future') : t('becoming.current')} · ${L(tab.label)}`}
              </Txt>
              <View style={styles.row}>
                <TextButton
                  label={t('avatarCreator.randomize', { label: L(tab.label) })}
                  text={t('avatarCreator.randomize2')}
                  onPress={() => commit(randomizeTab(config, tab, level))}
                  icon={<DiceGlyph size={16} color={colors.accent} />}
                />
                <TextButton
                  label={t('avatarCreator.reset', { label: L(tab.label) })}
                  text={t('avatarCreator.reset2')}
                  onPress={() => commit(resetTab(config, tab, { ...DEFAULT_AVATAR, sliders: {} }))}
                  icon={<ResetGlyph size={16} color={colors.accent} />}
                />
              </View>
            </View>

            {tab.sections.map((section) => (
              <Section
                key={`${section.kind}-${section.title}`}
                section={section}
                config={config}
                level={level}
                colorCell={colorCell}
                thumbCell={thumbCell}
                detailed={detailed}
                onLook={(look) => commit({ ...look, expression: config.expression, pose: config.pose, bg: config.bg })}
                customOpen={section.kind === 'color' && customFor === section.category}
                onToggleCustom={(key) => setCustomFor(customFor === key ? null : key)}
                onOption={pickOption}
                onColor={setChoice}
                onPreset={pickPreset}
                onSlider={setSlider}
              />
            ))}

            {tab.key === 'style' ? (
              <View style={styles.section}>
                <Txt variant="label" style={styles.sectionTitle}>{t('avatarCreator.savedLooks')}</Txt>
                <View style={styles.chips}>
                  {looks.map((look, i) => (
                    <View key={look.name} style={styles.lookChip}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('avatarCreator.wear', { name: look.name })}
                        onPress={() => commit(look.config)}
                        style={styles.lookMain}
                      >
                        <Txt variant="caption" color={colors.ink}>{look.name}</Txt>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('avatarCreator.remove', { name: look.name })}
                        onPress={() => setLooks(looks.filter((_, j) => j !== i))}
                        style={styles.lookRemove}
                      >
                        <CloseGlyph size={14} color={colors.inkSoft} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('avatarCreator.saveThisLookTo')}
                    onPress={saveLook}
                    style={[styles.chip, styles.chipDashed]}
                  >
                    <Txt variant="caption" color={colors.accent}>{t('avatarCreator.saveThisLook')}</Txt>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.futureIntro}>
            <BackdropGlyph size={28} color={colors.accent} />
            <Txt variant="heading" style={styles.center}>{t('avatarCreator.whoAreYouBecoming')}</Txt>
            <Txt variant="body" color={colors.inkSoft} style={styles.center}>
              {t('avatarCreator.futureYouIsA')}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('avatarCreator.createFutureYouWith')}
              onPress={() => startFuture(true)}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Txt variant="bodySemi" color={colors.onAccent}>{t('avatarCreator.suggestAFutureMe')}</Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('avatarCreator.createFutureYouAs')}
              onPress={() => startFuture(false)}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Txt variant="bodySemi" color={colors.ink}>{t('avatarCreator.startFromMyCurrent')}</Txt>
            </Pressable>
          </ScrollView>
        )}
      </View>
      <PhotorealSheet visible={photoOpen} config={config} onClose={() => setPhotoOpen(false)} />
    </View>
  );
}

interface SectionProps {
  section: EditorSection;
  config: AvatarConfig;
  level: number;
  colorCell: number;
  thumbCell: number;
  detailed: boolean;
  onLook: (config: AvatarConfig) => void;
  customOpen: boolean;
  onToggleCustom: (key: AvatarChoiceKey) => void;
  onOption: (key: AvatarChoiceKey, option: OptionItem) => void;
  onColor: (key: AvatarChoiceKey, value: string, live?: boolean) => void;
  onPreset: (owns: SliderId[], preset: Preset) => void;
  onSlider: (id: SliderId, value: number, live: boolean) => void;
}

/** A picture of the avatar wearing one choice. */
function Thumb({ config, shape, cell, label, text, selected, locked = false, channel, onPress }: {
  config: AvatarConfig;
  shape: 'head' | 'full-body';
  cell: number;
  label: string;
  text: string;
  selected: boolean;
  locked?: boolean;
  channel: string;
  onPress: () => void;
}) {
  const h = shape === 'head' ? cell : Math.round(cell * 2.2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [styles.thumb, { width: cell }, locked && styles.dim, pressed && styles.pressed]}
    >
      <View style={[styles.thumbFrame, shape === 'head' ? { borderRadius: cell / 2 } : null, { width: cell, height: h }, selected && styles.thumbFrameOn]}>
        <View pointerEvents="none" style={[styles.thumbClip, shape === 'head' ? { borderRadius: cell / 2 } : null]}>
          <Avatar3D config={config} size={h - 6} mood="neutral" mode={shape === 'head' ? 'head-thumb' : 'body-thumb'} animated={false} live={channel} />
        </View>
      </View>
      <Txt variant="caption" color={selected ? colors.accent : colors.inkSoft} numberOfLines={2} style={styles.thumbLabel}>{text}</Txt>
    </Pressable>
  );
}

function Section({ section, config, level, colorCell, thumbCell, detailed, onLook, customOpen, onToggleCustom, onOption, onColor, onPreset, onSlider }: SectionProps) {
  const { t } = useTranslation();
  useTheme();
  if (section.kind === 'looks') {
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{L(section.title)}</Txt>
        <View style={styles.thumbs}>
          {LOOKS.filter((l) => l.config.sex === config.sex).map((l) => (
            <Thumb
              key={l.id}
              config={{ ...l.config, expression: 'neutral', pose: 'relaxed', bg: config.bg }}
              shape="head"
              cell={thumbCell}
              label={t('avatarCreator.startFromTheLook', { label: L(l.label) })}
              text={L(l.label)}
              selected={false}
              channel={`thumb:look:${l.id}`}
              onPress={() => onLook(l.config)}
            />
          ))}
        </View>
      </View>
    );
  }
  if (section.kind === 'note') {
    return (
      <View style={styles.note}>
        <Txt variant="label" style={styles.sectionTitle}>{L(section.title)}</Txt>
        <Txt variant="caption" color={colors.inkSoft}>{section.text}</Txt>
      </View>
    );
  }
  if (section.kind === 'presets') {
    const current = matchingPreset(section.presets, section.owns, config.sliders);
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{L(section.title)}</Txt>
        <View style={styles.chips}>
          {section.presets.map((preset) => (
            <Chip
              key={preset.id}
              label={`${L(section.title)}: ${L(preset.label)}`}
              text={L(preset.label)}
              selected={current === preset.id}
              onPress={() => onPreset(section.owns, preset)}
            />
          ))}
        </View>
      </View>
    );
  }
  if (section.kind === 'sliders') {
    if ((section.detail && !detailed) || (section.only && section.only !== config.sex)) return null;
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{L(section.title)}</Txt>
        {section.sliders.map((id) => {
          const def = sliderDef(id);
          return (
            <Slider
              key={id}
              label={L(def.label)}
              min={def.min}
              max={1}
              low={L(def.low)}
              high={L(def.high)}
              value={sv(config.sliders, id)}
              onChange={(v) => onSlider(id, v, true)}
              onCommit={(v) => onSlider(id, v, false)}
            />
          );
        })}
      </View>
    );
  }
  const category = categoryFor(section.category);
  const value = config[section.category];
  const worn = wornOutfit(config);
  if (section.when === 'separates' && worn.outfit) return null;
  if (section.when === 'top' && !worn.top?.tint) return null;
  if (section.when === 'bottom' && !worn.bottom?.tint) return null;
  const options = optionsFor(section.category, config.sex);
  if (section.kind === 'choice' && section.thumbs) {
    const shape = section.thumbs;
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{L(section.title)}</Txt>
        <View style={styles.thumbs}>
          {options.map((option) => {
            const locked = optionLocked(option, level);
            return (
              <Thumb
                key={option.id}
                config={{ ...config, [section.category]: option.id, expression: 'neutral', pose: 'relaxed' } as AvatarConfig}
                shape={shape}
                cell={thumbCell}
                label={`${L(section.title)}: ${L(option.label)}${locked ? t('avatarCreator.unlocksAtLevelSuffix', { level: option.minLevel }) : ''}`}
                text={L(option.label)}
                selected={value === option.id}
                locked={locked}
                channel={`thumb:${section.category}:${option.id}`}
                onPress={() => onOption(section.category, option)}
              />
            );
          })}
        </View>
      </View>
    );
  }
  if (section.kind === 'choice') {
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{L(section.title)}</Txt>
        <View style={styles.chips}>
          {options.map((option) => {
            const locked = optionLocked(option, level);
            return (
              <Chip
                key={option.id}
                label={`${L(section.title)}: ${L(option.label)}${locked ? t('avatarCreator.unlocksAtLevelSuffix', { level: option.minLevel }) : ''}`}
                text={L(option.label)}
                selected={value === option.id}
                locked={locked}
                onPress={() => onOption(section.category, option)}
              />
            );
          })}
        </View>
      </View>
    );
  }
  const custom = isHex(value);
  return (
    <View style={styles.section}>
      <Txt variant="label" style={styles.sectionTitle}>{L(section.title)}</Txt>
      <View style={styles.swatches}>
        {category.options.map((option) => {
          const selected = value === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={`${L(section.title)}: ${L(option.label)}`}
              accessibilityState={{ selected }}
              onPress={() => onOption(section.category, option)}
              style={[
                styles.swatchRing,
                { width: colorCell, height: colorCell, borderRadius: colorCell / 2 },
                selected && styles.swatchRingOn,
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  { width: colorCell - 10, height: colorCell - 10, borderRadius: (colorCell - 10) / 2, backgroundColor: option.swatch },
                ]}
              />
            </Pressable>
          );
        })}
        {section.custom ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('avatarCreator.pickACustomColor', { title: L(section.title) })}
            accessibilityState={{ selected: custom, expanded: customOpen }}
            onPress={() => onToggleCustom(section.category)}
            style={[
              styles.swatchRing,
              { width: colorCell, height: colorCell, borderRadius: colorCell / 2 },
              (custom || customOpen) && styles.swatchRingOn,
            ]}
          >
            <View
              style={[
                styles.swatch,
                styles.customSwatch,
                { width: colorCell - 10, height: colorCell - 10, borderRadius: (colorCell - 10) / 2 },
                custom ? { backgroundColor: value } : null,
              ]}
            >
              <Txt variant="caption" color={custom ? '#FFFFFF' : colors.ink} style={styles.customPlus}>+</Txt>
            </View>
          </Pressable>
        ) : null}
      </View>
      {customOpen ? (
        <ColorPicker
          title={L(section.title)}
          value={custom ? value : category.options.find((o) => o.id === value)?.swatch ?? '#808080'}
          onChange={(hex) => onColor(section.category, hex, true)}
          onCommit={(hex) => onColor(section.category, hex)}
        />
      ) : null}
    </View>
  );
}

function Chip({ label, text, selected, locked = false, onPress }: { label: string; text: string; selected: boolean; locked?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, locked && styles.dim, pressed && styles.pressed]}
    >
      {locked ? <LockGlyph size={12} /> : null}
      <Txt variant="caption" color={selected ? colors.onAccent : colors.ink}>{text}</Txt>
    </Pressable>
  );
}

function TextButton({ label, text, icon, onPress }: { label: string; text: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
      {icon}
      <Txt variant="caption" color={colors.accent}>{text}</Txt>
    </Pressable>
  );
}

function RoundButton({
  label,
  onPress,
  onPressIn,
  onPressOut,
  disabled = false,
  selected = false,
  children,
}: {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
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
      onPressIn={onPressIn}
      onPressOut={onPressOut}
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
      gap: spacing.sm,
    },
    who: {
      flexDirection: 'row',
      flexShrink: 1,
      padding: 3,
      borderRadius: radius.pill,
      backgroundColor: mix(colors.card, colors.paper, 0.1),
      ...softShadow(1),
    },
    whoTab: {
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    whoTabOn: {
      backgroundColor: colors.accent,
    },
    whoText: {
      fontFamily: fonts.bodySemi,
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
    compareTag: {
      position: 'absolute',
      alignSelf: 'center',
      top: TOP_BAR + spacing.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
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
      paddingHorizontal: spacing.lg,
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
      paddingTop: spacing.sm,
      ...softShadow(3),
    },
    sheetTitle: {
      fontFamily: fonts.bodySemi,
      flexShrink: 1,
    },
    tabsBar: {
      flexGrow: 0,
    },
    tabs: {
      paddingHorizontal: SIDE,
      paddingBottom: spacing.sm,
    },
    tabPills: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: radius.pill,
      backgroundColor: mix(colors.paperAlt, colors.card, 0.35),
      borderWidth: 1,
      borderColor: colors.line,
    },
    tab: {
      minWidth: 64,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabOn: {
      backgroundColor: colors.accent,
    },
    tabLabel: {
      fontFamily: fonts.bodySemi,
    },
    modes: {
      flexDirection: 'row',
      alignSelf: 'center',
      gap: spacing.xs,
    },
    mode: {
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeOn: {
      backgroundColor: mix(colors.paperAlt, colors.card, 0.2),
      borderWidth: 1,
      borderColor: colors.line,
    },
    thumbs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    thumb: {
      alignItems: 'center',
      gap: 4,
    },
    thumbFrame: {
      borderRadius: radius.sm,
      borderWidth: 3,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbFrameOn: {
      borderColor: colors.accent,
    },
    thumbClip: {
      borderRadius: radius.sm - 2,
      overflow: 'hidden',
    },
    thumbLabel: {
      textAlign: 'center',
      fontSize: 11,
      lineHeight: 14,
    },
    tabHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    textButton: {
      minHeight: 44,
      paddingHorizontal: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    grid: {
      paddingHorizontal: SIDE,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.ink,
    },
    note: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: mix(colors.paperAlt, colors.card, 0.35),
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: mix(colors.paperAlt, colors.card, 0.35),
      borderWidth: 1,
      borderColor: colors.line,
    },
    chipOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipDashed: {
      borderStyle: 'dashed',
      borderColor: colors.accent,
      backgroundColor: 'transparent',
    },
    lookChip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.pill,
      backgroundColor: mix(colors.paperAlt, colors.card, 0.35),
      borderWidth: 1,
      borderColor: colors.line,
    },
    lookMain: {
      minHeight: 44,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      justifyContent: 'center',
    },
    lookRemove: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatches: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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
    customSwatch: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: mix(colors.paperAlt, colors.card, 0.35),
      borderStyle: 'dashed',
    },
    customPlus: {
      fontSize: 18,
      lineHeight: 22,
    },
    futureIntro: {
      padding: spacing.xl,
      gap: spacing.md,
      alignItems: 'center',
    },
    center: {
      textAlign: 'center',
    },
    primary: {
      minHeight: 48,
      alignSelf: 'stretch',
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    secondary: {
      minHeight: 48,
      alignSelf: 'stretch',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dim: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.85,
    },
  }),
);

export default AvatarCreatorScreen;
