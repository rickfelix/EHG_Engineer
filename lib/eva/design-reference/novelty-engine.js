/**
 * Novelty Engine — Maps personality values to controlled randomness.
 *
 * Converts a personality descriptor or numeric value to a 0.0–1.0 scale,
 * capped at 0.5 to prevent excessive randomness in pattern selection.
 *
 * SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-C
 * @module lib/eva/design-reference/novelty-engine
 */

const PERSONALITY_MAP = {
  conservative: 0.1,
  balanced: 0.25,
  creative: 0.4,
  experimental: 0.5,
  wild: 0.5, // capped
};

const NOVELTY_CAP = 0.5;

/**
 * Map a personality value to a novelty score (0.0–0.5).
 *
 * @param {string|number} personality - Personality descriptor or numeric value
 * @returns {number} Novelty score between 0.0 and 0.5
 */
export function mapNovelty(personality) {
  if (typeof personality === 'number') {
    return Math.min(Math.max(personality, 0), NOVELTY_CAP);
  }

  const key = String(personality).toLowerCase().trim();
  return PERSONALITY_MAP[key] ?? 0.25; // default to balanced
}

export { NOVELTY_CAP, PERSONALITY_MAP };
