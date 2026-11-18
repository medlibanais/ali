// gte-small cosine similarity is squeezed into a narrow band: unrelated
// sentences still score ~0.70-0.75, close matches ~0.85+. Showing the raw
// number would call everything "75% relevant", so map the useful band
// onto 0-100. Calibrated on the seeded quest library (see PR notes).
export const SIM_FLOOR = 0.74;
export const SIM_CEIL = 0.9;

export function relevanceFromSimilarity(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0;
  const t = (similarity - SIM_FLOOR) / (SIM_CEIL - SIM_FLOOR);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}
