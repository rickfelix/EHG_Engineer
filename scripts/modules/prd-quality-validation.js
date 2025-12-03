/**
 * PRD QUALITY VALIDATION MODULE
 *
 * Validates PRD quality during PLAN→EXEC handoff to ensure
 * PRDs are implementation-ready and not boilerplate.
 *
 * @module prd-quality-validation
 * @version 1.0.0
 * @see SD-CAPABILITY-LIFECYCLE-001 - LEO Protocol quality improvements
 */

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
 * Validate a single PRD for quality
 * @param {Object} prd - PRD object from database
 * @returns {Object} { valid: boolean, issues: array, warnings: array, score: number }
 */
export function validatePRDQuality(prd) {
  const issues = [];  // Blocking issues
  const warnings = [];  // Non-blocking but logged
  let score = 100;

  const prdId = prd.id || 'Unknown';

  // ============================================
  // 1. EXECUTIVE SUMMARY CHECK
  // ============================================
  if (!prd.executive_summary || prd.executive_summary.trim().length < 50) {
    issues.push(`${prdId}: Executive summary is empty or too short (<50 chars)`);
    score -= 15;
  } else if (containsPlaceholder(prd.executive_summary)) {
    issues.push(`${prdId}: Executive summary contains placeholder text`);
    score -= 10;
  } else if (isBoilerplate(prd.executive_summary, GENERIC_SUMMARY_PATTERNS)) {
    warnings.push(`${prdId}: Executive summary is generic template text`);
    score -= 5;
  }

  // ============================================
  // 2. FUNCTIONAL REQUIREMENTS CHECK
  // ============================================
  if (!prd.functional_requirements || prd.functional_requirements.length === 0) {
    issues.push(`${prdId}: No functional requirements defined`);
    score -= 20;
  } else {
    // Check each requirement
    const realRequirements = prd.functional_requirements.filter(req => {
      const text = typeof req === 'string' ? req : (req.requirement || req.text || '');
      return !containsPlaceholder(text) && !isBoilerplate(text, BOILERPLATE_REQUIREMENTS);
    });

    const placeholderCount = prd.functional_requirements.length - realRequirements.length;

    if (placeholderCount > 0) {
      issues.push(`${prdId}: ${placeholderCount}/${prd.functional_requirements.length} functional requirements are placeholders`);
      score -= placeholderCount * 5;
    }

    if (realRequirements.length < 3) {
      issues.push(`${prdId}: Insufficient real functional requirements (${realRequirements.length}/3 minimum)`);
      score -= 10;
    }
  }

  // ============================================
  // 3. ACCEPTANCE CRITERIA CHECK
  // ============================================
  if (!prd.acceptance_criteria || prd.acceptance_criteria.length === 0) {
    issues.push(`${prdId}: No acceptance criteria defined`);
    score -= 20;
  } else {
    const realAC = prd.acceptance_criteria.filter(ac => {
      const text = typeof ac === 'string' ? ac : (ac.criterion || ac.text || '');
      return !isBoilerplate(text, BOILERPLATE_ACCEPTANCE_CRITERIA);
    });

    const boilerplateCount = prd.acceptance_criteria.length - realAC.length;

    if (boilerplateCount > 0) {
      issues.push(`${prdId}: ${boilerplateCount}/${prd.acceptance_criteria.length} acceptance criteria are boilerplate`);
      score -= boilerplateCount * 3;
    }

    if (realAC.length < 3) {
      issues.push(`${prdId}: Insufficient specific acceptance criteria (${realAC.length}/3 minimum)`);
      score -= 10;
    }
  }

  // ============================================
  // 4. TEST SCENARIOS CHECK
  // ============================================
  if (!prd.test_scenarios || prd.test_scenarios.length === 0) {
    issues.push(`${prdId}: No test scenarios defined`);
    score -= 15;
  } else {
    const realScenarios = prd.test_scenarios.filter(ts => {
      const text = typeof ts === 'string' ? ts : (ts.scenario || ts.description || ts.text || '');
      return !containsPlaceholder(text) && !isBoilerplate(text, BOILERPLATE_TEST_SCENARIOS);
    });

    const placeholderCount = prd.test_scenarios.length - realScenarios.length;

    if (placeholderCount > 0) {
      issues.push(`${prdId}: ${placeholderCount}/${prd.test_scenarios.length} test scenarios are placeholders`);
      score -= placeholderCount * 5;
    }

    if (realScenarios.length < 2) {
      issues.push(`${prdId}: Insufficient specific test scenarios (${realScenarios.length}/2 minimum)`);
      score -= 10;
    }
  }

  // ============================================
  // 5. IMPLEMENTATION APPROACH CHECK
  // ============================================
  if (!prd.implementation_approach || prd.implementation_approach.trim().length < 100) {
    warnings.push(`${prdId}: Implementation approach is missing or brief (<100 chars)`);
    score -= 5;
  } else if (containsPlaceholder(prd.implementation_approach)) {
    issues.push(`${prdId}: Implementation approach contains placeholder text`);
    score -= 10;
  }

  // ============================================
  // 6. SYSTEM ARCHITECTURE CHECK
  // ============================================
  if (!prd.system_architecture || prd.system_architecture.trim().length < 50) {
    warnings.push(`${prdId}: System architecture is missing or brief`);
    score -= 5;
  } else if (containsPlaceholder(prd.system_architecture)) {
    issues.push(`${prdId}: System architecture contains placeholder text`);
    score -= 10;
  }

  // ============================================
  // 7. RISKS CHECK
  // ============================================
  if (!prd.risks || prd.risks.length === 0) {
    warnings.push(`${prdId}: No risks documented`);
    score -= 5;
  }

  // ============================================
  // 8. CONTENT FIELD CHECK (markdown)
  // ============================================
  if (prd.content) {
    const contentLower = prd.content.toLowerCase();
    const placeholderMatches = PLACEHOLDER_PATTERNS.filter(p => contentLower.includes(p));
    if (placeholderMatches.length > 0) {
      issues.push(`${prdId}: PRD content field contains ${placeholderMatches.length} placeholder patterns`);
      score -= placeholderMatches.length * 2;
    }
  }

  return {
    prd_id: prdId,
    valid: issues.length === 0,
    issues,
    warnings,
    score: Math.max(0, score),
    boilerplateDetails: {
      functional_requirements: {
        total: prd.functional_requirements?.length || 0,
        placeholder: (prd.functional_requirements?.length || 0) -
          (prd.functional_requirements?.filter(req => {
            const text = typeof req === 'string' ? req : (req.requirement || '');
            return !containsPlaceholder(text) && !isBoilerplate(text, BOILERPLATE_REQUIREMENTS);
          }).length || 0)
      },
      acceptance_criteria: {
        total: prd.acceptance_criteria?.length || 0,
        boilerplate: (prd.acceptance_criteria?.length || 0) -
          (prd.acceptance_criteria?.filter(ac => {
            const text = typeof ac === 'string' ? ac : (ac.criterion || '');
            return !isBoilerplate(text, BOILERPLATE_ACCEPTANCE_CRITERIA);
          }).length || 0)
      },
      test_scenarios: {
        total: prd.test_scenarios?.length || 0,
        placeholder: (prd.test_scenarios?.length || 0) -
          (prd.test_scenarios?.filter(ts => {
            const text = typeof ts === 'string' ? ts : (ts.scenario || '');
            return !containsPlaceholder(text) && !isBoilerplate(text, BOILERPLATE_TEST_SCENARIOS);
          }).length || 0)
      }
    }
  };
}

/**
 * Validate PRD for handoff readiness
 * @param {Object} prd - PRD object from database
 * @param {Object} options - Validation options
 * @param {number} options.minimumScore - Minimum score required (default: 70)
 * @param {boolean} options.blockOnWarnings - Whether to block on warnings (default: false)
 * @returns {Object} Validation result for handoff
 */
export function validatePRDForHandoff(prd, options = {}) {
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
  const qualityResult = validatePRDQuality(prd);
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
