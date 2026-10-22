// Direct ttf references so Metro bundles only the weights the design
// system uses, instead of every weight shipped by the font packages.
// IM Fell Great Primer sets the titles (the brand voice); Nunito's rounded terminals
// carry the soft, friendly body text.

declare const require: (name: string) => unknown;

export const appFonts: Record<string, number> = {
  IMFellGreatPrimer_400Regular: require('@expo-google-fonts/im-fell-great-primer/IMFellGreatPrimer_400Regular.ttf') as number,
  Nunito_400Regular: require('@expo-google-fonts/nunito/Nunito_400Regular.ttf') as number,
  Nunito_600SemiBold: require('@expo-google-fonts/nunito/Nunito_600SemiBold.ttf') as number,
  Nunito_700Bold: require('@expo-google-fonts/nunito/Nunito_700Bold.ttf') as number,
  Nunito_800ExtraBold: require('@expo-google-fonts/nunito/Nunito_800ExtraBold.ttf') as number,
};
