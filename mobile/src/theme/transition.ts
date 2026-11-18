// Bridge between the theme store and the on-screen cross-fade.
// The fade needs a picture of the old theme, so it must be taken BEFORE the
// store switches palettes. ThemeTransition registers how to do that; the
// setTheme thunk awaits it right before applying the new theme.
// Plain module state, no React Context, so nothing re-renders through it.

type PrepareFn = () => Promise<void>;

let prepare: PrepareFn | null = null;

export function registerThemeTransition(fn: PrepareFn | null): void {
  prepare = fn;
}

/** Freezes the current frame on screen. Never throws, never waits long. */
export async function prepareThemeTransition(): Promise<void> {
  if (!prepare) return;
  try {
    await Promise.race([
      prepare(),
      new Promise<void>((resolve) => setTimeout(resolve, 400)),
    ]);
  } catch {
    // The theme still switches, just without the fade.
  }
}
