// Anime art styles for the avatar. Each one is a grade over the same
// AvatarConfig colors (so every skin, hair, outfit and background choice
// still shows) plus the line weight, eye treatment and extras that give
// the style its mood. Picked from merill's references: dark, moody seinen
// anime with sharp linework and intense eyes. The AI photo avatar has a
// matching prompt per style in supabase/functions/generate-avatar.

import { mix } from '../theme/tokens';

export type AnimeStyleId = 'ronin' | 'crimson' | 'grit' | 'storm';

export interface AnimeStyle {
  id: AnimeStyleId;
  label: string;
  blurb: string;
  /** Outline width in canvas units, and the ink color. */
  line: number;
  ink: string;
  /** 0 keeps a color, 1 turns it fully gray. */
  desaturate: number;
  /** Color every part is pulled toward, and how far. */
  tint: string;
  tintAmount: number;
  /** How dark the cel shadow is (mix of the base toward ink). */
  shadow: number;
  /** Iris color; null keeps a natural brown. */
  iris: string | null;
  /** Iris glows (a bright ring) and sits smaller in the eye. */
  intenseEyes: boolean;
  /** Extra lines under the eyes and on the cheeks. */
  rugged: boolean;
  /** Diagonal screentone lines in the shadows. */
  hatching: boolean;
  /** Warm light along the shadow-side edge of the face and body. */
  rim: string | null;
  /** Background: the user's background color pushed toward these. */
  bgDark: string;
  bgGlow: string;
  /** Rain streaks and wet highlights. */
  rain: boolean;
}

export const ANIME_STYLES: Record<AnimeStyleId, AnimeStyle> = {
  ronin: {
    id: 'ronin',
    label: 'Ronin',
    blurb: 'Night-time samurai drama: thin clean lines, half the face in shadow, ember light.',
    line: 1.3,
    ink: '#1A100C',
    desaturate: 0.25,
    tint: '#3A2418',
    tintAmount: 0.18,
    shadow: 0.5,
    iris: '#4A4048',
    intenseEyes: false,
    rugged: false,
    hatching: false,
    rim: '#E07A3A',
    bgDark: '#140D0B',
    bgGlow: '#B4541F',
    rain: false,
  },
  crimson: {
    id: 'crimson',
    label: 'Crimson',
    blurb: 'Near-monochrome psychological thriller: heavy ink, screentone hatching, glowing red eyes.',
    line: 2.1,
    ink: '#141012',
    desaturate: 0.92,
    tint: '#E8DFCB',
    tintAmount: 0.12,
    shadow: 0.62,
    iris: '#D3161E',
    intenseEyes: true,
    rugged: true,
    hatching: true,
    rim: null,
    bgDark: '#2A2627',
    bgGlow: '#E9E1CF',
    rain: false,
  },
  grit: {
    id: 'grit',
    label: 'Grit',
    blurb: 'Rugged seinen hero: strong brows, lined face, warm brown tones, steady stare.',
    line: 1.8,
    ink: '#1C120C',
    desaturate: 0.3,
    tint: '#5A3A20',
    tintAmount: 0.16,
    shadow: 0.55,
    iris: '#7A2A18',
    intenseEyes: false,
    rugged: true,
    hatching: false,
    rim: null,
    bgDark: '#2A1E10',
    bgGlow: '#8A6A2A',
    rain: false,
  },
  storm: {
    id: 'storm',
    label: 'Storm',
    blurb: 'Lone warrior in the rain: cold blue-gray palette, wet hair streaks, rain over a stormy sky.',
    line: 1.7,
    ink: '#0E1218',
    desaturate: 0.45,
    tint: '#3E4C60',
    tintAmount: 0.3,
    shadow: 0.58,
    iris: '#3A5A6E',
    intenseEyes: false,
    rugged: false,
    hatching: false,
    rim: '#C9D6E2',
    bgDark: '#1A2230',
    bgGlow: '#8C9AAB',
    rain: true,
  },
};

export const ANIME_STYLE_IDS = Object.keys(ANIME_STYLES) as AnimeStyleId[];

/** The style the app uses when nothing else is chosen. */
export const DEFAULT_ANIME_STYLE: AnimeStyleId = 'crimson';

export function animeStyle(id: string | undefined): AnimeStyle {
  return ANIME_STYLES[id as AnimeStyleId] ?? ANIME_STYLES[DEFAULT_ANIME_STYLE];
}

function gray(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    .toString(16)
    .padStart(2, '0');
  return `#${y}${y}${y}`;
}

/** A config color seen through the style's grade. */
export function grade(style: AnimeStyle, hex: string): string {
  const flat = mix(hex, gray(hex), style.desaturate);
  return mix(flat, style.tint, style.tintAmount);
}

/** The cel-shadow color for a graded base. */
export function shade(style: AnimeStyle, graded: string): string {
  return mix(graded, style.ink, style.shadow);
}
