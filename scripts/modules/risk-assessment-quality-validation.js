/**
 * RISK ASSESSMENT QUALITY VALIDATION MODULE
 *
 * Validates risk assessment quality to ensure assessments contain
 * evidence-based analysis rather than default/lazy assessments.
 *
 * NOTE: The RISK sub-agent generates detailed rationales during execution,
 * but only stores scores (1-10) and JSONB arrays (critical_issues, warnings,
 * recommendations) in the database. This validation detects:
 * 1. All-minimum scores (1,1,1,1,1,1) with no critical_issues/warnings
 * 2. Empty or boilerplate recommendations
 * 3. Suspiciously uniform assessments (all same score)
 *
 * @module risk-assessment-quality-validation
 * @version 1.1.0
 * @see SD-CAPABILITY-LIFECYCLE-001 - LEO Protocol quality improvements
 */

// ============================================
// BOILERPLATE DETECTION PATTERNS
// ============================================

// Generic boilerplate phrases in recommendations
const BOILERPLATE_RECOMMENDATIONS = [
  'follow best practices',
  'standard testing procedures',
  'code review',
  'monitor and adjust',
  'will be addressed during implementation',
  'to be determined',
  'implement according to standards',
  'use established patterns',
  'standard implementation'
];

// Generic boilerplate in critical_issues/warnings
const BOILERPLATE_ISSUES = [
  'no significant issues identified',
  'standard implementation',
  'no special requirements',
  'minimal risk',
  'routine feature',
  'straightforward',
  'basic implementation'
];

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if a text string is boilerplate
 * @param {string} text - The text to check
 * @param {Array<string>} patterns - Boilerplate patterns
 * @returns {boolean} True if text is boilerplate
 */
function isBoilerplate(text, patterns) {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return patterns.some(bp => normalized.includes(bp.toLowerCase()));
}

/**
 * Validate a single risk assessment for quality
 * @param {Object} assessment - Risk assessment object from database
 * @returns {Object} { valid: boolean, issues: array, warnings: array, score: number }
 */
export function validateRiskAssessmentQuality(assessment) {
  const issues = [];  // Blocking issues
  const warnings = [];  // Non-blocking but logged
  let score = 100;

  const assessmentId = assessment.id || assessment.sd_id || 'Unknown';

  // ============================================
  // 1. CHECK FOR OVERALL ASSESSMENT PRESENCE
  // ============================================
  if (!assessment || Object.keys(assessment).length === 0) {
    issues.push(`${assessmentId}: Risk assessment is empty or missing`);
    return { assessment_id: assessmentId, valid: false, issues, warnings, score: 0, boilerplateDetails: {} };
  }

  // ============================================
  // 2. CHECK FOR ALL-MINIMUM SCORES (Lazy Assessment)
  // ============================================
  const domainScores = {
    technical_complexity: assessment.technical_complexity,
    security_risk: assessment.security_risk,
    performance_risk: assessment.performance_risk,
    integration_risk: assessment.integration_risk,
    data_migration_risk: assessment.data_migration_risk,
    ui_ux_risk: assessment.ui_ux_risk
  };

  const validScores = Object.values(domainScores).filter(s => s !== null && s !== undefined);
  const allMinimum = validScores.length > 0 && validScores.every(s => s === 1);
  const allSame = validScores.length > 0 && new Set(validScores).size === 1;
  const averageScore = validScores.length > 0
    ? validScores.reduce((a, b) => a + b, 0) / validScores.length
    : 0;

  // Flag all-minimum scores with no supporting evidence
  const criticalIssues = assessment.critical_issues || [];
  const warningsList = assessment.warnings || [];
  const recommendations = assessment.recommendations || [];

  if (allMinimum && criticalIssues.length === 0 && warningsList.length === 0) {
    issues.push(`${assessmentId}: All risk scores are minimum (1) with no critical issues or warnings - lazy assessment`);
    score -= 40;
  } else if (allSame && averageScore < 3) {
    warnings.push(`${assessmentId}: All risk scores are identical (${validScores[0]}) - potentially unconsidered assessment`);
    score -= 15;
  }

  // ============================================
  // 3. CHECK CRITICAL ISSUES AND WARNINGS
  // ============================================
  if (assessment.risk_level && ['HIGH', 'CRITICAL'].includes(assessment.risk_level)) {
    // High/Critical risk should have issues or warnings
    if (criticalIssues.length === 0 && warningsList.length === 0) {
      issues.push(`${assessmentId}: ${assessment.risk_level} risk level but no critical issues or warnings documented`);
      score -= 20;
    }
  }

  // Check for boilerplate in critical_issues
  const boilerplateIssues = criticalIssues.filter(issue => {
    const text = typeof issue === 'string' ? issue : (issue.issue || issue.text || JSON.stringify(issue));
    return isBoilerplate(text, BOILERPLATE_ISSUES);
  });

  if (boilerplateIssues.length > 0 && boilerplateIssues.length === criticalIssues.length) {
    warnings.push(`${assessmentId}: All critical_issues are boilerplate text`);
    score -= 10;
  }

  // ============================================
  // 4. CHECK RECOMMENDATIONS
  // ============================================
  if (recommendations.length === 0 && assessment.risk_level !== 'LOW') {
    issues.push(`${assessmentId}: No recommendations for ${assessment.risk_level || 'non-LOW'} risk level`);
    score -= 15;
  }

  // Check for boilerplate recommendations
  const boilerplateRecs = recommendations.filter(rec => {
    const text = typeof rec === 'string' ? rec : (rec.recommendation || rec.text || JSON.stringify(rec));
    return isBoilerplate(text, BOILERPLATE_RECOMMENDATIONS);
  });

  if (boilerplateRecs.length > 0) {
    const boilerplatePercent = Math.round((boilerplateRecs.length / recommendations.length) * 100);
    if (boilerplatePercent >= 75) {
      issues.push(`${assessmentId}: ${boilerplatePercent}% of recommendations are boilerplate`);
      score -= 20;
    } else if (boilerplatePercent >= 50) {
      warnings.push(`${assessmentId}: ${boilerplatePercent}% of recommendations are boilerplate`);
      score -= 10;
    }
  }

  // ============================================
  // 5. CHECK VERDICT CONSISTENCY
  // ============================================
  if (assessment.verdict === 'PASS' && assessment.risk_level === 'CRITICAL') {
    issues.push(`${assessmentId}: Verdict is PASS but risk level is CRITICAL - inconsistent`);
    score -= 15;
  }

  if (assessment.verdict === 'FAIL' && assessment.risk_level === 'LOW') {
    warnings.push(`${assessmentId}: Verdict is FAIL but risk level is LOW - may need review`);
    score -= 5;
  }

  // ============================================
  // 6. CHECK CONFIDENCE SCORE
  // ============================================
  if (assessment.confidence !== null && assessment.confidence !== undefined) {
    if (assessment.confidence < 50 && assessment.verdict !== 'ESCALATE') {
      warnings.push(`${assessmentId}: Low confidence (${assessment.confidence}%) but verdict is not ESCALATE`);
      score -= 5;
    }

    if (assessment.confidence === 100 && allMinimum) {
      issues.push(`${assessmentId}: 100% confidence with all minimum scores - suspiciously overconfident`);
      score -= 15;
    }
  }

  return {
    assessment_id: assessmentId,
    valid: issues.length === 0,
    issues,
    warnings,
    score: Math.max(0, score),
    boilerplateDetails: {
      all_minimum_scores: allMinimum,
      all_same_scores: allSame,
      average_score: averageScore.toFixed(1),
      critical_issues_count: criticalIssues.length,
      warnings_count: warningsList.length,
      recommendations_count: recommendations.length,
      boilerplate_recommendations: boilerplateRecs.length,
      boilerplate_percentage: recommendations.length > 0
        ? Math.round((boilerplateRecs.length / recommendations.length) * 100)
        : 0
    }
  };
}

/**
 * Validate risk assessment for handoff readiness
 * @param {Object} assessment - Risk assessment object
 * @param {Object} options - Validation options
 * @param {number} options.minimumScore - Minimum score required (default: 70)
 * @param {number} options.maxBoilerplatePercent - Maximum boilerplate allowed (default: 50)
 * @param {boolean} options.blockOnWarnings - Whether to block on warnings (default: false)
 * @returns {Object} Validation result for handoff
 */
export function validateRiskAssessmentForHandoff(assessment, options = {}) {
  const {
    minimumScore = 70,
    maxBoilerplatePercent = 50,
    blockOnWarnings = false
  } = options;

  const result = {
    valid: true,
    assessment_id: assessment?.id || assessment?.sd_id || 'Unknown',
    score: 0,
    minimumScore,
    issues: [],
    warnings: [],
    qualityDetails: null
  };

  if (!assessment) {
    result.valid = false;
    result.issues.push('Risk assessment object is null or undefined');
    return result;
  }

  // Run quality validation
  const qualityResult = validateRiskAssessmentQuality(assessment);
  result.qualityDetails = qualityResult;
  result.score = qualityResult.score;
  result.issues = qualityResult.issues;
  result.warnings = qualityResult.warnings;

  // Check if valid based on issues
  if (qualityResult.issues.length > 0) {
    result.valid = false;
  }

  // Check minimum score
  if (qualityResult.score < minimumScore) {
    result.valid = false;
    result.issues.push(`Risk assessment quality score (${qualityResult.score}%) is below minimum (${minimumScore}%)`);
  }

  // Check boilerplate percentage
  const boilerplatePercent = qualityResult.boilerplateDetails?.boilerplate_percentage || 0;
  if (boilerplatePercent > maxBoilerplatePercent) {
    result.valid = false;
    result.issues.push(`Boilerplate percentage (${boilerplatePercent}%) exceeds maximum allowed (${maxBoilerplatePercent}%)`);
  }

  // Check warnings if blocking
  if (blockOnWarnings && qualityResult.warnings.length > 0) {
    result.valid = false;
  }

  // Generate summary
  result.summary = generateValidationSummary(result);

  return result;
}

/**
 * Generate human-readable validation summary
 */
function generateValidationSummary(result) {
  const lines = [];

  lines.push('Risk Assessment Quality Validation');
  lines.push(`   Assessment: ${result.assessment_id}`);
  lines.push(`   Score: ${result.score}% (minimum: ${result.minimumScore}%)`);
  lines.push(`   Status: ${result.valid ? 'PASSED' : 'FAILED'}`);

  if (result.qualityDetails?.boilerplateDetails) {
    const bd = result.qualityDetails.boilerplateDetails;
    lines.push('   Analysis:');
    lines.push(`     - Average Risk Score: ${bd.average_score}/10`);
    lines.push(`     - All Minimum Scores: ${bd.all_minimum_scores ? 'YES (suspicious)' : 'No'}`);
    lines.push(`     - Critical Issues: ${bd.critical_issues_count}`);
    lines.push(`     - Warnings: ${bd.warnings_count}`);
    lines.push(`     - Recommendations: ${bd.recommendations_count} (${bd.boilerplate_percentage}% boilerplate)`);
  }

  if (result.issues.length > 0) {
    lines.push(`   Blocking Issues: ${result.issues.length}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`   Warnings: ${result.warnings.length}`);
  }

  return lines.join('\n');
}

/**
 * Get improvement guidance for failed risk assessment validation
 * @param {Object} validationResult - Result from validateRiskAssessmentForHandoff
 * @returns {Object} Improvement guidance
 */
export function getRiskAssessmentImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '15-30 minutes',
    instructions: ''
  };

  const boilerplateDetails = validationResult.qualityDetails?.boilerplateDetails;

  // Analyze issues
  if (boilerplateDetails?.all_minimum_scores) {
    guidance.required.push('Re-run RISK sub-agent with more detailed SD/PRD context');
    guidance.required.push('Review SD requirements to identify actual risk factors');
    guidance.required.push('Document specific risks in critical_issues or warnings arrays');
  }

  if (validationResult.issues.some(i => i.includes('recommendations'))) {
    guidance.required.push('Add specific, actionable mitigation recommendations');
    guidance.required.push('Each recommendation should reference concrete actions, not generic "follow best practices"');
  }

  if (validationResult.issues.some(i => i.includes('critical issues or warnings'))) {
    guidance.required.push('Document specific risks even for HIGH/CRITICAL assessments');
    guidance.required.push('Add warnings array with potential concerns');
  }

  if (validationResult.issues.some(i => i.includes('inconsistent'))) {
    guidance.required.push('Review verdict vs risk_level consistency');
    guidance.required.push('Adjust verdict or provide justification in recommendations');
  }

  // Recommendations from warnings
  if (validationResult.warnings.some(w => w.includes('identical'))) {
    guidance.recommended.push('Review each risk domain individually for differentiated scores');
  }

  if (validationResult.warnings.some(w => w.includes('boilerplate'))) {
    guidance.recommended.push('Replace generic recommendations with SD-specific mitigations');
  }

  if (validationResult.warnings.some(w => w.includes('confidence'))) {
    guidance.recommended.push('Adjust confidence score based on assessment quality');
  }

  // Time estimate based on issues
  const totalIssues = validationResult.issues.length;
  if (totalIssues <= 2) {
    guidance.timeEstimate = '10-15 minutes';
  } else if (totalIssues <= 5) {
    guidance.timeEstimate = '15-30 minutes';
  } else {
    guidance.timeEstimate = '30-60 minutes';
  }

  guidance.instructions = `Risk assessment quality score is ${validationResult.score}% (minimum ${validationResult.minimumScore}%). ` +
    'Focus on adding specific risk documentation and replacing boilerplate recommendations. ' +
    'Re-run RISK sub-agent with detailed context if all scores are minimum.';

  return guidance;
}

export default {
  validateRiskAssessmentQuality,
  validateRiskAssessmentForHandoff,
  getRiskAssessmentImprovementGuidance
};
