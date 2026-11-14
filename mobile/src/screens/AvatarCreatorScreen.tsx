// Avatar editor. A live 3D preview on top (drag to turn it, zoom from
// full body to a close-up), and below it ten tabs from Face to
// Personality. Shapes are presets plus sliders: a preset moves a group of
// sliders, and every slider stays free to fine-tune.
//
// It edits two avatars: Current You, the person you are today, and
// Future You, the person you are becoming. Both are saved together in
// profiles.avatar_config.

import React, { useMemo, useRef, useState } from 'react';
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
  optionLocked,
  randomAvatarConfig,
  randomizeTab,
  resetTab,
  syncLegacyBody,
  VALID_OPTION_IDS,
  type EditorSection,
  type EditorTab,
  type EditorView,
  type OptionItem,
} from '../avatar/options';
import { bgStyle, isHex } from '../avatar/palettes';
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
import {
  BackdropGlyph,
  BeardGlyph,
  CloseGlyph,
  CompareGlyph,
  DiceGlyph,
  EyeGlyph,
  FaceGlyph,
  GlassesGlyph,
  HairGlyph,
  LipsGlyph,
  LockGlyph,
  PersonGlyph,
  RedoGlyph,
  ResetGlyph,
  RotateGlyph,
  ShirtGlyph,
  SkinGlyph,
  SmileGlyph,
  UndoGlyph,
  ZoomGlyph,
  type IconProps,
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

const TAB_ICONS: Record<string, (props: IconProps) => React.ReactElement> = {
  face: FaceGlyph,
  eyes: EyeGlyph,
  mouth: LipsGlyph,
  skin: SkinGlyph,
  hair: HairGlyph,
  body: PersonGlyph,
  clothing: ShirtGlyph,
  accessories: GlassesGlyph,
  details: BeardGlyph,
  personality: SmileGlyph,
};

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
const VIEW_LABEL: Record<EditorView, string> = { 'full-body': 'full body', head: 'head and shoulders', face: 'face close-up' };
const FACE_ZOOM = 1.6;

export function AvatarCreatorScreen({ navigation, route }: Props) {
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
  const [customFor, setCustomFor] = useState<AvatarChoiceKey | null>(null);
  const [saving, setSaving] = useState(false);
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
    setDraft(withConfig(syncLegacyBody(next)));
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
    const next = { ...config, [key]: value } as AvatarConfig;
    if (live) preview(next);
    else commit(next);
  };

  const pickOption = (key: AvatarChoiceKey, option: OptionItem) => {
    if (optionLocked(option, level)) {
      toast.showToast({ message: `${option.label} unlocks at level ${option.minLevel}. Keep going.` });
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
      toast.showToast({ message: `You can keep ${MAX_LOOKS} looks. Remove one first.` });
      return;
    }
    const used = new Set(looks.map((l) => l.name));
    let n = looks.length + 1;
    while (used.has(`Look ${n}`)) n++;
    setLooks([...looks, { name: `Look ${n}`, config }]);
    toast.showToast({ message: `Saved as Look ${n}. Tap Save to keep it.` });
  };

  const save = async () => {
    setSaving(true);
    const result = await dispatch(saveAvatarConfig(writeAvatarDoc({ current: draft.current, future: draft.future, looks })));
    setSaving(false);
    if (saveAvatarConfig.fulfilled.match(result)) {
      if (fromOnboarding) {
        dispatch(onboardingCompletedLocally());
      } else {
        toast.showToast({ message: 'Your avatar is saved.' });
        navigation.goBack();
      }
    } else {
      toast.showToast({ message: result.payload ?? 'Could not save your avatar.' });
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
              <RoundButton label="Close without saving" onPress={() => navigation.goBack()}>
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
                    accessibilityLabel={w === 'current' ? 'Current you: the person you are today' : 'Future you: the person you are becoming'}
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setWho(w);
                      setCustomFor(null);
                    }}
                    style={[styles.whoTab, on && styles.whoTabOn]}
                  >
                    <Txt variant="caption" color={on ? colors.onAccent : colors.ink} style={styles.whoText}>
                      {w === 'current' ? 'Current you' : 'Future you'}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
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
          {comparing ? (
            <View style={styles.compareTag} pointerEvents="none">
              <Txt variant="caption" color={colors.onAccent}>Before</Txt>
            </View>
          ) : null}
          <View style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.row}>
              <RoundButton label="Undo" onPress={undo} disabled={!canUndo}>
                <UndoGlyph color={canUndo ? colors.ink : colors.inkFaint} />
              </RoundButton>
              <RoundButton label="Redo" onPress={redo} disabled={!canRedo}>
                <RedoGlyph color={canRedo ? colors.ink : colors.inkFaint} />
              </RoundButton>
              <RoundButton
                label="Hold to see how it looked before your changes"
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
                label="Surprise me: a whole new random avatar"
                onPress={() => config && commit(randomAvatarConfig(level))}
                disabled={!config}
              >
                <DiceGlyph />
              </RoundButton>
              <RoundButton label="Turn the avatar. You can also drag it." onPress={() => setYawSteps(yawSteps + 3)}>
                <RotateGlyph />
              </RoundButton>
              <RoundButton label={`Zoom: now ${VIEW_LABEL[view]}, next ${VIEW_LABEL[nextView]}`} onPress={() => setView(nextView)}>
                <ZoomGlyph />
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
          {EDITOR_TABS.map((t) => {
            const Icon = TAB_ICONS[t.key];
            const selected = t.key === tab.key;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected }}
                onPress={() => selectTab(t)}
                style={styles.tab}
              >
                <Icon size={22} color={selected ? colors.accent : colors.inkSoft} />
                <Txt variant="caption" color={selected ? colors.accent : colors.inkSoft} numberOfLines={1} style={styles.tabLabel}>
                  {t.label}
                </Txt>
                <View style={[styles.tabBar, selected && styles.tabBarOn]} />
              </Pressable>
            );
          })}
        </ScrollView>

        {config ? (
          <ScrollView
            key={`${who}-${tab.key}`}
            style={styles.flex}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.tabHead}>
              <Txt variant="label" color={colors.inkSoft} style={styles.sheetTitle}>
                {`${who === 'future' ? 'Future you' : 'Current you'} · ${tab.label}`}
              </Txt>
              <View style={styles.row}>
                <TextButton
                  label={`Randomize ${tab.label}`}
                  text="Randomize"
                  onPress={() => commit(randomizeTab(config, tab, level))}
                  icon={<DiceGlyph size={16} color={colors.accent} />}
                />
                <TextButton
                  label={`Reset ${tab.label}`}
                  text="Reset"
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
                customOpen={section.kind === 'color' && customFor === section.category}
                onToggleCustom={(key) => setCustomFor(customFor === key ? null : key)}
                onOption={pickOption}
                onColor={setChoice}
                onPreset={pickPreset}
                onSlider={setSlider}
              />
            ))}

            {tab.key === 'personality' ? (
              <View style={styles.section}>
                <Txt variant="label" style={styles.sectionTitle}>Saved looks</Txt>
                <View style={styles.chips}>
                  {looks.map((look, i) => (
                    <View key={look.name} style={styles.lookChip}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Wear ${look.name}`}
                        onPress={() => commit(look.config)}
                        style={styles.lookMain}
                      >
                        <Txt variant="caption" color={colors.ink}>{look.name}</Txt>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${look.name}`}
                        onPress={() => setLooks(looks.filter((_, j) => j !== i))}
                        style={styles.lookRemove}
                      >
                        <CloseGlyph size={14} color={colors.inkSoft} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save this look to wear again later"
                    onPress={saveLook}
                    style={[styles.chip, styles.chipDashed]}
                  >
                    <Txt variant="caption" color={colors.accent}>Save this look</Txt>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.futureIntro}>
            <BackdropGlyph size={28} color={colors.accent} />
            <Txt variant="heading" style={styles.center}>Who are you becoming?</Txt>
            <Txt variant="body" color={colors.inkSoft} style={styles.center}>
              Future You is a second avatar: the person you are working toward. Shape how they stand, look and dress, and
              keep them next to who you are today.
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create Future You with a suggested start"
              onPress={() => startFuture(true)}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Txt variant="bodySemi" color={colors.onAccent}>Suggest a Future Me</Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create Future You as a copy of your current avatar"
              onPress={() => startFuture(false)}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Txt variant="bodySemi" color={colors.ink}>Start from my current avatar</Txt>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

interface SectionProps {
  section: EditorSection;
  config: AvatarConfig;
  level: number;
  colorCell: number;
  customOpen: boolean;
  onToggleCustom: (key: AvatarChoiceKey) => void;
  onOption: (key: AvatarChoiceKey, option: OptionItem) => void;
  onColor: (key: AvatarChoiceKey, value: string, live?: boolean) => void;
  onPreset: (owns: SliderId[], preset: Preset) => void;
  onSlider: (id: SliderId, value: number, live: boolean) => void;
}

function Section({ section, config, level, colorCell, customOpen, onToggleCustom, onOption, onColor, onPreset, onSlider }: SectionProps) {
  useTheme();
  if (section.kind === 'note') {
    return (
      <View style={styles.note}>
        <Txt variant="label" style={styles.sectionTitle}>{section.title}</Txt>
        <Txt variant="caption" color={colors.inkSoft}>{section.text}</Txt>
      </View>
    );
  }
  if (section.kind === 'presets') {
    const current = matchingPreset(section.presets, section.owns, config.sliders);
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{section.title}</Txt>
        <View style={styles.chips}>
          {section.presets.map((preset) => (
            <Chip
              key={preset.id}
              label={`${section.title}: ${preset.label}`}
              text={preset.label}
              selected={current === preset.id}
              onPress={() => onPreset(section.owns, preset)}
            />
          ))}
        </View>
      </View>
    );
  }
  if (section.kind === 'sliders') {
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{section.title}</Txt>
        {section.sliders.map((id) => {
          const def = sliderDef(id);
          return (
            <Slider
              key={id}
              label={def.label}
              min={def.min}
              max={1}
              low={def.low}
              high={def.high}
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
  if (section.kind === 'choice') {
    return (
      <View style={styles.section}>
        <Txt variant="label" style={styles.sectionTitle}>{section.title}</Txt>
        <View style={styles.chips}>
          {category.options.map((option) => {
            const locked = optionLocked(option, level);
            return (
              <Chip
                key={option.id}
                label={`${section.title}: ${option.label}${locked ? `, unlocks at level ${option.minLevel}` : ''}`}
                text={option.label}
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
      <Txt variant="label" style={styles.sectionTitle}>{section.title}</Txt>
      <View style={styles.swatches}>
        {category.options.map((option) => {
          const selected = value === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={`${section.title}: ${option.label}`}
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
            accessibilityLabel={`${section.title}: pick a custom color`}
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
          title={section.title}
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
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    tabs: {
      paddingHorizontal: SIDE - 6,
    },
    tab: {
      minWidth: 68,
      height: 56,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    tabLabel: {
      fontSize: 11,
      lineHeight: 14,
    },
    tabBar: {
      position: 'absolute',
      bottom: 0,
      width: 30,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'transparent',
    },
    tabBarOn: {
      backgroundColor: colors.accent,
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
