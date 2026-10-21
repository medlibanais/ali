// Rule-based intent routing for the coach. Runs BEFORE any LLM call:
// safety intents must never reach a generative model, and out-of-scope
// requests must be declined deterministically, not by prompt luck.

export type CoachIntent =
  | 'crisis'
  | 'health_symptom'
  | 'out_of_scope'
  | 'small_talk'
  | 'general';

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ')} `;
}

const CRISIS_RE =
  /(suicid|kill (myself|me)|end (my|it) (life|all)|self.?harm|want to die|wanna die|don'?t want to (live|be here)|no reason to (live|go on)|better off without me|cut(ting)? myself)/;

const SYMPTOM_RE =
  /(dizz|nausea|vomit|throw(ing)? up|headache|head (hurt|ache|pain)|migraine|fever|temperature|chest (pain|tight)|can'?t breathe|breathless|faint|blackout|stomach ?ache|belly|cramp|sprain|injur|broken (arm|leg|bone)|insomnia|can'?t sleep|panic attack|anxious|anxiety attack|feel(ing)? (sick|ill|awful|terrible|horrible)|(i|my|im) (sick|ill)|body (hurt|ache)|sore throat|toothache|back ?pain|depressed|depression)/;

const OUT_OF_SCOPE_RE =
  /(medication|medicine|dosage|dose of|prescri|antibiotic|ibuprofen|paracetamol|diagnos(e|is)|lawyer|sue |lawsuit|legal (advice|action)|contract review|invest|stocks?|shares|crypto|bitcoin|loan|mortgage|tax(es| return)?\b|insurance claim|will and testament)/;

const SMALL_TALK_RE =
  /^\W*(hi+|hey+|hello|salam|salaam|yo|good (morning|evening|afternoon|night)|how are you|how'?s it going|what'?s up|sup|thanks?|thank you|bye+|good ?night|ok|okay|yes|no)\W*$/;

export function classifyIntent(rawText: string): CoachIntent {
  const text = normalize(rawText);
  if (CRISIS_RE.test(text)) return 'crisis';
  if (SYMPTOM_RE.test(text)) return 'health_symptom';
  if (OUT_OF_SCOPE_RE.test(text)) return 'out_of_scope';
  if (SMALL_TALK_RE.test(text.trim())) return 'small_talk';
  return 'general';
}

// Deterministic safety responses. Warm, "we" voice, no gamification,
// no diagnosis, no shaming — and never more than 3 sentences.
export function safetyResponse(intent: CoachIntent): string {
  switch (intent) {
    case 'crisis':
      return 'I hear you, and I care about you more than any streak. Please reach out right now to someone you trust or to your local emergency services. We can pick this up whenever you are safe.';
    case 'health_symptom':
      return 'Sit down for a moment and sip some water — rest today, one light day changes nothing for us. If it is severe or does not pass, please see a doctor; I am not one and I will not guess. We will be here when you feel better.';
    case 'out_of_scope':
      return 'That is beyond what I can advise on — a qualified professional is the right call there. What I can do is help you become who we set out to be. Want to look at today\u2019s plan together?';
    case 'small_talk':
      return 'Good to hear from you. I am here, watching us become someone. What is on your mind?';
    default:
      return '';
  }
}
