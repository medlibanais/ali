// Color catalogs for the avatar. Kept separate from app themes so the
// avatar reads consistently regardless of the selected app theme.

/** A custom color is stored as its hex value in place of a palette id. */
export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function darken(hex: string, by: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - by));
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// 24 tones from very fair to rich ebony, in order. The first twelve ids
// predate the full palette and are kept so saved avatars still match.
export const SKIN_TONES: { id: string; label: string; base: string; shade: string }[] = [
  { id: 'very-fair', label: 'Very fair', base: '#FDEDE4', shade: '#F3D6C6' },
  { id: 'porcelain-1', label: 'Porcelain', base: '#FBE3D5', shade: '#F0CBB6' },
  { id: 'ivory', label: 'Ivory', base: '#F9DFCB', shade: '#EDC8AE' },
  { id: 'porcelain-2', label: 'Light peach', base: '#F7D8C3', shade: '#ECC2A6' },
  { id: 'fair-beige', label: 'Fair beige', base: '#F4D2B8', shade: '#E6BB9C' },
  { id: 'light-1', label: 'Warm ivory', base: '#F2CBAE', shade: '#E2B493' },
  { id: 'light-neutral', label: 'Light neutral', base: '#EEC6AC', shade: '#DCAF92' },
  { id: 'light-olive', label: 'Light olive', base: '#E6C39C', shade: '#D2AC82' },
  { id: 'light-2', label: 'Sand', base: '#EDBE9D', shade: '#DBA985' },
  { id: 'golden-beige', label: 'Golden beige', base: '#E8B88A', shade: '#D4A172' },
  { id: 'tan-1', label: 'Warm beige', base: '#E3AC83', shade: '#D0976C' },
  { id: 'medium-beige', label: 'Medium beige', base: '#DDA47C', shade: '#C98E65' },
  { id: 'olive', label: 'Olive', base: '#CFA070', shade: '#B98A5B' },
  { id: 'tan-2', label: 'Honey', base: '#D89B70', shade: '#C58559' },
  { id: 'golden-tan', label: 'Golden tan', base: '#D0915F', shade: '#BA7B4B' },
  { id: 'tan-3', label: 'Caramel', base: '#C98A5F', shade: '#B5754C' },
  { id: 'brown-1', label: 'Medium brown', base: '#B87850', shade: '#A2633E' },
  { id: 'chestnut', label: 'Chestnut', base: '#AB6C45', shade: '#955836' },
  { id: 'brown-2', label: 'Warm brown', base: '#A0663F', shade: '#8A5331' },
  { id: 'deep-tan', label: 'Deep tan', base: '#935B37', shade: '#7D492A' },
  { id: 'brown-3', label: 'Dark brown', base: '#86522F', shade: '#6F4023' },
  { id: 'deep-1', label: 'Espresso', base: '#6E4125', shade: '#583118' },
  { id: 'mahogany', label: 'Deep mahogany', base: '#61351D', shade: '#4C2712' },
  { id: 'deep-2', label: 'Rich ebony', base: '#553018', shade: '#42230F' },
];

export const HAIR_COLORS: { id: string; label: string; value: string }[] = [
  { id: 'black', label: 'Jet black', value: '#1C1611' },
  { id: 'near-black', label: 'Natural black', value: '#2C211A' },
  { id: 'espresso', label: 'Dark brown', value: '#3D2A1B' },
  { id: 'dark-brown', label: 'Chocolate brown', value: '#4E3421' },
  { id: 'chestnut', label: 'Chestnut', value: '#6B4226' },
  { id: 'medium-brown', label: 'Medium brown', value: '#7A5230' },
  { id: 'light-brown', label: 'Light brown', value: '#8A6138' },
  { id: 'auburn', label: 'Auburn', value: '#7E3B21' },
  { id: 'copper', label: 'Copper', value: '#A0522D' },
  { id: 'ginger', label: 'Ginger', value: '#C2521F' },
  { id: 'strawberry', label: 'Strawberry blonde', value: '#D08A5C' },
  { id: 'dirty-blonde', label: 'Dirty blonde', value: '#A67C44' },
  { id: 'honey', label: 'Honey blonde', value: '#C09451' },
  { id: 'golden', label: 'Golden blonde', value: '#D9AC5F' },
  { id: 'blonde', label: 'Blonde', value: '#E8C77E' },
  { id: 'ash-blonde', label: 'Ash blonde', value: '#CDBE9C' },
  { id: 'platinum', label: 'Platinum blonde', value: '#F0DCAC' },
  { id: 'gray', label: 'Grey', value: '#9A9AA0' },
  { id: 'silver', label: 'Silver', value: '#C7C7CC' },
  { id: 'white', label: 'White', value: '#EFEFEA' },
  { id: 'burgundy', label: 'Burgundy', value: '#5E2430' },
  { id: 'dark-red', label: 'Dark red', value: '#8A1F24' },
  { id: 'navy', label: 'Navy', value: '#24344E' },
  { id: 'blue', label: 'Blue', value: '#2F6FD0' },
  { id: 'teal', label: 'Teal', value: '#2E5E5B' },
  { id: 'green', label: 'Green', value: '#3F9A5B' },
  { id: 'purple', label: 'Purple', value: '#7A4BC2' },
  { id: 'pink', label: 'Pink', value: '#E86FA6' },
  { id: 'pastel-pink', label: 'Pastel pink', value: '#F3B9CF' },
  { id: 'pastel-blue', label: 'Pastel blue', value: '#B5D3F0' },
  { id: 'lavender', label: 'Pastel lavender', value: '#CDB9EC' },
];

// Clothing colors. The first eight ids predate the full palette.
export const OUTFIT_COLORS: { id: string; label: string; value: string; shade: string }[] = [
  { id: 'black', label: 'Black', value: '#1E1E22', shade: '#121214' },
  { id: 'white', label: 'White', value: '#F4F4F0', shade: '#D4D4CE' },
  { id: 'off-white', label: 'Off-white', value: '#EFE9DC', shade: '#D0C9BA' },
  { id: 'cream', label: 'Cream', value: '#E8DFC8', shade: '#CBC0A6' },
  { id: 'sand', label: 'Beige', value: '#C7A878', shade: '#A98A5E' },
  { id: 'brown', label: 'Brown', value: '#7A5236', shade: '#5E3E28' },
  { id: 'chocolate', label: 'Chocolate', value: '#4A2E20', shade: '#352016' },
  { id: 'grey', label: 'Grey', value: '#8C8C92', shade: '#6C6C72' },
  { id: 'charcoal', label: 'Charcoal', value: '#3A3A40', shade: '#2A2A2F' },
  { id: 'navy', label: 'Navy', value: '#2C4A6E', shade: '#1F3853' },
  { id: 'royal-blue', label: 'Royal blue', value: '#2B4FC2', shade: '#1F3A94' },
  { id: 'sky', label: 'Sky blue', value: '#5B87A8', shade: '#476B87' },
  { id: 'olive', label: 'Olive', value: '#6B6B36', shade: '#525228' },
  { id: 'forest', label: 'Forest green', value: '#1F5138', shade: '#173C2A' },
  { id: 'emerald', label: 'Emerald', value: '#1E8A5C', shade: '#166846' },
  { id: 'mint', label: 'Mint', value: '#A6DDC2', shade: '#84BDA2' },
  { id: 'rose', label: 'Burgundy', value: '#8E3449', shade: '#6E2738' },
  { id: 'red', label: 'Red', value: '#C92B2B', shade: '#9C2020' },
  { id: 'clay', label: 'Orange', value: '#C8591C', shade: '#9E4514' },
  { id: 'yellow', label: 'Yellow', value: '#EFCB3A', shade: '#C9A829' },
  { id: 'mustard', label: 'Mustard', value: '#C99A2E', shade: '#A17A22' },
  { id: 'pink', label: 'Pink', value: '#E890AE', shade: '#C4718E' },
  { id: 'lavender', label: 'Lavender', value: '#B9A6E0', shade: '#9886BE' },
  { id: 'purple', label: 'Purple', value: '#6A3FA8', shade: '#512F82' },
  { id: 'teal', label: 'Teal', value: '#1F7A7A', shade: '#175E5E' },
  { id: 'turquoise', label: 'Turquoise', value: '#3CC2C2', shade: '#2D9B9B' },
];

// Eye colors: the iris of the model's eye texture is recoloured to these.
export const EYE_COLORS: { id: string; label: string; value: string }[] = [
  { id: 'natural', label: 'Natural brown', value: '#8A5A3A' },
  { id: 'black', label: 'Black', value: '#2A2422' },
  { id: 'dark-brown', label: 'Dark brown', value: '#4A2E1E' },
  { id: 'brown', label: 'Brown', value: '#6E4426' },
  { id: 'honey', label: 'Honey brown', value: '#A8742E' },
  { id: 'amber', label: 'Amber', value: '#C98A24' },
  { id: 'hazel', label: 'Hazel', value: '#8E7A3A' },
  { id: 'light-hazel', label: 'Light hazel', value: '#B09A54' },
  { id: 'green', label: 'Green', value: '#4E9A4A' },
  { id: 'olive', label: 'Olive green', value: '#77843A' },
  { id: 'emerald', label: 'Emerald', value: '#1F9A62' },
  { id: 'mint', label: 'Mint green', value: '#7FD0A8' },
  { id: 'blue', label: 'Blue', value: '#3B7BD9' },
  { id: 'light-blue', label: 'Light blue', value: '#7FB4EE' },
  { id: 'sky', label: 'Sky blue', value: '#5FC0F0' },
  { id: 'ocean', label: 'Ocean blue', value: '#1F6FA8' },
  { id: 'navy', label: 'Navy blue', value: '#2A3F86' },
  { id: 'grey', label: 'Grey', value: '#8A9099' },
  { id: 'silver', label: 'Silver', value: '#BFC6CE' },
  { id: 'blue-grey', label: 'Blue-grey', value: '#7C94AE' },
  { id: 'green-grey', label: 'Green-grey', value: '#8A9E90' },
  { id: 'violet', label: 'Violet', value: '#8A5ACF' },
];

export const BG_STYLES: { id: string; label: string; from: string; to: string }[] = [
  { id: 'studio', label: 'Studio', from: '#9DA2AA', to: '#E4E6EA' },
  { id: 'studio-dark', label: 'Dark studio', from: '#17181C', to: '#4A4E57' },
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
  if (isHex(id)) return { id, label: 'Custom', base: id, shade: darken(id, 0.1) };
  return SKIN_TONES.find((t) => t.id === id) ?? SKIN_TONES.find((t) => t.id === 'tan-3')!;
}

export function hairColor(id: string): string {
  if (isHex(id)) return id;
  return HAIR_COLORS.find((c) => c.id === id)?.value ?? '#3D2A1B';
}

function cloth(id: string, fallback: string) {
  if (isHex(id)) return { id, label: 'Custom', value: id, shade: darken(id, 0.25) };
  return OUTFIT_COLORS.find((c) => c.id === id) ?? OUTFIT_COLORS.find((c) => c.id === fallback)!;
}

export function outfitColor(id: string) {
  return cloth(id, 'forest');
}

export function pantsColor(id: string) {
  return cloth(id, 'navy');
}

/** Iris colour. */
export function eyeColor(id: string): string {
  if (isHex(id)) return id;
  return EYE_COLORS.find((c) => c.id === id)?.value ?? EYE_COLORS[0].value;
}

export function bgStyle(id: string) {
  return BG_STYLES.find((b) => b.id === id) ?? BG_STYLES[0];
}
