/**
 * Key Decisions Validator
 * Part of LEO Protocol Gate Q Validation (7-element)
 *
 * Validates that key decisions are documented with rationale.
 */

/**
 * Validate key decisions are documented
 * @param {object} context - Validation context with handoff
 * @returns {Promise<object>} Validation result
 */
export async function validateKeyDecisions(context) {
  const { handoff } = context;
  const decisions = handoff?.key_decisions || [];

  if (!decisions || decisions.length === 0) {
    return {
      passed: false,
      score: 50,
      max_score: 100,
      issues: ['No key decisions documented'],
      warnings: [],
      details: { count: 0 }
    };
  }

  // Check quality of decisions
  const hasRationale = decisions.filter(d => {
    if (typeof d === 'string') return d.length > 20;
    if (typeof d === 'object') return d.rationale || d.reason || d.description;
    return false;
  });

  const quality = hasRationale.length / decisions.length;

  return {
    passed: true,
    score: Math.round(quality * 100),
    max_score: 100,
    issues: [],
    warnings: quality < 1 ? [`${decisions.length - hasRationale.length} decisions may need rationale`] : [],
    details: {
      count: decisions.length,
      withRationale: hasRationale.length,
      quality: Math.round(quality * 100)
    }
  };
}
