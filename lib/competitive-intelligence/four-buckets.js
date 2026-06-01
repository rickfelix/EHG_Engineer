/**
 * Four-Buckets Epistemic Tagging — Canonical Layer
 * SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A (Phase 1 data spine)
 *
 * Ported out of lib/research/competitor-intelligence.js so the epistemic
 * tagging is OWNED by the canonical competitive-intelligence layer rather than
 * a single analysis path. competitor-intelligence.js now imports from here, so
 * there is exactly one owner of FACT/ASSUMPTION/SIMULATION/UNKNOWN semantics.
 *
 * These are pure functions (no I/O, no `this`) — safe to unit-test in isolation
 * and reuse from any competitor data source (teardown worker, differentiation
 * research, discovery).
 */

// Four Buckets classification for epistemic honesty.
export const FOUR_BUCKETS = {
  FACT: 'fact', // Verified from source
  ASSUMPTION: 'assumption', // Reasonable inference
  SIMULATION: 'simulation', // AI-generated projection
  UNKNOWN: 'unknown', // Cannot determine
};

/**
 * Extract the value from a bucket-structured field ({ value, bucket }) or a
 * plain scalar.
 * @param {*} field
 * @returns {*} the underlying value, or null
 */
export function extractValue(field) {
  if (!field) return null;
  return typeof field === 'object' ? field.value : field;
}

/**
 * Walk an analysis object and collect every leaf tagged with the given bucket.
 * @param {Object} analysis - the raw AI analysis tree
 * @param {string} bucket - one of FOUR_BUCKETS values
 * @returns {Array<{path: string, value: *, evidence: *}>}
 */
export function extractByBucket(analysis, bucket) {
  const items = [];

  const traverse = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;

    if (obj.bucket && obj.bucket.toUpperCase() === bucket.toUpperCase()) {
      items.push({
        path,
        value: obj.value,
        evidence: obj.evidence || obj.reasoning,
      });
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, i) => traverse(item, `${path}[${i}]`));
    } else {
      Object.entries(obj).forEach(([key, value]) => {
        traverse(value, path ? `${path}.${key}` : key);
      });
    }
  };

  traverse(analysis);
  return items;
}

/**
 * Structure a raw AI competitor analysis into the canonical Four-Buckets shape.
 * Behaviour is byte-identical to the original
 * CompetitorIntelligenceService.structureWithFourBuckets so existing callers
 * (opportunity-discovery, the dead Express route) keep getting the same shape.
 *
 * @param {Object} analysis - raw AI analysis (with per-leaf {value, bucket})
 * @param {string} url - the competitor URL (used for fallback naming)
 * @returns {Object} structured analysis with four_buckets + competitive_intelligence + quality
 */
export function structureWithFourBuckets(analysis, url) {
  const domain = new URL(url).hostname.replace('www.', '');

  // Extract venture suggestion for the API response
  const suggestion = analysis.venture_suggestion || {};

  return {
    // Standard API response fields (for backward compatibility)
    name: extractValue(suggestion.name) || `${domain.split('.')[0].toUpperCase()} Alternative`,
    problem_statement:
      extractValue(suggestion.problem_statement) ||
      `Compete with ${domain} by addressing their market gaps`,
    solution:
      extractValue(suggestion.solution) ||
      'Differentiated platform addressing competitor weaknesses',
    target_market:
      extractValue(suggestion.target_market) || "Underserved segments of competitor's market",
    competitor_reference: url,

    // Four Buckets classified data
    four_buckets: {
      facts: extractByBucket(analysis, FOUR_BUCKETS.FACT),
      assumptions: extractByBucket(analysis, FOUR_BUCKETS.ASSUMPTION),
      simulations: extractByBucket(analysis, FOUR_BUCKETS.SIMULATION),
      unknowns: extractByBucket(analysis, FOUR_BUCKETS.UNKNOWN),
    },

    // Full competitive intelligence
    competitive_intelligence: {
      company: analysis.company,
      product: analysis.product,
      market: analysis.market,
      swot: {
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        opportunities: analysis.opportunities,
      },
    },

    // Quality metrics
    quality: {
      confidence_score: analysis.confidence_score || 0.5,
      data_quality: analysis.data_quality || 'medium',
      analysis_notes: analysis.analysis_notes,
    },
  };
}
