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

// Generous, soft corners: small pieces (tags, checkboxes) stay gently
// rounded, cards and sheets read as pillows rather than boxes.
export const radius = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 36,
  pill: 999,
} as const;

export const borderWidth = {
  hairline: 1,
} as const;

export const fonts = {
  display: 'IMFellGreatPrimer_400Regular',
  title: 'IMFellGreatPrimer_400Regular',
  body: 'Nunito_400Regular',
  bodySemi: 'Nunito_700Bold',
  caption: 'Nunito_600SemiBold',
  heavy: 'Nunito_800ExtraBold',
} as const;

/** Mixes two token hex colors; t=0 gives `a`, t=1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
}

/**
 * Pastel companions of a pillar's ink color (Figma: base for rings and
 * checkboxes, tint for soft fills behind icons and tags).
 */
export function pillarPastels(pillar: Pillar) {
  const ink = activeColors.pillar[pillar];
  return {
    ink,
    base: mix(ink, activeColors.card, 0.38),
    tint: mix(ink, activeColors.card, 0.86),
  };
}

/** True when the active palette is a dark theme (light ink on dark paper). */
export function isDarkPalette(): boolean {
  const hex = activeColors.paper;
  const lum =
    0.299 * parseInt(hex.slice(1, 3), 16) +
    0.587 * parseInt(hex.slice(3, 5), 16) +
    0.114 * parseInt(hex.slice(5, 7), 16);
  return lum < 110;
}

/**
 * Soft, diffuse elevation. On dark themes shadows disappear, so surfaces
 * keep a faint outline there instead (see softSurface).
 */
export function softShadow(level: 1 | 2 | 3 = 1) {
  // Figma: soft = y8 blur24 8%, float = y12 blur32 14%, tinted with the warm ink.
  const blur = [0, 16, 24, 32][level];
  return {
    shadowColor: activeColors.ink,
    shadowOpacity: isDarkPalette() ? 0 : [0, 0.06, 0.08, 0.14][level],
    shadowRadius: blur / 2,
    shadowOffset: { width: 0, height: [0, 6, 8, 12][level] },
    elevation: level * 2,
  };
}

/** Card-like surface: borderless with a soft shadow on light themes. */
export function softSurface(level: 1 | 2 | 3 = 1) {
  return {
    backgroundColor: activeColors.card,
    borderWidth: isDarkPalette() ? borderWidth.hairline : 0,
    borderColor: activeColors.line,
    ...softShadow(level),
  };
}

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
