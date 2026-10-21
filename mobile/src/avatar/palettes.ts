// Color catalogs for the avatar. Kept separate from app themes so the
// avatar reads consistently regardless of the selected app theme.

export const SKIN_TONES: { id: string; label: string; base: string; shade: string }[] = [
  { id: 'porcelain-1', label: 'Porcelain', base: '#FBE3D5', shade: '#F0CBB6' },
  { id: 'porcelain-2', label: 'Fair', base: '#F7D8C3', shade: '#ECC2A6' },
  { id: 'light-1', label: 'Light', base: '#F2CBAE', shade: '#E2B493' },
  { id: 'light-2', label: 'Light warm', base: '#EDBE9D', shade: '#DBA985' },
  { id: 'tan-1', label: 'Tan light', base: '#E3AC83', shade: '#D0976C' },
  { id: 'tan-2', label: 'Tan', base: '#D89B70', shade: '#C58559' },
  { id: 'tan-3', label: 'Olive', base: '#C98A5F', shade: '#B5754C' },
  { id: 'brown-1', label: 'Brown light', base: '#B87850', shade: '#A2633E' },
  { id: 'brown-2', label: 'Brown', base: '#A0663F', shade: '#8A5331' },
  { id: 'brown-3', label: 'Deep brown', base: '#86522F', shade: '#6F4023' },
  { id: 'deep-1', label: 'Deep', base: '#6E4125', shade: '#583118' },
  { id: 'deep-2', label: 'Ebony', base: '#553018', shade: '#42230F' },
];

export const HAIR_COLORS: { id: string; label: string; value: string }[] = [
  { id: 'black', label: 'Black', value: '#1C1611' },
  { id: 'near-black', label: 'Soft black', value: '#2C211A' },
  { id: 'espresso', label: 'Espresso', value: '#3D2A1B' },
  { id: 'dark-brown', label: 'Dark brown', value: '#4E3421' },
  { id: 'chestnut', label: 'Chestnut', value: '#6B4226' },
  { id: 'auburn', label: 'Auburn', value: '#7E3B21' },
  { id: 'copper', label: 'Copper', value: '#A0522D' },
  { id: 'light-brown', label: 'Light brown', value: '#8A6138' },
  { id: 'dirty-blonde', label: 'Dark blonde', value: '#A67C44' },
  { id: 'honey', label: 'Honey', value: '#C09451' },
  { id: 'golden', label: 'Golden', value: '#D9AC5F' },
  { id: 'blonde', label: 'Blonde', value: '#E8C77E' },
  { id: 'platinum', label: 'Platinum', value: '#F0DCAC' },
  { id: 'silver', label: 'Silver', value: '#C7C7CC' },
  { id: 'gray', label: 'Gray', value: '#9A9AA0' },
  { id: 'white', label: 'White', value: '#EFEFEA' },
  { id: 'ginger', label: 'Ginger', value: '#C2521F' },
  { id: 'burgundy', label: 'Burgundy', value: '#5E2430' },
  { id: 'navy', label: 'Navy', value: '#24344E' },
  { id: 'teal', label: 'Teal', value: '#2E5E5B' },
];

export const OUTFIT_COLORS: { id: string; label: string; value: string; shade: string }[] = [
  { id: 'forest', label: 'Forest', value: '#1F5138', shade: '#173C2A' },
  { id: 'navy', label: 'Navy', value: '#2C4A6E', shade: '#1F3853' },
  { id: 'charcoal', label: 'Charcoal', value: '#3A3A40', shade: '#2A2A2F' },
  { id: 'clay', label: 'Clay', value: '#A84A1C', shade: '#863913' },
  { id: 'sand', label: 'Sand', value: '#C7A878', shade: '#A98A5E' },
  { id: 'rose', label: 'Rose', value: '#8E3449', shade: '#6E2738' },
  { id: 'sky', label: 'Sky', value: '#5B87A8', shade: '#476B87' },
  { id: 'cream', label: 'Cream', value: '#E8DFC8', shade: '#CBC0A6' },
];

export const BG_STYLES: { id: string; label: string; from: string; to: string }[] = [
  { id: 'sunrise', label: 'Sunrise', from: '#F6E3C5', to: '#E8B08A' },
  { id: 'meadow', label: 'Meadow', from: '#DDEBCB', to: '#A8C89A' },
  { id: 'ocean', label: 'Ocean', from: '#CFE4EC', to: '#8FB8CC' },
  { id: 'dusk', label: 'Dusk', from: '#DCD3E8', to: '#A08BBD' },
  { id: 'ember', label: 'Ember', from: '#F2D5C3', to: '#C98A6B' },
  { id: 'mint', label: 'Mint', from: '#D3EBDD', to: '#8FC3A8' },
  { id: 'sand', label: 'Sand', from: '#EFE6D2', to: '#CDBB94' },
  { id: 'night', label: 'Night', from: '#3A4664', to: '#1D2438' },
];

export function skinTone(id: string) {
  return SKIN_TONES.find((t) => t.id === id) ?? SKIN_TONES[6];
}

export function hairColor(id: string): string {
  return HAIR_COLORS.find((c) => c.id === id)?.value ?? '#3D2A1B';
}

export function outfitColor(id: string) {
  return OUTFIT_COLORS.find((c) => c.id === id) ?? OUTFIT_COLORS[0];
}

export function pantsColor(id: string) {
  return OUTFIT_COLORS.find((c) => c.id === id) ?? OUTFIT_COLORS[1];
}

export function shoesColor(id: string) {
  return OUTFIT_COLORS.find((c) => c.id === id) ?? OUTFIT_COLORS[2];
}

export function bgStyle(id: string) {
  return BG_STYLES.find((b) => b.id === id) ?? BG_STYLES[0];
}
