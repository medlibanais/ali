import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { saveProfileLanguage, setLanguage } from '../store/slices/languageSlice';

/**
 * Keeps profiles.language and the device in step once the profile loads:
 * a saved profile language wins (same language on every device); a profile
 * without one adopts what this device already shows.
 */
export function useLanguageSync(): void {
  const dispatch = useAppDispatch();
  const profileLoaded = useAppSelector((s) => s.user.profile !== null);
  const profileLanguage = useAppSelector((s) => s.user.profile?.language ?? null);
  const current = useAppSelector((s) => s.language.language);
  const handled = useRef(false);

  useEffect(() => {
    if (!profileLoaded || handled.current) return;
    handled.current = true;
    if (profileLanguage && profileLanguage !== current) {
      void dispatch(setLanguage({ language: profileLanguage, saveToProfile: false }));
    } else if (!profileLanguage) {
      saveProfileLanguage(current).catch(() => undefined);
    }
  }, [dispatch, profileLoaded, profileLanguage, current]);

  useEffect(() => {
    if (!profileLoaded) handled.current = false;
  }, [profileLoaded]);
}
