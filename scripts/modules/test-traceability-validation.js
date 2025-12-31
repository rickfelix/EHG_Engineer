/**
 * TEST TRACEABILITY VALIDATION (US-007)
 *
 * LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback:
 * "Test scenarios often lack traceability to specific requirements"
 *
 * Validates that:
 * 1. Test scenarios trace back to functional requirements (FR-X references)
 * 2. Functional requirements have test coverage (at least one test per FR)
 * 3. Acceptance criteria are testable and mapped
 *
 * @module test-traceability-validation
 * @version 1.0.0
 * @see SD-LEO-PROTOCOL-V434-001
 */

/**
 * Build a traceability matrix between requirements and tests
 * @param {Object} prd - Product Requirements Document
 * @returns {Object} Traceability matrix
 */
export function buildTraceabilityMatrix(prd) {
  const matrix = {
    requirements: new Map(),  // FR-ID -> { requirement, tests: [], covered: boolean }
    tests: new Map(),         // TS-ID -> { scenario, requirements: [], linked: boolean }
    unmappedTests: [],        // Tests without requirement links
    uncoveredRequirements: [], // Requirements without test coverage
    coverage: {
      total_requirements: 0,
      covered_requirements: 0,
      total_tests: 0,
      linked_tests: 0
    }
  };

  // Parse functional requirements
  const functionalReqs = prd.functional_requirements || [];
  for (const req of functionalReqs) {
    const reqId = req.id || req.requirement_id;
    if (reqId) {
      matrix.requirements.set(reqId, {
        id: reqId,
        requirement: req.requirement || req.description,
        priority: req.priority,
        tests: [],
        covered: false
      });
    }
  }
  matrix.coverage.total_requirements = matrix.requirements.size;

  // Parse test scenarios and find requirement links
  const testScenarios = prd.test_scenarios || [];
  for (const test of testScenarios) {
    const testId = test.id || test.test_id;
    const testEntry = {
      id: testId,
      scenario: test.scenario || test.description,
      test_type: test.test_type || test.type,
      requirements: [],
      linked: false
    };

    // Extract requirement references from test
    const reqRefs = extractRequirementReferences(test);
    testEntry.requirements = reqRefs;
    testEntry.linked = reqRefs.length > 0;

    matrix.tests.set(testId, testEntry);

    // Link back to requirements
    for (const reqId of reqRefs) {
      if (matrix.requirements.has(reqId)) {
        matrix.requirements.get(reqId).tests.push(testId);
        matrix.requirements.get(reqId).covered = true;
      }
    }
  }
  matrix.coverage.total_tests = matrix.tests.size;

  // Calculate coverage
  for (const [reqId, reqData] of matrix.requirements) {
    if (!reqData.covered) {
      matrix.uncoveredRequirements.push(reqId);
    } else {
      matrix.coverage.covered_requirements++;
    }
  }

  for (const [testId, testData] of matrix.tests) {
    if (!testData.linked) {
      matrix.unmappedTests.push(testId);
    } else {
      matrix.coverage.linked_tests++;
    }
  }

  return matrix;
}

/**
 * Extract requirement references from a test scenario
 * Looks for patterns like FR-1, FR-001, REQ-1, etc.
 * @param {Object} test - Test scenario object
 * @returns {string[]} Array of requirement IDs
 */
export function extractRequirementReferences(test) {
  const refs = new Set();

  // Fields to search for requirement references
  const fieldsToCheck = [
    test.scenario,
    test.description,
    test.given,
    test.when,
    test.then,
    test.expected_result,
    test.requirement_id,
    test.requires,
    test.validates,
    test.linked_requirement
  ];

  // Patterns for requirement references
  const patterns = [
    /\b(FR-\d+)\b/gi,
    /\b(REQ-\d+)\b/gi,
    /\b(NFR-\d+)\b/gi,
    /\b(TR-\d+)\b/gi,
    /\brequirement[s]?\s*[:=]?\s*(FR-\d+)/gi,
    /\bvalidate[s]?\s*[:=]?\s*(FR-\d+)/gi
  ];

  for (const field of fieldsToCheck) {
    if (!field) continue;
    const text = typeof field === 'string' ? field : JSON.stringify(field);

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        refs.add(match[1].toUpperCase());
      }
    }
  }

  // Check if test has explicit linked_requirements array
  if (Array.isArray(test.linked_requirements)) {
    for (const req of test.linked_requirements) {
      if (typeof req === 'string') refs.add(req.toUpperCase());
    }
  }

  return Array.from(refs);
}

/**
 * Validate test traceability for a PRD
 * @param {Object} prd - Product Requirements Document
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateTestTraceability(prd, options = {}) {
  const {
    requirementCoverageThreshold = 80,  // % of requirements that must have tests
    testLinkageThreshold = 60,          // % of tests that must link to requirements
    strictMode = false                  // If true, all requirements must be covered
  } = options;

  const result = {
    valid: true,
    passed: true,
    score: 100,
    issues: [],
    warnings: [],
    details: {
      requirement_coverage: 0,
      test_linkage: 0,
      uncovered_requirements: [],
      unmapped_tests: [],
      traceability_matrix: null
    }
  };

  // Build traceability matrix
  const matrix = buildTraceabilityMatrix(prd);
  result.details.traceability_matrix = {
    total_requirements: matrix.coverage.total_requirements,
    covered_requirements: matrix.coverage.covered_requirements,
    total_tests: matrix.coverage.total_tests,
    linked_tests: matrix.coverage.linked_tests
  };

  // Handle edge cases
  if (matrix.coverage.total_requirements === 0) {
    result.warnings.push('No functional requirements found to validate traceability');
    return result;
  }

  if (matrix.coverage.total_tests === 0) {
    result.issues.push('No test scenarios defined - cannot validate traceability');
    result.score = 0;
    result.valid = false;
    result.passed = false;
    return result;
  }

  // Calculate coverage percentages
  const reqCoverage = Math.round(
    (matrix.coverage.covered_requirements / matrix.coverage.total_requirements) * 100
  );
  const testLinkage = Math.round(
    (matrix.coverage.linked_tests / matrix.coverage.total_tests) * 100
  );

  result.details.requirement_coverage = reqCoverage;
  result.details.test_linkage = testLinkage;
  result.details.uncovered_requirements = matrix.uncoveredRequirements;
  result.details.unmapped_tests = matrix.unmappedTests;

  // Evaluate requirement coverage
  if (reqCoverage < requirementCoverageThreshold) {
    result.issues.push(
      `Requirement coverage: ${reqCoverage}% (threshold: ${requirementCoverageThreshold}%). ` +
      `Uncovered: ${matrix.uncoveredRequirements.join(', ')}`
    );
    result.score -= (requirementCoverageThreshold - reqCoverage);
  }

  // Evaluate test linkage
  if (testLinkage < testLinkageThreshold) {
    result.warnings.push(
      `Test linkage: ${testLinkage}% (threshold: ${testLinkageThreshold}%). ` +
      `Unmapped tests: ${matrix.unmappedTests.slice(0, 5).join(', ')}${matrix.unmappedTests.length > 5 ? '...' : ''}`
    );
    result.score -= Math.round((testLinkageThreshold - testLinkage) / 2);
  }

  // Strict mode: all CRITICAL/HIGH requirements must be covered
  if (strictMode) {
    for (const reqId of matrix.uncoveredRequirements) {
      const req = matrix.requirements.get(reqId);
      if (req && (req.priority === 'CRITICAL' || req.priority === 'HIGH')) {
        result.issues.push(`CRITICAL/HIGH priority requirement ${reqId} has no test coverage`);
        result.score -= 15;
      }
    }
  }

  // Ensure score bounds
  result.score = Math.max(0, Math.min(100, result.score));

  // Determine pass/fail
  if (result.issues.length > 0 || result.score < 60) {
    result.valid = false;
    result.passed = false;
  }

  return result;
}

/**
 * Generate a plan_checklist item for test traceability
 * @param {Object} validationResult - Result from validateTestTraceability
 * @returns {Object} Checklist item
 */
export function generateTraceabilityChecklistItem(validationResult) {
  const coverage = validationResult.details.requirement_coverage || 0;
  const linkage = validationResult.details.test_linkage || 0;

  return {
    text: `Test traceability validated (${coverage}% req coverage, ${linkage}% test linkage)`,
    checked: validationResult.passed,
    details: {
      uncovered: validationResult.details.uncovered_requirements?.length || 0,
      unmapped: validationResult.details.unmapped_tests?.length || 0
    }
  };
}

/**
 * Get improvement guidance for test traceability issues
 * @param {Object} validationResult - Result from validateTestTraceability
 * @returns {Object} Improvement guidance
 */
export function getTestTraceabilityGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '15-45 minutes',
    instructions: ''
  };

  if (validationResult.details.uncovered_requirements?.length > 0) {
    guidance.required.push('Add test scenarios for uncovered requirements:');
    for (const reqId of validationResult.details.uncovered_requirements.slice(0, 5)) {
      guidance.required.push(`  - Create test for ${reqId}`);
    }
    if (validationResult.details.uncovered_requirements.length > 5) {
      guidance.required.push(`  ... and ${validationResult.details.uncovered_requirements.length - 5} more`);
    }
  }

  if (validationResult.details.unmapped_tests?.length > 0) {
    guidance.recommended.push('Link tests to requirements by adding FR-X references:');
    guidance.recommended.push('  Example: { scenario: "Validate FR-1 user login", linked_requirements: ["FR-1"] }');
  }

  if (validationResult.score < 80) {
    guidance.timeEstimate = '30-60 minutes';
    guidance.required.push('Improve test traceability to achieve 80% coverage');
  }

  guidance.instructions =
    `Test traceability score: ${validationResult.score}%. ` +
    `${validationResult.details.requirement_coverage}% of requirements have tests, ` +
    `${validationResult.details.test_linkage}% of tests link to requirements. ` +
    'Add FR-X references to test scenarios for better traceability.';

  return guidance;
}

/**
 * Default plan_checklist items including test traceability
 * Use this when creating new PRDs
 */
export const DEFAULT_PLAN_CHECKLIST_WITH_TRACEABILITY = [
  { text: 'PRD created and saved', checked: false },
  { text: 'SD requirements mapped to technical specs', checked: false },
  { text: 'Technical architecture defined', checked: false },
  { text: 'Implementation approach documented', checked: false },
  { text: 'Test scenarios defined with requirement traceability (US-007)', checked: false },
  { text: 'Acceptance criteria established', checked: false },
  { text: 'Resource requirements estimated', checked: false },
  { text: 'Risk assessment completed', checked: false },
  { text: 'Failure modes documented (US-004)', checked: false }
];

export default {
  buildTraceabilityMatrix,
  extractRequirementReferences,
  validateTestTraceability,
  generateTraceabilityChecklistItem,
  getTestTraceabilityGuidance,
  DEFAULT_PLAN_CHECKLIST_WITH_TRACEABILITY
};
