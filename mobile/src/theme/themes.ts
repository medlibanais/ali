// Selectable color themes for GROW.
// Raw hex values live ONLY here and are surfaced to the app through
// the live `colors` binding in tokens.ts.

export interface PillarColors {
  health: string;
  family: string;
  work: string;
  fun: string;
  spirituality: string;
}

export interface ThemeColors {
  paper: string;
  paperAlt: string;
  card: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  accent: string;
  onAccent: string;
  gold: string;
  danger: string;
  pillar: PillarColors;
}

export type ThemeId =
  | 'parchment'
  | 'forest'
  | 'ocean'
  | 'sunset'
  | 'rose'
  | 'lavender'
  | 'midnight'
  | 'ember';

export interface AppTheme {
  id: ThemeId;
  name: string;
  dark: boolean;
  colors: ThemeColors;
}

export const THEMES: Record<ThemeId, AppTheme> = {
  parchment: {
    id: 'parchment',
    name: 'Parchment',
    dark: false,
    colors: {
      // "Fluid look" palette from the Figma style sheet: warm cream
      // canvas, white cards, pastel-friendly pillar inks.
      paper: '#F6F1EA',
      paperAlt: '#EFE7DC',
      card: '#FFFFFF',
      ink: '#2A2622',
      inkSoft: '#6F675C',
      inkFaint: '#9C9488',
      line: '#E8E0D4',
      accent: '#2F7A62',
      onAccent: '#FFFFFF',
      gold: '#E2A93B',
      danger: '#C4493A',
      pillar: {
        health: '#C4593A',
        family: '#A8780F',
        work: '#3A78AE',
        fun: '#3F8A3A',
        spirituality: '#6A50B8',
      },
    },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    dark: false,
    colors: {
      paper: '#F0F4EA',
      paperAlt: '#E2E9D6',
      card: '#FAFCF5',
      ink: '#1B2517',
      inkSoft: '#57674F',
      inkFaint: '#87957C',
      line: '#D3DDC3',
      accent: '#2E6B34',
      onAccent: '#F0F4EA',
      gold: '#B9892E',
      danger: '#AF4A33',
      pillar: {
        health: '#C05C2C',
        family: '#B9892E',
        work: '#3D6E72',
        fun: '#7B9A3C',
        spirituality: '#2E6B34',
      },
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    dark: false,
    colors: {
      paper: '#EEF3F6',
      paperAlt: '#E0E9EF',
      card: '#FAFCFE',
      ink: '#15222B',
      inkSoft: '#4F606C',
      inkFaint: '#8294A0',
      line: '#D1DDE5',
      accent: '#14586E',
      onAccent: '#EEF3F6',
      gold: '#BE8A2C',
      danger: '#B04437',
      pillar: {
        health: '#C05D32',
        family: '#BE8A2C',
        work: '#2C5E8C',
        fun: '#5F8C49',
        spirituality: '#14586E',
      },
    },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    dark: false,
    colors: {
      paper: '#FAF0E6',
      paperAlt: '#F2E2D0',
      card: '#FEF9F3',
      ink: '#2B1C11',
      inkSoft: '#775F4B',
      inkFaint: '#A38C75',
      line: '#EAD3BD',
      accent: '#A84A1C',
      onAccent: '#FAF0E6',
      gold: '#C2922E',
      danger: '#9E3B2E',
      pillar: {
        health: '#B4552D',
        family: '#C2922E',
        work: '#4F6378',
        fun: '#8A7A2E',
        spirituality: '#A84A1C',
      },
    },
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    dark: false,
    colors: {
      paper: '#FAF0F1',
      paperAlt: '#F2E0E2',
      card: '#FEF9FA',
      ink: '#29161B',
      inkSoft: '#73545D',
      inkFaint: '#A2878F',
      line: '#EBD2D7',
      accent: '#8E3449',
      onAccent: '#FAF0F1',
      gold: '#BC892F',
      danger: '#A63D2F',
      pillar: {
        health: '#BF5036',
        family: '#BC892F',
        work: '#4A5D80',
        fun: '#7C8440',
        spirituality: '#8E3449',
      },
    },
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    dark: false,
    colors: {
      paper: '#F2EFF7',
      paperAlt: '#E6E0F0',
      card: '#FBFAFD',
      ink: '#1D172F',
      inkSoft: '#5C526E',
      inkFaint: '#8C82A0',
      line: '#DAD1E7',
      accent: '#563B8C',
      onAccent: '#F2EFF7',
      gold: '#BB8B2D',
      danger: '#AB4133',
      pillar: {
        health: '#B75B33',
        family: '#BB8B2D',
        work: '#3E5D8E',
        fun: '#738937',
        spirituality: '#563B8C',
      },
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    colors: {
      paper: '#131519',
      paperAlt: '#1B1E25',
      card: '#1D2028',
      ink: '#ECE7DC',
      inkSoft: '#A8A296',
      inkFaint: '#79746A',
      line: '#2C303B',
      accent: '#4C9A6C',
      onAccent: '#0E120E',
      gold: '#D8A945',
      danger: '#D06A54',
      pillar: {
        health: '#D0754A',
        family: '#D8A945',
        work: '#6C93BE',
        fun: '#94AA5D',
        spirituality: '#4C9A6C',
      },
    },
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    dark: true,
    colors: {
      paper: '#171211',
      paperAlt: '#201815',
      card: '#231A17',
      ink: '#F0E5DC',
      inkSoft: '#B0998C',
      inkFaint: '#836E64',
      line: '#352722',
      accent: '#CD763D',
      onAccent: '#1F130C',
      gold: '#DBA84A',
      danger: '#CD6248',
      pillar: {
        health: '#D07045',
        family: '#DBA84A',
        work: '#7C97B8',
        fun: '#A0A85C',
        spirituality: '#CD763D',
      },
    },
  },
};

export const THEME_LIST: readonly AppTheme[] = [
  THEMES.parchment,
  THEMES.forest,
  THEMES.ocean,
  THEMES.sunset,
  THEMES.rose,
  THEMES.lavender,
  THEMES.midnight,
  THEMES.ember,
];

export const DEFAULT_THEME_ID: ThemeId = 'parchment';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in THEMES;
}
