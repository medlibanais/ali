// The source side of a hero flight (see lib/hero.ts and Hero.tsx). Kept
// apart from Hero.tsx so the Today orbit doesn't pull in navigation code.

import { useEffect, useRef } from 'react';
import type { View } from 'react-native';
import { measureView, registerHeroSource } from '../lib/hero';

/** Ref for the view a hero flies FROM. */
export function useHeroSource(key: string): React.RefObject<View> {
  const ref = useRef<View>(null);
  useEffect(
    () => registerHeroSource(key, () => measureView(ref.current)),
    [key],
  );
  return ref;
}
