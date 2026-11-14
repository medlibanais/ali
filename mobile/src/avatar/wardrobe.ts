// What the realistic avatar can wear: hair, brows, outfits, shoes and
// glasses. Each id is a mesh in the model file (the same ids are listed
// in tools/human/catalog.py, which builds that file).

export type Sex = 'female' | 'male';

export interface WearItem {
  id: string;
  label: string;
  /** Cut for one body; missing means it fits both. */
  for?: Sex;
  /** Stored in gray, so it takes the colour the person picks. */
  tint?: boolean;
}

export const HAIR_STYLES: WearItem[] = [
  { id: 'short01', label: 'Short textured' },
  { id: 'short02', label: 'Short side-swept' },
  { id: 'short03', label: 'Long fringe' },
  { id: 'short04', label: 'Cropped' },
  { id: 'bob01', label: 'Bob, covering one eye' },
  { id: 'bob02', label: 'Bob with side fringe' },
  { id: 'long01', label: 'Long' },
  { id: 'ponytail01', label: 'Ponytail' },
  { id: 'braid01', label: 'Layered with braid' },
  { id: 'none', label: 'Shaved' },
];

export const BROW_STYLES: WearItem[] = [
  { id: 'brow1', label: 'Natural' },
  { id: 'brow2', label: 'Soft arch' },
  { id: 'brow3', label: 'Straight' },
  { id: 'brow4', label: 'Thick' },
  { id: 'brow5', label: 'High arch' },
  { id: 'brow6', label: 'Thin' },
  { id: 'brow7', label: 'Angled' },
  { id: 'brow8', label: 'Rounded' },
  { id: 'brow9', label: 'Bold' },
  { id: 'brow10', label: 'Tapered' },
  { id: 'brow11', label: 'Feathered' },
  { id: 'brow12', label: 'Short' },
];

export const LASH_STYLES: WearItem[] = [
  { id: 'lashes1', label: 'Natural' },
  { id: 'lashes2', label: 'Long' },
  { id: 'lashes3', label: 'Full' },
];

/** Whole outfits: top and bottom in one piece. 'separates' wears a top and a bottom instead. */
export const OUTFITS: WearItem[] = [
  { id: 'separates', label: 'Mix top and bottom' },
  { id: 'm_tee_jeans', label: 'T-shirt and jeans', for: 'male' },
  { id: 'm_white_tee', label: 'White tee and jeans', for: 'male' },
  { id: 'm_longsleeve', label: 'Long sleeve and jeans', for: 'male' },
  { id: 'm_shirt_jeans', label: 'Shirt and dark jeans', for: 'male' },
  { id: 'm_striped', label: 'Striped shirt', for: 'male' },
  { id: 'm_jacket', label: 'Field jacket', for: 'male' },
  { id: 'm_suit', label: 'Suit and tie', for: 'male' },
  { id: 'm_overalls', label: 'Overalls', for: 'male' },
  { id: 'f_tee_jeans', label: 'T-shirt and jeans', for: 'female' },
  { id: 'f_tee_shorts', label: 'T-shirt and shorts', for: 'female' },
  { id: 'f_blouse_skirt', label: 'Blouse and skirt', for: 'female' },
  { id: 'f_sport', label: 'Sports set', for: 'female' },
];

export const TOPS: WearItem[] = [
  { id: 'tee', label: 'T-shirt', tint: true },
  { id: 'fitted_tee', label: 'Fitted T-shirt', tint: true },
  { id: 'sweater', label: 'Knit sweater', for: 'male', tint: true },
  { id: 'tank', label: 'Printed tank', for: 'female' },
  { id: 'print_top', label: 'Animal print top', for: 'female' },
];

export const BOTTOMS: WearItem[] = [
  { id: 'trousers', label: 'Trousers', tint: true },
  { id: 'cargo', label: 'Cargo pants', tint: true },
];

export const SHOES: WearItem[] = [
  { id: 'shoes1', label: 'Leather shoes' },
  { id: 'shoes2', label: 'Sneakers' },
  { id: 'shoes3', label: 'Black boots' },
  { id: 'shoes4', label: 'Dark shoes' },
  { id: 'shoes5', label: 'Trainers' },
  { id: 'shoes6', label: 'Low sneakers' },
];

export const GLASSES: WearItem[] = [
  { id: 'none', label: 'None' },
  { id: 'glasses_rimless', label: 'Rimless' },
  { id: 'glasses_slim', label: 'Slim frames' },
  { id: 'glasses_bold', label: 'Bold frames' },
  { id: 'glasses_aviator', label: 'Aviators' },
  { id: 'glasses_sunglasses', label: 'Sunglasses' },
];

/** Face structure the body blends toward (MakeHuman's three families). */
export const FEATURES: { id: string; label: string; mix: [number, number, number] }[] = [
  { id: 'blend', label: 'Blend', mix: [1 / 3, 1 / 3, 1 / 3] },
  { id: 'european', label: 'European', mix: [1, 0, 0] },
  { id: 'asian', label: 'Asian', mix: [0, 1, 0] },
  { id: 'african', label: 'African', mix: [0, 0, 1] },
  { id: 'european-asian', label: 'European and Asian', mix: [0.5, 0.5, 0] },
  { id: 'european-african', label: 'European and African', mix: [0.5, 0, 0.5] },
  { id: 'asian-african', label: 'Asian and African', mix: [0, 0.5, 0.5] },
];

/** Body types by Elvaerwyn (MakeHuman), one list per body. */
export const BODY_TYPES: WearItem[] = [
  { id: 'none', label: 'From the sliders' },
  { id: 'fem-neat-hourglass', label: 'Neat hourglass', for: 'female' },
  { id: 'fem-full-hourglass', label: 'Full hourglass', for: 'female' },
  { id: 'fem-triangle', label: 'Pear', for: 'female' },
  { id: 'fem-invert-triangle', label: 'Inverted triangle', for: 'female' },
  { id: 'fem-rectangle', label: 'Rectangle', for: 'female' },
  { id: 'fem-lean-column', label: 'Lean column', for: 'female' },
  { id: 'fem-apple', label: 'Apple', for: 'female' },
  { id: 'fem-diamond', label: 'Diamond', for: 'female' },
  { id: 'man-trapezoid', label: 'Trapezoid', for: 'male' },
  { id: 'man-invert-triangle', label: 'Inverted triangle', for: 'male' },
  { id: 'man-rectangle', label: 'Rectangle', for: 'male' },
  { id: 'man-triangle', label: 'Triangle', for: 'male' },
  { id: 'man-lean-column', label: 'Lean column', for: 'male' },
  { id: 'man-apple', label: 'Apple', for: 'male' },
];

export function fits(item: WearItem, sex: Sex): boolean {
  return !item.for || item.for === sex;
}
