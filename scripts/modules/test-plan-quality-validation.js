/**
 * TEST PLAN QUALITY VALIDATION MODULE
 *
 * Validates test plan quality to ensure test cases contain
 * specific, actionable test scenarios rather than generic boilerplate.
 *
 * Detects:
 * 1. Boilerplate user_actions (Navigate to feature, Interact with UI, Verify behavior)
 * 2. Generic expected_outcomes (Feature works as expected, No errors occur)
 * 3. Empty test_data for data-driven tests
 * 4. Duplicate/templated descriptions
 * 5. Missing specific assertions/selectors
 *
 * @module test-plan-quality-validation
 * @version 1.0.0
 * @see SD-CAPABILITY-LIFECYCLE-001 - LEO Protocol quality improvements
 */

// ============================================
// BOILERPLATE DETECTION PATTERNS
// ============================================

// Generic user actions (boilerplate)
const BOILERPLATE_USER_ACTIONS = [
  'navigate to feature',
  'interact with ui',
  'verify behavior',
  'load page',
  'click button',
  'fill form',
  'submit form',
  'check result'
];

// Generic expected outcomes (boilerplate)
const BOILERPLATE_EXPECTED_OUTCOMES = [
  'feature works as expected',
  'no errors occur',
  'data is correct',
  'test passes',
  'page loads',
  'form submits',
  'action completes',
  'success message shown'
];

// Generic descriptions (boilerplate)
const BOILERPLATE_DESCRIPTIONS = [
  'e2e test validating acceptance criteria',
  'unit tests for business logic implementing',
  'verify component mounts correctly',
  'test input validation',
  'verify state updates',
  'test integration between',
  'verify page loads'
];

// Minimum requirements for quality test cases
const MINIMUM_USER_ACTIONS = 3;
const MINIMUM_EXPECTED_OUTCOMES = 2;
const MINIMUM_DESCRIPTION_LENGTH = 30;

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if array contains mostly boilerplate strings
 * @param {Array<string>} items - Array of strings to check
 * @param {Array<string>} patterns - Boilerplate patterns
 * @param {number} threshold - Percentage threshold (0-100)
 * @returns {Object} { isBoilerplate: boolean, percentage: number }
 */
function checkBoilerplateArray(items, patterns, threshold = 75) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { isBoilerplate: false, percentage: 0, empty: true };
  }

  const boilerplateCount = items.filter(item => {
    const normalized = (typeof item === 'string' ? item : '').toLowerCase().trim();
    return patterns.some(bp => normalized.includes(bp.toLowerCase()));
  }).length;

  const percentage = Math.round((boilerplateCount / items.length) * 100);
  return {
    isBoilerplate: percentage >= threshold,
    percentage,
    boilerplateCount,
    totalCount: items.length
  };
}

/**
 * Validate a single E2E test case for quality
 */
function validateE2ETestCase(testCase) {
  const issues = [];
  const warnings = [];
  let score = 100;

  const testId = testCase.id || testCase.name || 'Unknown';

  // 1. Check user_actions
  if (!testCase.user_actions || testCase.user_actions.length === 0) {
    issues.push(`${testId}: No user_actions defined`);
    score -= 20;
  } else {
    const actionsCheck = checkBoilerplateArray(testCase.user_actions, BOILERPLATE_USER_ACTIONS);
    if (actionsCheck.isBoilerplate) {
      issues.push(`${testId}: user_actions are ${actionsCheck.percentage}% boilerplate`);
      score -= 25;
    } else if (testCase.user_actions.length < MINIMUM_USER_ACTIONS) {
      warnings.push(`${testId}: Only ${testCase.user_actions.length} user_actions (recommend ${MINIMUM_USER_ACTIONS}+)`);
      score -= 5;
    }
  }

  // 2. Check expected_outcomes
  if (!testCase.expected_outcomes || testCase.expected_outcomes.length === 0) {
    issues.push(`${testId}: No expected_outcomes defined`);
    score -= 20;
  } else {
    const outcomesCheck = checkBoilerplateArray(testCase.expected_outcomes, BOILERPLATE_EXPECTED_OUTCOMES);
    if (outcomesCheck.isBoilerplate) {
      issues.push(`${testId}: expected_outcomes are ${outcomesCheck.percentage}% boilerplate`);
      score -= 25;
    } else if (testCase.expected_outcomes.length < MINIMUM_EXPECTED_OUTCOMES) {
      warnings.push(`${testId}: Only ${testCase.expected_outcomes.length} expected_outcomes (recommend ${MINIMUM_EXPECTED_OUTCOMES}+)`);
      score -= 5;
    }
  }

  // 3. Check description
  if (!testCase.description || testCase.description.length < MINIMUM_DESCRIPTION_LENGTH) {
    warnings.push(`${testId}: Description too brief (${testCase.description?.length || 0} chars)`);
    score -= 5;
  } else {
    const descNormalized = testCase.description.toLowerCase();
    const isBoilerplateDesc = BOILERPLATE_DESCRIPTIONS.some(bp => descNormalized.includes(bp));
    if (isBoilerplateDesc) {
      warnings.push(`${testId}: Description uses boilerplate template`);
      score -= 10;
    }
  }

  // 4. Check test_data (for data-driven tests)
  if (testCase.test_data && typeof testCase.test_data === 'object') {
    if (Object.keys(testCase.test_data).length === 0) {
      warnings.push(`${testId}: Empty test_data object`);
      score -= 5;
    }
  }

  return { test_id: testId, score: Math.max(0, score), issues, warnings };
}

/**
 * Validate a single unit test case for quality
 */
function validateUnitTestCase(testCase) {
  const issues = [];
  const warnings = [];
  let score = 100;

  const testId = testCase.id || testCase.name || 'Unknown';

  // 1. Check description
  if (!testCase.description || testCase.description.length < MINIMUM_DESCRIPTION_LENGTH) {
    warnings.push(`${testId}: Description too brief`);
    score -= 5;
  } else {
    const descNormalized = testCase.description.toLowerCase();
    const isBoilerplateDesc = BOILERPLATE_DESCRIPTIONS.some(bp => descNormalized.includes(bp));
    if (isBoilerplateDesc) {
      warnings.push(`${testId}: Description uses boilerplate template`);
      score -= 10;
    }
  }

  // 2. Check user_story_ref exists for feature tests
  if (testCase.type === 'feature' && !testCase.user_story_ref) {
    warnings.push(`${testId}: Feature test missing user_story_ref`);
    score -= 5;
  }

  return { test_id: testId, score: Math.max(0, score), issues, warnings };
}

/**
 * Validate entire test plan for quality
 * @param {Object} testPlan - Test plan object from database
 * @returns {Object} Validation result
 */
export function validateTestPlanQuality(testPlan) {
  const issues = [];
  const warnings = [];
  let score = 100;

  const planId = testPlan.id || testPlan.sd_id || 'Unknown';

  // ============================================
  // 1. CHECK FOR PLAN PRESENCE
  // ============================================
  if (!testPlan || Object.keys(testPlan).length === 0) {
    issues.push(`${planId}: Test plan is empty or missing`);
    return { plan_id: planId, valid: false, issues, warnings, score: 0, boilerplateDetails: {} };
  }

  const e2eStrategy = testPlan.e2e_test_strategy;
  const unitStrategy = testPlan.unit_test_strategy;
  // Integration strategy available but not currently validated for quality
  // const integrationStrategy = testPlan.integration_test_strategy;

  // ============================================
  // 2. VALIDATE E2E TEST STRATEGY
  // ============================================
  const e2eResults = { boilerplateCount: 0, totalTests: 0, testResults: [] };

  if (e2eStrategy?.test_cases && Array.isArray(e2eStrategy.test_cases)) {
    e2eResults.totalTests = e2eStrategy.test_cases.length;

    for (const testCase of e2eStrategy.test_cases) {
      const result = validateE2ETestCase(testCase);
      e2eResults.testResults.push(result);

      if (result.issues.length > 0) {
        e2eResults.boilerplateCount++;
      }

      issues.push(...result.issues);
      warnings.push(...result.warnings);
    }

    if (e2eResults.totalTests > 0) {
      const e2eBoilerplatePercent = Math.round((e2eResults.boilerplateCount / e2eResults.totalTests) * 100);

      if (e2eBoilerplatePercent >= 75) {
        issues.push(`${planId}: ${e2eBoilerplatePercent}% of E2E tests are boilerplate`);
        score -= 30;
      } else if (e2eBoilerplatePercent >= 50) {
        warnings.push(`${planId}: ${e2eBoilerplatePercent}% of E2E tests have boilerplate elements`);
        score -= 15;
      }
    }
  } else {
    warnings.push(`${planId}: No E2E test cases defined`);
    score -= 10;
  }

  // ============================================
  // 3. VALIDATE UNIT TEST STRATEGY
  // ============================================
  const unitResults = { boilerplateCount: 0, totalTests: 0 };

  if (unitStrategy?.test_cases && Array.isArray(unitStrategy.test_cases)) {
    unitResults.totalTests = unitStrategy.test_cases.length;

    for (const testCase of unitStrategy.test_cases) {
      const result = validateUnitTestCase(testCase);

      if (result.issues.length > 0) {
        unitResults.boilerplateCount++;
      }

      // Unit test issues are warnings (not blocking)
      warnings.push(...result.issues);
      warnings.push(...result.warnings);
    }

    if (unitResults.totalTests === 0) {
      warnings.push(`${planId}: No unit test cases defined`);
      score -= 5;
    }
  }

  // ============================================
  // 4. CHECK USER STORY MAPPING
  // ============================================
  if (e2eStrategy?.user_story_mapping && Array.isArray(e2eStrategy.user_story_mapping)) {
    const mapping = e2eStrategy.user_story_mapping;
    const plannedCount = mapping.filter(m => m.coverage_status === 'planned').length;

    if (plannedCount === mapping.length && mapping.length > 0) {
      warnings.push(`${planId}: All ${mapping.length} user story mappings still 'planned' (none executed)`);
      score -= 5;
    }
  }

  // ============================================
  // 5. CHECK TEST DATA REQUIREMENTS
  // ============================================
  const testDataReqs = testPlan.test_data_requirements || [];
  if (testDataReqs.length === 0 && e2eResults.totalTests > 3) {
    warnings.push(`${planId}: No test_data_requirements defined for ${e2eResults.totalTests} E2E tests`);
    score -= 5;
  }

  // ============================================
  // 6. CHECK COVERAGE TARGETS
  // ============================================
  if (unitStrategy?.coverage_targets) {
    const targets = unitStrategy.coverage_targets;
    const lowTargets = Object.entries(targets).filter(([_, v]) => v < 70);
    if (lowTargets.length > 0) {
      warnings.push(`${planId}: Low coverage targets: ${lowTargets.map(([k, v]) => `${k}=${v}%`).join(', ')}`);
      score -= 5;
    }
  }

  return {
    plan_id: planId,
    valid: issues.length === 0,
    issues,
    warnings,
    score: Math.max(0, score),
    boilerplateDetails: {
      e2e_boilerplate_count: e2eResults.boilerplateCount,
      e2e_total_tests: e2eResults.totalTests,
      e2e_boilerplate_percentage: e2eResults.totalTests > 0
        ? Math.round((e2eResults.boilerplateCount / e2eResults.totalTests) * 100)
        : 0,
      unit_total_tests: unitResults.totalTests
    }
  };
}

/**
 * Validate test plan for handoff readiness
 */
export function validateTestPlanForHandoff(testPlan, options = {}) {
  const {
    minimumScore = 70,
    maxBoilerplatePercent = 50,
    blockOnWarnings = false
  } = options;

  const result = {
    valid: true,
    plan_id: testPlan?.id || testPlan?.sd_id || 'Unknown',
    score: 0,
    minimumScore,
    issues: [],
    warnings: [],
    qualityDetails: null
  };

  if (!testPlan) {
    result.valid = false;
    result.issues.push('Test plan object is null or undefined');
    return result;
  }

  // Run quality validation
  const qualityResult = validateTestPlanQuality(testPlan);
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
    result.issues.push(`Test plan quality score (${qualityResult.score}%) is below minimum (${minimumScore}%)`);
  }

  // Check boilerplate percentage
  const boilerplatePercent = qualityResult.boilerplateDetails?.e2e_boilerplate_percentage || 0;
  if (boilerplatePercent > maxBoilerplatePercent) {
    result.valid = false;
    result.issues.push(`E2E boilerplate percentage (${boilerplatePercent}%) exceeds maximum allowed (${maxBoilerplatePercent}%)`);
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

  lines.push('Test Plan Quality Validation');
  lines.push(`   Plan: ${result.plan_id}`);
  lines.push(`   Score: ${result.score}% (minimum: ${result.minimumScore}%)`);
  lines.push(`   Status: ${result.valid ? 'PASSED' : 'FAILED'}`);

  if (result.qualityDetails?.boilerplateDetails) {
    const bd = result.qualityDetails.boilerplateDetails;
    lines.push('   Analysis:');
    lines.push(`     - E2E Tests: ${bd.e2e_total_tests}`);
    lines.push(`     - E2E Boilerplate: ${bd.e2e_boilerplate_count} (${bd.e2e_boilerplate_percentage}%)`);
    lines.push(`     - Unit Tests: ${bd.unit_total_tests}`);
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
 * Get improvement guidance for failed test plan validation
 */
export function getTestPlanImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '30-60 minutes',
    instructions: ''
  };

  const boilerplateDetails = validationResult.qualityDetails?.boilerplateDetails;

  // Analyze issues
  if (boilerplateDetails?.e2e_boilerplate_percentage >= 50) {
    guidance.required.push('Replace generic user_actions with specific UI interactions');
    guidance.required.push('Example: "Click the Submit button with data-testid=\'submit-form\'" instead of "Click button"');
    guidance.required.push('Replace generic expected_outcomes with specific assertions');
    guidance.required.push('Example: "Success toast appears with message \'Settings saved\'" instead of "Feature works as expected"');
  }

  if (validationResult.issues.some(i => i.includes('No user_actions'))) {
    guidance.required.push('Add specific user_actions for each E2E test case');
    guidance.required.push('Each action should reference specific UI elements or data');
  }

  if (validationResult.issues.some(i => i.includes('No expected_outcomes'))) {
    guidance.required.push('Add specific expected_outcomes with measurable assertions');
    guidance.required.push('Include specific text, element states, or data values to verify');
  }

  // Recommendations from warnings
  if (validationResult.warnings.some(w => w.includes('Empty test_data'))) {
    guidance.recommended.push('Add test_data with specific input values for data-driven tests');
  }

  if (validationResult.warnings.some(w => w.includes('boilerplate template'))) {
    guidance.recommended.push('Write custom descriptions that explain the specific test scenario');
  }

  if (validationResult.warnings.some(w => w.includes('test_data_requirements'))) {
    guidance.recommended.push('Define test_data_requirements for consistent test execution');
  }

  // Time estimate
  const totalIssues = validationResult.issues.length;
  if (totalIssues <= 5) {
    guidance.timeEstimate = '15-30 minutes';
  } else if (totalIssues <= 15) {
    guidance.timeEstimate = '30-60 minutes';
  } else {
    guidance.timeEstimate = '1-2 hours';
  }

  guidance.instructions = `Test plan quality score is ${validationResult.score}% (minimum ${validationResult.minimumScore}%). ` +
    'Focus on replacing generic user_actions and expected_outcomes with specific UI interactions and assertions. ' +
    'Each test case should be independently executable with clear pass/fail criteria.';

  return guidance;
}

export default {
  validateTestPlanQuality,
  validateTestPlanForHandoff,
  getTestPlanImprovementGuidance
};
