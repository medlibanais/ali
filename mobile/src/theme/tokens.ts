// Design tokens for GROW.
// Raw hex values live ONLY in themes.ts. The `colors` export below is a
// live binding: it always reflects the theme the user has selected, so
// render-time reads (inline styles, props) pick up theme changes as soon
// as components re-render.

import { DEFAULT_THEME_ID, THEMES, ThemeColors } from './themes';

let activeColors: ThemeColors = THEMES[DEFAULT_THEME_ID].colors;

/** Points the live `colors` binding at a new palette. Called by the store. */
export function applyThemeColors(next: ThemeColors): void {
  activeColors = next;
}

/** The palette of the currently selected theme. */
export function getColors(): ThemeColors {
  return activeColors;
}

/**
 * Live view over the active theme palette. Every property read is forwarded
 * to the current theme, so values read during render are always up to date.
 */
export const colors: ThemeColors = new Proxy({} as ThemeColors, {
  get(_target, prop: keyof ThemeColors) {
    return activeColors[prop];
  },
});

/**
 * Wraps a StyleSheet (or any style map) factory so styles are rebuilt from
 * the active theme on every read after a theme change. Use for module-level
 * styles: `const styles = themed(() => StyleSheet.create({ ... }))`.
 */
export function themed<T extends object>(factory: () => T): T {
  let builtFor: ThemeColors | null = null;
  let built: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop: string | symbol) {
      if (built === null || builtFor !== activeColors) {
        built = factory();
        builtFor = activeColors;
      }
      return (built as Record<string | symbol, unknown>)[prop];
    },
  });
}

export type Pillar = 'health' | 'family' | 'work' | 'fun' | 'spirituality';

export const PILLARS: readonly Pillar[] = [
  'health',
  'family',
  'work',
  'fun',
  'spirituality',
] as const;

export const PILLAR_LABELS: Record<Pillar, string> = {
  health: 'Health',
  family: 'Family',
  work: 'Work',
  fun: 'Fun',
  spirituality: 'Spirituality',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  xs: 3,
  sm: 5,
  md: 8,
} as const;

export const borderWidth = {
  hairline: 1,
} as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  title: 'Fraunces_500Medium',
  body: 'SourceSans3_400Regular',
  bodySemi: 'SourceSans3_600SemiBold',
} as const;

/**
 * Derives an rgba() string from a token hex color.
 * Lets us tint surfaces with token colors (tags, radar fill) without
 * introducing any new raw hex values outside the theme files.
 */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
