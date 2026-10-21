// Rule-based intent routing for the coach. Runs BEFORE any LLM call:
// crisis and acute-medical messages must never reach a generative model,
// and clear professional-advice requests are declined deterministically.
//
// Everything else — greetings, "yes", "thanks", feeling tired or stressed,
// a headache before the gym — goes to the model, which has the history and
// a health rule in its prompt. Canned replies there made the coach feel
// like a vending machine (a "yes" to its own question got "Good to hear
// from you").

export type CoachIntent =
  | 'crisis'
  | 'health_symptom'
  | 'out_of_scope'
  | 'wellbeing'
  | 'general';

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ')} `;
}

const CRISIS_RE =
  /(suicid|kill (myself|me)|end (my|it) (life|all)|self.?harm|want to die|wanna die|don'?t want to (live|be here)|no reason to (live|go on)|better off without me|cut(ting)? myself)/;

// Acute red flags only: these get a fixed "stop and get help" reply.
const ACUTE_SYMPTOM_RE =
  /(chest (pain|tight)|can'?t breathe|cannot breathe|trouble breathing|faint(ed|ing)?\b|black(ed)? ?out|passed out|broken (arm|leg|bone|wrist|ankle)|cough(ing)? (up )?blood|vomit(ing)? blood|numb(ness)? (in )?(my )?(face|arm)|severe (pain|bleeding)|bleeding (a lot|heavily))/;

// Everyday wellbeing: handled by the model with a gentle-health rule.
const WELLBEING_RE =
  /(tired|exhausted|sick|ill\b|headache|migraine|fever|sore|cold\b|flu\b|stomach|cramp|injur|sprain|can'?t sleep|insomnia|stress|anxious|anxiety|overwhelm|burn(ed|t)? ?out|sad\b|down today|low energy|depress|lonely)/;

const OUT_OF_SCOPE_RE =
  /(dosage|dose of|how (much|many) (mg|ml|pills?)|prescri|antibiotic|ibuprofen|paracetamol|diagnos(e|is) me|lawyer|lawsuit|sue (him|her|them|my|the)|legal (advice|action)|contract review|stock market|which stocks?|buy (stocks?|shares|crypto|bitcoin)|invest(ing)? (my )?(money|savings) in|crypto(currency)? (tips|advice)|mortgage|tax return|file (my )?taxes|insurance claim)/;

export function classifyIntent(rawText: string): CoachIntent {
  const text = normalize(rawText);
  if (CRISIS_RE.test(text)) return 'crisis';
  if (ACUTE_SYMPTOM_RE.test(text)) return 'health_symptom';
  if (OUT_OF_SCOPE_RE.test(text)) return 'out_of_scope';
  if (WELLBEING_RE.test(text)) return 'wellbeing';
  return 'general';
}

/** Intents answered without the model. */
export function isDeterministic(intent: CoachIntent): boolean {
  return intent === 'crisis' || intent === 'health_symptom' || intent === 'out_of_scope';
}

// Deterministic safety responses. Warm, "we" voice, no gamification,
// no diagnosis, no shaming — and never more than 3 sentences.
export function safetyResponse(intent: CoachIntent): string {
  switch (intent) {
    case 'crisis':
      return 'I hear you, and I care about you more than any streak. Please reach out right now to someone you trust or to your local emergency services. We can pick this up whenever you are safe.';
    case 'health_symptom':
      return 'That sounds serious, so the quests can wait. Please get medical help now: call your local emergency number or have someone take you. I will be right here when you are okay.';
    case 'out_of_scope':
      return 'That is beyond what I can advise on — a qualified professional is the right call there. What I can do is help us become who we set out to be. Want to look at today’s plan together?';
    default:
      return '';
  }
}
