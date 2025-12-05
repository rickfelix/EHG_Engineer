/**
 * PRD QUALITY VALIDATION MODULE (AI-POWERED)
 *
 * Uses AI-powered Russian Judge multi-criterion weighted scoring to validate
 * PRD quality during PLAN→EXEC handoff.
 *
 * Replaced keyword/pattern-based validation with semantic AI evaluation using gpt-5-mini.
 * All assessments stored in ai_quality_assessments table for meta-analysis.
 *
 * @module prd-quality-validation
 * @version 2.0.0 (AI-powered Russian Judge)
 * @see /database/migrations/20251205_ai_quality_assessments.sql
 */

import { PRDQualityRubric } from './rubrics/prd-quality-rubric.js';

// ============================================
// BOILERPLATE PATTERNS TO DETECT
// ============================================

// Placeholder text patterns (blocking)
const PLACEHOLDER_PATTERNS = [
  'to be defined',
  'to be determined',
  'tbd',
  'needs definition',
  'will be defined',
  'placeholder',
  'insert here',
  '[add',
  '[define',
  '[specify',
  'during planning',
  'during technical analysis',
  'based on sd objectives',
  'based on success metrics'
];

// Generic acceptance criteria (blocking)
const BOILERPLATE_ACCEPTANCE_CRITERIA = [
  'all functional requirements implemented',
  'all tests passing',
  'no regressions introduced',
  'code review completed',
  'documentation updated',
  'meets acceptance criteria',
  'user acceptance testing passed',
  'deployment readiness confirmed'
];

// Generic functional requirements (blocking)
const BOILERPLATE_REQUIREMENTS = [
  'to be defined based on sd objectives',
  'to be defined during planning',
  'to be defined during technical analysis',
  'implement the feature',
  'create the functionality',
  'add capability'
];

// Generic executive summary patterns (warning)
const GENERIC_SUMMARY_PATTERNS = [
  'this prd defines the technical requirements',
  'product requirements document for',
  'requirements for strategic directive'
];

// Generic test scenarios (blocking)
const BOILERPLATE_TEST_SCENARIOS = [
  'to be defined during planning',
  'verify it works',
  'test the feature',
  'ensure functionality',
  'confirm behavior',
  'validate implementation'
];

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if text contains placeholder patterns
 * @param {string} text - Text to check
 * @returns {boolean} True if placeholder found
 */
function containsPlaceholder(text) {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(pattern => normalized.includes(pattern));
}

/**
 * Check if text is boilerplate
 * @param {string} text - Text to check
 * @param {Array} patterns - Patterns to match
 * @returns {boolean} True if boilerplate found
 */
function isBoilerplate(text, patterns) {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return patterns.some(pattern => normalized.includes(pattern.toLowerCase()));
}

/**
 * Validate a single PRD for quality using AI-powered Russian Judge rubric
 * @param {Object} prd - PRD object from database
 * @returns {Promise<Object>} { valid: boolean, issues: array, warnings: array, score: number }
 */
export async function validatePRDQuality(prd) {
  const prdId = prd?.id || 'Unknown';

  // Basic presence check (fast-fail before AI call)
  if (!prd || Object.keys(prd).length === 0) {
    return {
      prd_id: prdId,
      valid: false,
      passed: false,
      score: 0,
      issues: [`${prdId}: PRD is empty or missing`],
      warnings: [],
      boilerplateDetails: {
        functional_requirements: { total: 0, placeholder: 0 },
        acceptance_criteria: { total: 0, boilerplate: 0 },
        test_scenarios: { total: 0, placeholder: 0 }
      }
    };
  }

  try {
    // Use AI-powered Russian Judge rubric
    const rubric = new PRDQualityRubric();
    const result = await rubric.validatePRDQuality(prd);

    // Convert to legacy format for backward compatibility
    return {
      prd_id: prdId,
      valid: result.passed,
      passed: result.passed,
      score: result.score,
      issues: result.issues,
      warnings: result.warnings,
      boilerplateDetails: {
        functional_requirements: {
          total: prd.functional_requirements?.length || 0,
          placeholder: 0  // AI detects semantically, not by pattern matching
        },
        acceptance_criteria: {
          total: prd.acceptance_criteria?.length || 0,
          boilerplate: 0
        },
        test_scenarios: {
          total: prd.test_scenarios?.length || 0,
          placeholder: 0
        }
      },
      details: result.details
    };
  } catch (error) {
    console.error(`PRD Quality Validation Error (${prdId}):`, error.message);

    // Fallback: return failed validation with error details
    return {
      prd_id: prdId,
      valid: false,
      passed: false,
      score: 0,
      issues: [`AI quality assessment failed: ${error.message}. Manual review required.`],
      warnings: ['OpenAI API error - check OPENAI_API_KEY environment variable'],
      boilerplateDetails: {
        functional_requirements: { total: prd.functional_requirements?.length || 0, placeholder: 0 },
        acceptance_criteria: { total: prd.acceptance_criteria?.length || 0, boilerplate: 0 },
        test_scenarios: { total: prd.test_scenarios?.length || 0, placeholder: 0 }
      },
      details: {
        error: error.message
      }
    };
  }
}

/**
 * Validate PRD for handoff readiness
 * @param {Object} prd - PRD object from database
 * @param {Object} options - Validation options
 * @param {number} options.minimumScore - Minimum score required (default: 70)
 * @param {boolean} options.blockOnWarnings - Whether to block on warnings (default: false)
 * @returns {Promise<Object>} Validation result for handoff (async now - calls AI)
 */
export async function validatePRDForHandoff(prd, options = {}) {
  const {
    minimumScore = 70,
    blockOnWarnings = false
  } = options;

  const result = {
    valid: true,
    prd_id: prd?.id || 'Unknown',
    score: 0,
    minimumScore,
    issues: [],
    warnings: [],
    qualityDetails: null
  };

  if (!prd) {
    result.valid = false;
    result.issues.push('PRD object is null or undefined');
    return result;
  }

  // Run quality validation
  const qualityResult = await validatePRDQuality(prd);
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
    result.issues.push(`PRD quality score (${qualityResult.score}%) is below minimum (${minimumScore}%)`);
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

  lines.push('PRD Quality Validation');
  lines.push(`   PRD: ${result.prd_id}`);
  lines.push(`   Score: ${result.score}% (minimum: ${result.minimumScore}%)`);
  lines.push(`   Status: ${result.valid ? 'PASSED' : 'FAILED'}`);

  if (result.qualityDetails?.boilerplateDetails) {
    const bd = result.qualityDetails.boilerplateDetails;
    lines.push('   Boilerplate Detection:');
    lines.push(`     - Functional Reqs: ${bd.functional_requirements.placeholder}/${bd.functional_requirements.total} placeholder`);
    lines.push(`     - Acceptance Criteria: ${bd.acceptance_criteria.boilerplate}/${bd.acceptance_criteria.total} boilerplate`);
    lines.push(`     - Test Scenarios: ${bd.test_scenarios.placeholder}/${bd.test_scenarios.total} placeholder`);
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
 * Get improvement guidance for failed PRD validation
 * @param {Object} validationResult - Result from validatePRDForHandoff
 * @returns {Object} Improvement guidance
 */
export function getPRDImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '30-60 minutes',
    instructions: ''
  };

  // Analyze issues
  const issueTypes = {
    executive_summary: validationResult.issues.filter(i => i.includes('Executive summary')),
    functional_requirements: validationResult.issues.filter(i => i.includes('functional requirements')),
    acceptance_criteria: validationResult.issues.filter(i => i.includes('acceptance criteria')),
    test_scenarios: validationResult.issues.filter(i => i.includes('test scenarios')),
    implementation: validationResult.issues.filter(i => i.includes('Implementation approach')),
    architecture: validationResult.issues.filter(i => i.includes('System architecture')),
    placeholders: validationResult.issues.filter(i => i.includes('placeholder'))
  };

  if (issueTypes.executive_summary.length > 0) {
    guidance.required.push('Write a specific executive summary describing the SD goals and approach (50+ chars)');
  }

  if (issueTypes.functional_requirements.length > 0) {
    guidance.required.push('Replace placeholder functional requirements with specific, measurable requirements');
    guidance.required.push('Ensure at least 3 real functional requirements (not "To be defined")');
  }

  if (issueTypes.acceptance_criteria.length > 0) {
    guidance.required.push('Add SD-specific acceptance criteria (not generic "all tests passing")');
    guidance.required.push('Each criterion should be testable and specific to this SD');
  }

  if (issueTypes.test_scenarios.length > 0) {
    guidance.required.push('Define specific test scenarios with expected inputs and outputs');
    guidance.required.push('Replace "To be defined" with actual test cases');
  }

  if (issueTypes.implementation.length > 0) {
    guidance.required.push('Document the implementation approach with specific steps and architecture decisions');
  }

  if (issueTypes.architecture.length > 0) {
    guidance.required.push('Define system architecture including components, data flow, and integration points');
  }

  // Recommendations from warnings
  const warningTypes = {
    risks: validationResult.warnings.filter(w => w.includes('risks')),
    generic: validationResult.warnings.filter(w => w.includes('generic'))
  };

  if (warningTypes.risks.length > 0) {
    guidance.recommended.push('Document at least 2-3 risks with mitigation strategies');
  }

  if (warningTypes.generic.length > 0) {
    guidance.recommended.push('Make executive summary more specific to this SD (avoid template language)');
  }

  // Time estimate based on issues
  const totalIssues = validationResult.issues.length;
  if (totalIssues <= 3) {
    guidance.timeEstimate = '15-30 minutes';
  } else if (totalIssues <= 6) {
    guidance.timeEstimate = '30-60 minutes';
  } else {
    guidance.timeEstimate = '1-2 hours';
  }

  guidance.instructions = `PRD quality score is ${validationResult.score}% (minimum ${validationResult.minimumScore}%). ` +
    'Focus on replacing placeholder text with specific, measurable content. ' +
    'Each requirement and test scenario should be unique to this SD.';

  return guidance;
}

export default {
  validatePRDQuality,
  validatePRDForHandoff,
  getPRDImprovementGuidance
};
