/**
 * Four Buckets Epistemic Classification - Parser
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-B (FR-3)
 *
 * Parses and normalizes the epistemicClassification array from LLM responses.
 * Validates bucket values against the allowed set (fact/assumption/simulation/unknown).
 * Returns normalized classifications + summary counts.
 *
 * @module lib/eva/utils/four-buckets-parser
 */

const VALID_BUCKETS = new Set(['fact', 'assumption', 'simulation', 'unknown']);

/**
 * Parse and normalize Four Buckets epistemic classification from LLM output.
 *
 * @param {Object} parsed - The parsed LLM response object
 * @param {Object} [options]
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {{ classifications: Array, summary: { facts: number, assumptions: number, simulations: number, unknowns: number } }}
 */
export function parseFourBuckets(parsed, { logger = console } = {}) {
  const raw = parsed?.epistemicClassification;

  if (!raw) {
    return {
      classifications: [],
      summary: { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 },
    };
  }

  if (!Array.isArray(raw)) {
    logger.warn('[FourBuckets] epistemicClassification is not an array, ignoring');
    return {
      classifications: [],
      summary: { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 },
    };
  }

  const classifications = [];
  const summary = { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 };

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;

    const claim = String(entry.claim || '').substring(0, 500);
    if (!claim) continue;

    let bucket = String(entry.bucket || '').toLowerCase().trim();
    if (!VALID_BUCKETS.has(bucket)) {
      logger.warn(`[FourBuckets] Invalid bucket "${entry.bucket}" for claim "${claim.substring(0, 60)}...", normalizing to unknown`);
      bucket = 'unknown';
    }

    const evidence = String(entry.evidence || '').substring(0, 1000);

    classifications.push({ claim, bucket, evidence });

    if (bucket === 'fact') summary.facts++;
    else if (bucket === 'assumption') summary.assumptions++;
    else if (bucket === 'simulation') summary.simulations++;
    else summary.unknowns++;
  }

  return { classifications, summary };
}
