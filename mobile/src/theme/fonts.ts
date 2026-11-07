// Direct ttf references so Metro bundles only the weights the design
// system uses, instead of every weight shipped by the font packages.
// Anton sets the titles (tall condensed caps), Inter carries body text and
// JetBrains Mono the small uppercase labels.

declare const require: (name: string) => unknown;

export const appFonts: Record<string, number> = {
  Anton_400Regular: require('@expo-google-fonts/anton/Anton_400Regular.ttf') as number,
  Inter_400Regular: require('@expo-google-fonts/inter/Inter_400Regular.ttf') as number,
  Inter_500Medium: require('@expo-google-fonts/inter/Inter_500Medium.ttf') as number,
  Inter_600SemiBold: require('@expo-google-fonts/inter/Inter_600SemiBold.ttf') as number,
  Inter_800ExtraBold: require('@expo-google-fonts/inter/Inter_800ExtraBold.ttf') as number,
  JetBrainsMono_600SemiBold: require('@expo-google-fonts/jetbrains-mono/JetBrainsMono_600SemiBold.ttf') as number,
};
