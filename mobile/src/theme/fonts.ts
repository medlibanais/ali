// Direct ttf references so Metro bundles only the four weights the design
// system uses, instead of every weight shipped by the font packages.

declare const require: (name: string) => unknown;

export const appFonts: Record<string, number> = {
  Fraunces_500Medium: require('@expo-google-fonts/fraunces/Fraunces_500Medium.ttf') as number,
  Fraunces_600SemiBold: require('@expo-google-fonts/fraunces/Fraunces_600SemiBold.ttf') as number,
  SourceSans3_400Regular: require('@expo-google-fonts/source-sans-3/SourceSans3_400Regular.ttf') as number,
  SourceSans3_600SemiBold: require('@expo-google-fonts/source-sans-3/SourceSans3_600SemiBold.ttf') as number,
};
