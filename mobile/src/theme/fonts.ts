// Direct ttf references so Metro bundles only the weights the design
// system uses, instead of every weight shipped by the font packages.
// Anton sets the titles (tall condensed caps), Inter carries body text and
// JetBrains Mono the small uppercase labels. Cairo carries Arabic: none of
// the Latin faces have Arabic glyphs.

declare const require: (name: string) => unknown;

export const appFonts: Record<string, number> = {
  Anton_400Regular: require('@expo-google-fonts/anton/Anton_400Regular.ttf') as number,
  Inter_400Regular: require('@expo-google-fonts/inter/Inter_400Regular.ttf') as number,
  Inter_500Medium: require('@expo-google-fonts/inter/Inter_500Medium.ttf') as number,
  Inter_600SemiBold: require('@expo-google-fonts/inter/Inter_600SemiBold.ttf') as number,
  Inter_700Bold: require('@expo-google-fonts/inter/Inter_700Bold.ttf') as number,
  Inter_800ExtraBold: require('@expo-google-fonts/inter/Inter_800ExtraBold.ttf') as number,
  Cairo_400Regular: require('@expo-google-fonts/cairo/Cairo_400Regular.ttf') as number,
  Cairo_600SemiBold: require('@expo-google-fonts/cairo/Cairo_600SemiBold.ttf') as number,
  Cairo_700Bold: require('@expo-google-fonts/cairo/Cairo_700Bold.ttf') as number,
  JetBrainsMono_600SemiBold: require('@expo-google-fonts/jetbrains-mono/JetBrainsMono_600SemiBold.ttf') as number,
};

/** Arabic stand-in for each Latin face, matched by weight. */
const ARABIC_FACE: Record<string, string> = {
  Anton_400Regular: 'Cairo_700Bold',
  Inter_400Regular: 'Cairo_400Regular',
  Inter_500Medium: 'Cairo_400Regular',
  Inter_600SemiBold: 'Cairo_600SemiBold',
  Inter_700Bold: 'Cairo_700Bold',
  Inter_800ExtraBold: 'Cairo_700Bold',
  JetBrainsMono_600SemiBold: 'Cairo_600SemiBold',
};

export function arabicFontFor(family: string | undefined): string {
  return (family && ARABIC_FACE[family]) || 'Cairo_400Regular';
}
