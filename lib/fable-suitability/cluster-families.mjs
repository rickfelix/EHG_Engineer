/**
 * cluster-families.mjs — per-duty-cluster axis families.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-B (FR-4).
 *
 * Each kind of Fable work is best ranked by DIFFERENT signals: a flaky-RCA candidate is mostly
 * about recurrence (how often it re-breaks), while an architecture-refactor is mostly about
 * centrality (how much depends on it). A family supplies per-axis WEIGHTS applied when mapping raw
 * signals into the 1-5 band, so the same region can score differently under different duty clusters.
 *
 * Weights are relative multipliers within an axis's own signal blend — they never change the axis
 * range (still 1-5) and never let one axis substitute for another (the composite stays multiplicative,
 * so the anti-gaming floor in score-region is unaffected). Pure data + a lookup; no DB, no model.
 */

export const DUTY_CLUSTERS = ['architecture-refactor', 'dedup', 'flaky-RCA', 'harness-depth'];

/**
 * Per-family signal weights. Each block sums to ~1.0 within an axis so the weighting is a
 * re-balancing of that axis's own inputs, not an inflation.
 *   impact:      { centrality, fanOut, crossRepo }   (structural — score-impact)
 *   opportunity: { recurrence, bypass, failurePatterns, nthConsumer } (recurrence — score-opportunity)
 *   reasoningDepth: { blastRadius, lookAhead }        (judgment — score-reasoning-depth rubric hint)
 */
const FAMILIES = {
  'architecture-refactor': {
    impact: { centrality: 0.6, fanOut: 0.3, crossRepo: 0.1 },
    opportunity: { recurrence: 0.3, bypass: 0.2, failurePatterns: 0.2, nthConsumer: 0.3 },
    reasoningDepth: { blastRadius: 0.7, lookAhead: 0.3 },
  },
  dedup: {
    impact: { centrality: 0.3, fanOut: 0.3, crossRepo: 0.4 },
    opportunity: { recurrence: 0.25, bypass: 0.15, failurePatterns: 0.2, nthConsumer: 0.4 },
    reasoningDepth: { blastRadius: 0.4, lookAhead: 0.6 },
  },
  'flaky-RCA': {
    impact: { centrality: 0.4, fanOut: 0.4, crossRepo: 0.2 },
    opportunity: { recurrence: 0.55, bypass: 0.25, failurePatterns: 0.15, nthConsumer: 0.05 },
    reasoningDepth: { blastRadius: 0.5, lookAhead: 0.5 },
  },
  'harness-depth': {
    impact: { centrality: 0.5, fanOut: 0.35, crossRepo: 0.15 },
    opportunity: { recurrence: 0.35, bypass: 0.35, failurePatterns: 0.2, nthConsumer: 0.1 },
    reasoningDepth: { blastRadius: 0.55, lookAhead: 0.45 },
  },
};

/** Return the axis-weight family for a duty cluster. Throws on an unknown cluster (fail loud). */
export function getFamily(dutyCluster) {
  const family = FAMILIES[dutyCluster];
  if (!family) {
    throw new Error(`getFamily: unknown duty_cluster "${dutyCluster}" (expected one of ${DUTY_CLUSTERS.join(', ')})`);
  }
  return family;
}
