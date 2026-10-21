import { useAppSelector } from '../store/hooks';
import { AppTheme, THEMES } from './themes';

/**
 * Subscribes the calling component to theme changes and returns the active
 * theme. Components that render theme colors must call this hook so they
 * re-render when the user picks a different theme.
 */
export function useTheme(): AppTheme {
  const themeId = useAppSelector((state) => state.theme.themeId);
  return THEMES[themeId];
}

export default useTheme;
