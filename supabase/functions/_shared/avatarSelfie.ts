// "Make it look like me": what the AI may answer and how its answer is
// checked. Pure TypeScript (no Deno APIs) so the app's Jest suite can
// check these ids against the avatar editor's own catalogs
// (mobile/src/lib/__tests__/selfieAvatar.test.ts). Keep the lists in sync
// with mobile/src/avatar/palettes.ts and wardrobe.ts.

export type SelfieField = 'sex' | 'skinTone' | 'hairStyle' | 'hairColor' | 'eyeColor' | 'glasses';

/** What the vision model is asked to return (ids from the lists below). */
export interface SelfieAvatarResult {
  sex: string;
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  eyeColor: string;
  glasses: string;
  /** Seen in the photo but the 3D avatar has no facial hair to show it. */
  facialHair: 'none' | 'stubble' | 'moustache' | 'beard';
}

export interface StoredSelfieResult extends SelfieAvatarResult {
  /** 'ai' when the photo was read, 'random' when we fell back. */
  source: 'ai' | 'random';
}

export const SELFIE_OPTIONS: Record<SelfieField, { id: string; label: string }[]> = {
  sex: [
    { id: 'female', label: 'Female body' },
    { id: 'male', label: 'Male body' },
  ],
  // Fair to deep, in order.
  skinTone: [
    { id: 'very-fair', label: 'Very fair' },
    { id: 'porcelain-1', label: 'Porcelain' },
    { id: 'ivory', label: 'Ivory' },
    { id: 'porcelain-2', label: 'Light peach' },
    { id: 'fair-beige', label: 'Fair beige' },
    { id: 'light-1', label: 'Warm ivory' },
    { id: 'light-neutral', label: 'Light neutral' },
    { id: 'light-olive', label: 'Light olive' },
    { id: 'light-2', label: 'Sand' },
    { id: 'golden-beige', label: 'Golden beige' },
    { id: 'tan-1', label: 'Warm beige' },
    { id: 'medium-beige', label: 'Medium beige' },
    { id: 'olive', label: 'Olive' },
    { id: 'tan-2', label: 'Honey' },
    { id: 'golden-tan', label: 'Golden tan' },
    { id: 'tan-3', label: 'Caramel' },
    { id: 'brown-1', label: 'Medium brown' },
    { id: 'chestnut', label: 'Chestnut' },
    { id: 'brown-2', label: 'Warm brown' },
    { id: 'deep-tan', label: 'Deep tan' },
    { id: 'brown-3', label: 'Dark brown' },
    { id: 'deep-1', label: 'Espresso' },
    { id: 'mahogany', label: 'Deep mahogany' },
    { id: 'deep-2', label: 'Rich ebony' },
  ],
  hairStyle: [
    { id: 'short01', label: 'Short textured' },
    { id: 'short02', label: 'Short side-swept' },
    { id: 'short03', label: 'Long fringe' },
    { id: 'short04', label: 'Cropped' },
    { id: 'bob01', label: 'Bob, covering one eye' },
    { id: 'bob02', label: 'Bob with side fringe' },
    { id: 'long01', label: 'Long' },
    { id: 'ponytail01', label: 'Ponytail' },
    { id: 'braid01', label: 'Layered with braid' },
    { id: 'blunt_bob', label: 'Blunt bob' },
    { id: 'blunt_bob_bangs', label: 'Blunt bob with bangs' },
    { id: 'inverted_bob', label: 'Inverted bob' },
    { id: 'inverted_bob_bangs', label: 'Inverted bob with bangs' },
    { id: 'curled_bob', label: 'Curled-under bob' },
    { id: 'curled_bob_bangs', label: 'Curled bob with bangs' },
    { id: 'straight_bangs', label: 'Straight with bangs' },
    { id: 'bobcut', label: 'Layered bob' },
    { id: 'wavy_long', label: 'Long waves' },
    { id: 'curly_bob', label: 'Curls' },
    { id: 'bun', label: 'Low bun' },
    { id: 'braid_bun', label: 'Braided bun' },
    { id: 'french_braid', label: 'French braid' },
    { id: 'double_braid', label: 'Double braid' },
    { id: 'slick', label: 'Slicked back' },
    { id: 'tousled', label: 'Tousled' },
    { id: 'spiky', label: 'Spiky' },
    { id: 'none', label: 'Shaved or bald' },
  ],
  hairColor: [
    { id: 'black', label: 'Jet black' },
    { id: 'near-black', label: 'Natural black' },
    { id: 'espresso', label: 'Dark brown' },
    { id: 'dark-brown', label: 'Chocolate brown' },
    { id: 'chestnut', label: 'Chestnut' },
    { id: 'medium-brown', label: 'Medium brown' },
    { id: 'light-brown', label: 'Light brown' },
    { id: 'auburn', label: 'Auburn' },
    { id: 'copper', label: 'Copper' },
    { id: 'ginger', label: 'Ginger' },
    { id: 'strawberry', label: 'Strawberry blonde' },
    { id: 'dirty-blonde', label: 'Dirty blonde' },
    { id: 'honey', label: 'Honey blonde' },
    { id: 'golden', label: 'Golden blonde' },
    { id: 'blonde', label: 'Blonde' },
    { id: 'ash-blonde', label: 'Ash blonde' },
    { id: 'platinum', label: 'Platinum blonde' },
    { id: 'gray', label: 'Grey' },
    { id: 'silver', label: 'Silver' },
    { id: 'white', label: 'White' },
    { id: 'burgundy', label: 'Burgundy' },
    { id: 'dark-red', label: 'Dark red' },
    { id: 'navy', label: 'Navy' },
    { id: 'blue', label: 'Blue' },
    { id: 'teal', label: 'Teal' },
    { id: 'green', label: 'Green' },
    { id: 'purple', label: 'Purple' },
    { id: 'pink', label: 'Pink' },
    { id: 'pastel-pink', label: 'Pastel pink' },
    { id: 'pastel-blue', label: 'Pastel blue' },
    { id: 'lavender', label: 'Pastel lavender' },
  ],
  eyeColor: [
    { id: 'black', label: 'Black' },
    { id: 'dark-brown', label: 'Dark brown' },
    { id: 'brown', label: 'Brown' },
    { id: 'honey', label: 'Honey brown' },
    { id: 'amber', label: 'Amber' },
    { id: 'hazel', label: 'Hazel' },
    { id: 'light-hazel', label: 'Light hazel' },
    { id: 'green', label: 'Green' },
    { id: 'olive', label: 'Olive green' },
    { id: 'blue', label: 'Blue' },
    { id: 'light-blue', label: 'Light blue' },
    { id: 'grey', label: 'Grey' },
    { id: 'blue-grey', label: 'Blue-grey' },
    { id: 'green-grey', label: 'Green-grey' },
  ],
  glasses: [
    { id: 'none', label: 'No glasses' },
    { id: 'glasses_rimless', label: 'Rimless' },
    { id: 'glasses_slim', label: 'Slim frames' },
    { id: 'glasses_bold', label: 'Bold or thick frames' },
    { id: 'glasses_aviator', label: 'Aviators' },
    { id: 'glasses_sunglasses', label: 'Sunglasses' },
  ],
};

const FACIAL_HAIR = ['none', 'stubble', 'moustache', 'beard'] as const;

function ids(field: SelfieField): string[] {
  return SELFIE_OPTIONS[field].map((o) => o.id);
}

function list(field: SelfieField): string {
  return SELFIE_OPTIONS[field].map((o) => `"${o.id}" (${o.label})`).join(', ');
}

export const SELFIE_SYSTEM_PROMPT = [
  'You look at one selfie and describe how to build a 3D avatar that resembles the person.',
  'Answer with one JSON object and nothing else, matching this TypeScript interface:',
  '{ sex: string; skinTone: string; hairStyle: string; hairColor: string; eyeColor: string; glasses: string; facialHair: "none" | "stubble" | "moustache" | "beard" }',
  'Every value must be one of the ids listed for that field. Pick the closest one; never invent ids.',
  `sex (which avatar body fits best): ${list('sex')}.`,
  `skinTone (judge the face in its lighting; fair to deep): ${list('skinTone')}.`,
  `hairStyle (if the hair is covered, e.g. by a hijab or cap, pick the closest visible shape or "long01"): ${list('hairStyle')}.`,
  `hairColor: ${list('hairColor')}.`,
  `eyeColor (use "brown" if you cannot tell): ${list('eyeColor')}.`,
  `glasses: ${list('glasses')}.`,
  'If the image shows no human face, answer {"error":"no_face"}.',
].join('\n');

/** Pull the first JSON object out of a model reply (some wrap it in prose or ```). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function pick(field: SelfieField, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (ids(field).includes(v)) return v;
  // Models sometimes answer with the label instead of the id.
  const byLabel = SELFIE_OPTIONS[field].find((o) => o.label.toLowerCase() === v.toLowerCase());
  return byLabel ? byLabel.id : null;
}

/**
 * Check a model answer. Returns null when it is unusable (no face, or the
 * core fields are missing); single bad optional fields fall back to safe
 * defaults instead of failing the whole answer.
 */
export function parseSelfieResult(raw: unknown): SelfieAvatarResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.error) return null;
  const sex = pick('sex', r.sex);
  const skinTone = pick('skinTone', r.skinTone);
  const hairStyle = pick('hairStyle', r.hairStyle);
  if (!sex || !skinTone || !hairStyle) return null;
  const facial = typeof r.facialHair === 'string' ? r.facialHair.trim().toLowerCase() : 'none';
  return {
    sex,
    skinTone,
    hairStyle,
    hairColor: pick('hairColor', r.hairColor) ?? 'espresso',
    eyeColor: pick('eyeColor', r.eyeColor) ?? 'brown',
    glasses: pick('glasses', r.glasses) ?? 'none',
    facialHair: (FACIAL_HAIR as readonly string[]).includes(facial)
      ? (facial as SelfieAvatarResult['facialHair'])
      : 'none',
  };
}

/** The fallback when the AI is down, rate-limited, too slow or unsure. */
export function randomSelfieResult(random: () => number = Math.random): SelfieAvatarResult {
  const any = (field: SelfieField) => {
    const options = ids(field);
    return options[Math.floor(random() * options.length)];
  };
  return {
    sex: any('sex'),
    skinTone: any('skinTone'),
    hairStyle: any('hairStyle'),
    // Natural colors only for a random start.
    hairColor: ids('hairColor').slice(0, 17)[Math.floor(random() * 17)],
    eyeColor: any('eyeColor'),
    glasses: random() < 0.75 ? 'none' : any('glasses'),
    facialHair: 'none',
  };
}
