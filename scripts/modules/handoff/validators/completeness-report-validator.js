/**
 * Completeness Report Validator
 * Part of LEO Protocol Gate Q Validation (7-element)
 *
 * Validates that completeness report has phase, score, and status.
 */

/**
 * Validate completeness report is valid
 * @param {object} context - Validation context with handoff
 * @returns {Promise<object>} Validation result
 */
export async function validateCompletenessReport(context) {
  const { handoff } = context;
  const report = handoff?.completeness_report || {};
  const issues = [];
  const warnings = [];

  // Check required fields
  if (!report.phase) {
    issues.push('completeness_report missing phase');
  }

  if (report.score === undefined) {
    issues.push('completeness_report missing score');
  } else if (typeof report.score !== 'number') {
    warnings.push('completeness_report.score should be a number');
  }

  if (!report.status) {
    issues.push('completeness_report missing status');
  }

  // Calculate score
  const fieldCount = [report.phase, report.score !== undefined, report.status].filter(Boolean).length;
  const score = Math.round((fieldCount / 3) * 100);

  return {
    passed: issues.length === 0,
    score: issues.length === 0 ? 100 : score,
    max_score: 100,
    issues,
    warnings,
    details: {
      hasPhase: !!report.phase,
      hasScore: report.score !== undefined,
      hasStatus: !!report.status,
      phase: report.phase,
      score: report.score,
      status: report.status
    }
  };
}
