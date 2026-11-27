import { useAppSelector } from '../store/hooks';
import { AppTheme, THEMES, ThemeId } from './themes';
import { fonts, radius, spacing } from './tokens';

/** Everything a component needs to draw itself in the active theme. */
export interface ThemeTokens extends AppTheme {
  spacing: typeof spacing;
  radius: typeof radius;
  fonts: typeof fonts;
}

// Built once per theme, so the object a component receives only changes
// identity when the theme itself changes (safe in memo and effect deps).
const TOKENS = Object.fromEntries(
  (Object.keys(THEMES) as ThemeId[]).map((id) => [
    id,
    { ...THEMES[id], spacing, radius, fonts },
  ]),
) as Record<ThemeId, ThemeTokens>;

/**
 * Subscribes the calling component to theme changes and returns the active
 * theme: colors, spacing, radius and fonts.
 *
 * This is a Redux selector, not React Context: a component re-renders only
 * when the selected theme id changes, never because some other part of the
 * store changed.
 */
export function useTheme(): ThemeTokens {
  const themeId = useAppSelector((state) => state.theme.themeId);
  return TOKENS[themeId];
}

export default useTheme;
