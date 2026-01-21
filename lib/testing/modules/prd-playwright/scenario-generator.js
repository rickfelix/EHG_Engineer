/**
 * Scenario Generator Module
 * Handles test scenario generation from PRD requirements
 */

/**
 * Generate test scenarios from PRD requirements
 * @param {object} supabase - Supabase client
 * @param {object} prd - PRD data
 * @param {object} playwrightSpecs - Playwright specifications
 * @returns {Promise<Array>} Generated scenarios
 */
export async function generateTestScenarios(supabase, prd, playwrightSpecs) {
  const scenarios = [];
  const functionalReqs = prd.functional_requirements || [];

  for (const req of functionalReqs) {
    const reqScenarios = createScenariosForRequirement(req, prd, playwrightSpecs);
    scenarios.push(...reqScenarios);
  }

  if (scenarios.length > 0) {
    const { error } = await supabase
      .from('prd_playwright_scenarios')
      .upsert(scenarios, { onConflict: 'scenario_id' });

    if (error) {
      console.error('Error storing scenarios:', error);
    }
  }

  return scenarios;
}

/**
 * Create test scenarios for a single requirement
 * @param {object} requirement - Requirement data
 * @param {object} prd - PRD data
 * @param {object} specs - Playwright specifications
 * @returns {Array} Scenarios for the requirement
 */
export function createScenariosForRequirement(requirement, prd, specs) {
  const scenarios = [];
  const acceptanceCriteria = requirement.acceptance_criteria || [];

  const mainScenario = {
    prd_id: prd.id,
    requirement_id: requirement.id,
    scenario_id: `${requirement.id}-TEST-MAIN`,
    scenario_name: `${requirement.name} - Happy Path`,
    scenario_description: requirement.description,
    priority: mapPriority(prd.priority),
    test_type: 'e2e',
    preconditions: generatePreconditions(requirement),
    test_steps: generateTestSteps(requirement, acceptanceCriteria, specs),
    expected_results: generateExpectedResults(acceptanceCriteria),
    assertions: generateAssertions(requirement, acceptanceCriteria),
    test_data: generateTestData(),
    cleanup_steps: generateCleanupSteps(),
    auto_generated: true
  };

  scenarios.push(mainScenario);

  if (acceptanceCriteria.length > 3) {
    const edgeScenario = {
      ...mainScenario,
      scenario_id: `${requirement.id}-TEST-EDGE`,
      scenario_name: `${requirement.name} - Edge Cases`,
      test_steps: generateEdgeCaseSteps(requirement, acceptanceCriteria, specs),
      priority: 'medium'
    };
    scenarios.push(edgeScenario);
  }

  if (requiresValidation(requirement)) {
    const negativeScenario = {
      ...mainScenario,
      scenario_id: `${requirement.id}-TEST-NEG`,
      scenario_name: `${requirement.name} - Negative Tests`,
      test_steps: generateNegativeTestSteps(requirement, specs),
      priority: 'low'
    };
    scenarios.push(negativeScenario);
  }

  return scenarios;
}

/**
 * Generate test steps from acceptance criteria
 * @param {object} requirement - Requirement data
 * @param {Array} acceptanceCriteria - Acceptance criteria
 * @param {object} specs - Playwright specifications
 * @returns {Array} Test steps
 */
export function generateTestSteps(requirement, acceptanceCriteria, specs) {
  const steps = [];
  let stepNumber = 1;

  const navUrl = determineNavigationUrl(requirement);
  steps.push({
    step: stepNumber++,
    action: 'navigate',
    target: `${specs.base_url}${navUrl}`,
    data: null,
    assertion: { type: 'url', expected: navUrl }
  });

  steps.push({
    step: stepNumber++,
    action: 'waitForLoadState',
    target: 'networkidle',
    data: null,
    assertion: null
  });

  for (const criteria of acceptanceCriteria) {
    const criteriaSteps = parseAcceptanceCriteria(criteria, stepNumber);
    steps.push(...criteriaSteps);
    stepNumber += criteriaSteps.length;
  }

  steps.push({
    step: stepNumber++,
    action: 'screenshot',
    target: 'fullPage',
    data: { name: `${requirement.id}-complete` },
    assertion: null
  });

  return steps;
}

/**
 * Parse acceptance criteria into test steps
 * @param {string|object} criteria - Acceptance criteria
 * @param {number} startStep - Starting step number
 * @returns {Array} Test steps from criteria
 */
export function parseAcceptanceCriteria(criteria, startStep) {
  const steps = [];
  let stepNum = startStep;

  const criteriaText = typeof criteria === 'string' ? criteria : criteria.text || '';
  const lowerText = criteriaText.toLowerCase();

  if (lowerText.includes('input') || lowerText.includes('enter') || lowerText.includes('fill')) {
    const selector = extractSelector(criteriaText) || '[data-testid="input-field"]';
    steps.push({
      step: stepNum++,
      action: 'fill',
      target: selector,
      data: 'Test input data',
      assertion: { type: 'value', expected: 'Test input data' }
    });
  }

  if (lowerText.includes('click') || lowerText.includes('button') || lowerText.includes('submit')) {
    const selector = extractSelector(criteriaText) || '[data-testid="submit-button"]';
    steps.push({
      step: stepNum++,
      action: 'click',
      target: selector,
      data: null,
      assertion: { type: 'visible', selector }
    });
  }

  if (lowerText.includes('display') || lowerText.includes('show') || lowerText.includes('appear')) {
    const selector = extractSelector(criteriaText) || '[data-testid="result"]';
    steps.push({
      step: stepNum++,
      action: 'waitForSelector',
      target: selector,
      data: { state: 'visible', timeout: 5000 },
      assertion: { type: 'visible', selector }
    });
  }

  if (lowerText.includes('api') || lowerText.includes('request') || lowerText.includes('response')) {
    steps.push({
      step: stepNum++,
      action: 'waitForResponse',
      target: '**/api/**',
      data: { predicate: 'response.ok()' },
      assertion: { type: 'network', expected: 'success' }
    });
  }

  return steps;
}

/**
 * Generate Playwright assertions
 * @param {object} requirement - Requirement data
 * @param {Array} acceptanceCriteria - Acceptance criteria
 * @returns {Array} Assertions
 */
export function generateAssertions(requirement, acceptanceCriteria) {
  const assertions = [];

  assertions.push({
    type: 'toBeVisible',
    selector: `[data-testid="${requirement.id}-container"]`,
    description: `${requirement.name} container should be visible`
  });

  for (const criteria of acceptanceCriteria) {
    const criteriaText = typeof criteria === 'string' ? criteria : criteria.text || '';

    if (criteriaText.toLowerCase().includes('text')) {
      assertions.push({
        type: 'toHaveText',
        selector: '[data-testid="content"]',
        text: '.*',
        description: 'Content should have text'
      });
    }

    if (criteriaText.toLowerCase().includes('enabled')) {
      assertions.push({
        type: 'toBeEnabled',
        selector: '[data-testid="action-button"]',
        description: 'Action button should be enabled'
      });
    }

    if (criteriaText.toLowerCase().includes('count')) {
      assertions.push({
        type: 'toHaveCount',
        selector: '[data-testid="list-item"]',
        count: '>0',
        description: 'Should have list items'
      });
    }
  }

  assertions.push({
    type: 'toHaveScreenshot',
    name: `${requirement.id}-final.png`,
    options: { maxDiffPixels: 100, threshold: 0.2 }
  });

  return assertions;
}

/**
 * Generate edge case test steps
 * @param {object} requirement - Requirement data
 * @param {Array} acceptanceCriteria - Acceptance criteria
 * @param {object} specs - Playwright specifications
 * @returns {Array} Edge case test steps
 */
export function generateEdgeCaseSteps(requirement, acceptanceCriteria, specs) {
  const steps = generateTestSteps(requirement, acceptanceCriteria, specs);

  steps.push({
    step: steps.length + 1,
    action: 'fill',
    target: '[data-testid="input"]',
    data: 'x'.repeat(10000),
    assertion: { type: 'validation', expected: 'handled' }
  });

  return steps;
}

/**
 * Generate negative test steps
 * @param {object} requirement - Requirement data
 * @param {object} specs - Playwright specifications
 * @returns {Array} Negative test steps
 */
export function generateNegativeTestSteps(requirement, specs) {
  return [
    {
      step: 1,
      action: 'navigate',
      target: `${specs.base_url}${determineNavigationUrl(requirement)}`,
      data: null
    },
    {
      step: 2,
      action: 'click',
      target: '[data-testid="submit"]',
      data: null,
      assertion: { type: 'error', expected: 'validation-error' }
    }
  ];
}

/**
 * Determine navigation URL from requirement
 * @param {object} requirement - Requirement data
 * @returns {string} Navigation URL
 */
export function determineNavigationUrl(requirement) {
  const reqId = requirement.id || '';
  const name = requirement.name || '';

  if (name.toLowerCase().includes('dashboard')) return '/dashboard';
  if (name.toLowerCase().includes('login')) return '/login';
  if (name.toLowerCase().includes('directive')) return '/directives';
  if (reqId.toLowerCase().includes('sdip')) return '/directive-lab';

  return '/';
}

/**
 * Extract selector from text
 * @param {string} text - Text to search
 * @returns {string|null} Extracted selector
 */
export function extractSelector(text) {
  const patterns = [
    /data-testid="([^"]+)"/,
    /id="([^"]+)"/,
    /class="([^"]+)"/,
    /\[([^\]]+)\]/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Map PRD priority to test priority
 * @param {string} prdPriority - PRD priority level
 * @returns {string} Test priority
 */
export function mapPriority(prdPriority) {
  const mapping = {
    critical: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'low'
  };

  return mapping[prdPriority] || 'medium';
}

/**
 * Check if requirement requires validation tests
 * @param {object} requirement - Requirement data
 * @returns {boolean} Whether validation tests are needed
 */
export function requiresValidation(requirement) {
  const text = JSON.stringify(requirement).toLowerCase();
  return text.includes('valid') ||
    text.includes('require') ||
    text.includes('must') ||
    text.includes('should');
}

/**
 * Generate preconditions for requirement
 * @param {object} requirement - Requirement data
 * @returns {Array} Preconditions
 */
export function generatePreconditions(requirement) {
  const preconditions = [];

  if (requirement.name?.toLowerCase().includes('auth')) {
    preconditions.push({
      type: 'authentication',
      action: 'login',
      data: { user: 'testUser' }
    });
  }

  if (requirement.dependencies?.length > 0) {
    preconditions.push({
      type: 'dependency',
      action: 'ensure',
      data: { dependencies: requirement.dependencies }
    });
  }

  return preconditions;
}

/**
 * Generate expected results from acceptance criteria
 * @param {Array} acceptanceCriteria - Acceptance criteria
 * @returns {Array} Expected results
 */
export function generateExpectedResults(acceptanceCriteria) {
  return acceptanceCriteria.map(criteria => ({
    criteria: typeof criteria === 'string' ? criteria : criteria.text,
    validated: false
  }));
}

/**
 * Generate test data
 * @returns {object} Test data
 */
export function generateTestData() {
  return {
    valid: { input: 'Valid test data', expected: 'Success' },
    invalid: { input: '', expected: 'Validation error' },
    edge: { input: 'x'.repeat(1000), expected: 'Handle large input' }
  };
}

/**
 * Generate cleanup steps
 * @returns {Array} Cleanup steps
 */
export function generateCleanupSteps() {
  return [
    { action: 'clearStorage', target: 'localStorage' },
    { action: 'clearCookies', target: 'all' }
  ];
}
