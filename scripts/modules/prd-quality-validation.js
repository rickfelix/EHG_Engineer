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
import { getPRDQualityThresholdSync, THRESHOLD_PROFILES } from './sd-type-checker.js';

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

// Generic executive summary patterns (warning) - reserved for future validation
const _GENERIC_SUMMARY_PATTERNS = [
  'this prd defines the technical requirements',
  'product requirements document for',
  'requirements for strategic directive'
];

// Generic test scenarios (blocking) - reserved for future validation
const _BOILERPLATE_TEST_SCENARIOS = [
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
 * Fast heuristic validation for PRD (no AI calls)
 * @param {Object} prd - PRD object from database
 * @returns {Object} { valid: boolean, issues: array, warnings: array, score: number }
 */
function validatePRDHeuristic(prd) {
  const prdId = prd?.id || 'Unknown';
  const issues = [];
  const warnings = [];
  let score = 100;

  // Check functional requirements
  const funcReqs = prd.functional_requirements || [];
  if (!Array.isArray(funcReqs) || funcReqs.length < 3) {
    issues.push(`${prdId}: Insufficient functional requirements (${funcReqs.length}, min 3)`);
    score -= 15;
  } else {
    const placeholderReqs = funcReqs.filter(req => {
      const text = typeof req === 'string' ? req : (req.requirement || JSON.stringify(req));
      return containsPlaceholder(text) || isBoilerplate(text, BOILERPLATE_REQUIREMENTS);
    });
    if (placeholderReqs.length > 0) {
      issues.push(`${prdId}: ${placeholderReqs.length} placeholder/boilerplate requirements`);
      score -= 10 * placeholderReqs.length;
    }
  }

  // Check acceptance criteria
  const accCriteria = prd.acceptance_criteria || [];
  if (!Array.isArray(accCriteria) || accCriteria.length < 3) {
    issues.push(`${prdId}: Insufficient acceptance criteria (${accCriteria.length}, min 3)`);
    score -= 15;
  } else {
    const boilerplateAC = accCriteria.filter(ac => {
      const text = typeof ac === 'string' ? ac : (ac.criterion || JSON.stringify(ac));
      return isBoilerplate(text, BOILERPLATE_ACCEPTANCE_CRITERIA);
    });
    if (boilerplateAC.length > 0) {
      warnings.push(`${prdId}: ${boilerplateAC.length} boilerplate acceptance criteria`);
      score -= 5 * boilerplateAC.length;
    }
  }

  // Check test scenarios
  const testScenarios = prd.test_scenarios || [];
  if (!Array.isArray(testScenarios) || testScenarios.length < 3) {
    warnings.push(`${prdId}: Few test scenarios (${testScenarios.length})`);
    score -= 5;
  }

  // Check system_architecture
  if (!prd.system_architecture || Object.keys(prd.system_architecture).length === 0) {
    warnings.push(`${prdId}: Missing system_architecture`);
    score -= 5;
  }

  // Check implementation_approach
  if (!prd.implementation_approach || Object.keys(prd.implementation_approach).length === 0) {
    warnings.push(`${prdId}: Missing implementation_approach`);
    score -= 5;
  }

  // Check risks
  const risks = prd.risks || [];
  if (!Array.isArray(risks) || risks.length === 0) {
    warnings.push(`${prdId}: No risks identified`);
    score -= 5;
  }

  // Check executive_summary
  const summary = prd.executive_summary || '';
  if (summary.length < 50) {
    warnings.push(`${prdId}: Short executive summary`);
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 65 && issues.length === 0;

  return {
    prd_id: prdId,
    valid: passed,
    passed,
    score,
    issues,
    warnings,
    boilerplateDetails: {
      functional_requirements: { total: funcReqs.length, placeholder: 0 },
      acceptance_criteria: { total: accCriteria.length, boilerplate: 0 },
      test_scenarios: { total: testScenarios.length, placeholder: 0 }
    },
    details: { method: 'heuristic' }
  };
}

/**
 * Validate a single PRD for quality using AI-powered Russian Judge rubric
 * Set PRD_VALIDATION_MODE=heuristic to use fast non-AI validation
 * @param {Object} prd - PRD object from database
 * @param {Object} options - Validation options
 * @param {string} options.sdType - SD type (bugfix, feature, etc.) for type-aware validation
 * @returns {Promise<Object>} { valid: boolean, issues: array, warnings: array, score: number }
 */
export async function validatePRDQuality(prd, options = {}) {
  const prdId = prd?.id || 'Unknown';
  const sdType = (options.sdType || prd?.category || '').toLowerCase();
  const sdCategory = (options.sdCategory || prd?.category || '').toLowerCase();

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

  // ROOT CAUSE FIX: SD-NAV-CMD-001A - Use heuristic validation for simpler SDs
  // AI scoring is too strict for bugfix, infrastructure, and test-focused PRDs
  // These SDs have simpler scope and don't need full AI semantic analysis
  // Added 'refactor' (2025-12-27): Refactoring SDs are internal code restructuring,
  // similar to infrastructure - they don't need the full AI semantic analysis
  // Added 'theming', 'ux', 'design', 'ui' (2025-12-28): UI/UX SDs focus on visual/style changes
  // Check both sdType and sdCategory since SDs can have type='implementation' but category='theming'
  // ROOT CAUSE FIX (2026-01-01): Added 'database', 'database_schema' - same rationale as
  // user-story-quality-validation.js line 157: database SDs focus on schema/migrations,
  // not user narratives. This was an incomplete refactoring that caused false PRD failures.
  const heuristicTypes = ['bugfix', 'bug_fix', 'infrastructure', 'implementation', 'database', 'database_schema', 'quality assurance', 'quality_assurance', 'orchestrator', 'documentation', 'refactor', 'theming', 'ux', 'design', 'ui', 'layout', 'state-management'];
  const usesHeuristic = process.env.PRD_VALIDATION_MODE === 'heuristic' ||
                        heuristicTypes.includes(sdType) ||
                        heuristicTypes.includes(sdCategory);

  if (usesHeuristic) {
    console.log(`   ℹ️  Using heuristic PRD validation (sdType: ${sdType || 'env override'})`);
    return validatePRDHeuristic(prd);
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
 * SD-LEO-PROTOCOL-V435-001 US-002: Uses type-specific PRD quality thresholds
 *
 * @param {Object} prd - PRD object from database
 * @param {Object} options - Validation options
 * @param {number} options.minimumScore - Minimum score required (default: type-specific threshold from THRESHOLD_PROFILES)
 * @param {boolean} options.blockOnWarnings - Whether to block on warnings (default: false)
 * @param {string} options.sdType - SD type for type-aware validation (bugfix uses heuristic)
 * @param {Object} options.sd - SD object for type-specific threshold lookup
 * @returns {Promise<Object>} Validation result for handoff (async now - calls AI)
 */
export async function validatePRDForHandoff(prd, options = {}) {
  const {
    blockOnWarnings = false,
    sdType = '',
    sdCategory = '',  // Pass SD category (theming, ux, etc.) for heuristic validation
    sd = null  // SD object for type-specific threshold
  } = options;

  // SD-LEO-PROTOCOL-V435-001 US-002: Get type-specific threshold
  // Priority: explicit minimumScore > SD-based threshold > sdType-based threshold > default
  let minimumScore = options.minimumScore;
  if (minimumScore === undefined) {
    if (sd) {
      minimumScore = getPRDQualityThresholdSync(sd);
    } else if (sdType) {
      minimumScore = THRESHOLD_PROFILES[sdType.toLowerCase()]?.prdQuality || THRESHOLD_PROFILES.default.prdQuality;
    } else {
      minimumScore = THRESHOLD_PROFILES.default.prdQuality;
    }
  }

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

  // Run quality validation (with SD type and category for type-aware validation)
  const qualityResult = await validatePRDQuality(prd, { sdType, sdCategory });
  result.qualityDetails = qualityResult;
  result.score = qualityResult.score;

  // Check if score meets minimum threshold
  // If score passes threshold, PRD is valid - issues become non-blocking recommendations
  // If score fails threshold, issues are blocking
  if (qualityResult.score >= minimumScore) {
    // Score passes - issues are recommendations (move to warnings), not blocking
    result.valid = true;
    result.warnings = [...qualityResult.warnings, ...qualityResult.issues];
    result.issues = [];
  } else {
    // Score fails - issues are blocking
    result.valid = false;
    result.issues = qualityResult.issues;
    result.warnings = qualityResult.warnings;
    result.issues.push(`PRD quality score (${qualityResult.score}%) is below minimum (${minimumScore}%)`);
  }

  // Check warnings if blocking (only blocks if explicitly configured)
  if (blockOnWarnings && result.warnings.length > 0) {
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
