#!/usr/bin/env node
/**
 * 📋 Test Plan Generator
 *
 * BMAD Enhancement: Structured test planning for comprehensive coverage
 *
 * Purpose:
 * - Generate comprehensive test plans during PLAN phase
 * - Store structured test strategies in test_plans table
 * - Link test plans to PRD and user stories
 * - Provide clear guidance for test execution
 *
 * Generates 4 test strategies:
 * 1. Unit Test Strategy (business logic, utilities, services)
 * 2. E2E Test Strategy (user flows, acceptance criteria)
 * 3. Integration Test Strategy (API endpoints, database, third-party)
 * 4. Performance Test Strategy (load, response time, scalability)
 */

// Removed unused import: createDatabaseClient

/**
 * Generate comprehensive test plan for SD
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Test plan with all strategies
 */
export async function generateTestPlan(sd_id, supabase, _options = {}) {
  console.log(`📋 Generating comprehensive test plan for ${sd_id}...`);

  // ================================================
  // 1. FETCH CONTEXT (SD, PRD, User Stories)
  // ================================================
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, description, category, scope, priority')
    .eq('id', sd_id)
    .single();

  if (sdError || !sd) {
    throw new Error(`Failed to fetch SD: ${sdError?.message || 'SD not found'}`);
  }

  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sd_id)
    .single();

  // PRD is optional - test plan can be generated without it
  if (prdError && prdError.code !== 'PGRST116') {
    console.warn(`   ⚠️  Warning: Could not fetch PRD - ${prdError.message}`);
  }

  const { data: userStories, error: storiesError } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', sd_id)
    .order('story_key');

  if (storiesError) {
    console.warn(`   ⚠️  Warning: Could not fetch user stories - ${storiesError.message}`);
  }

  const storyCount = userStories?.length || 0;
  console.log(`   Context: ${sd.title}`);
  console.log(`   User Stories: ${storyCount}`);
  console.log(`   PRD: ${prd ? 'Found' : 'Not found (will use SD context)'}\n`);

  // ================================================
  // 2. GENERATE UNIT TEST STRATEGY
  // ================================================
  console.log('   🧪 Generating Unit Test Strategy...');
  const unitTestStrategy = await generateUnitTestStrategy(sd, prd, userStories);
  console.log(`      Test Cases: ${unitTestStrategy.test_cases.length}`);
  console.log(`      Coverage Target: ${unitTestStrategy.coverage_targets.statements}%`);

  // ================================================
  // 3. GENERATE E2E TEST STRATEGY
  // ================================================
  console.log('   🎭 Generating E2E Test Strategy...');
  const e2eTestStrategy = await generateE2ETestStrategy(sd, prd, userStories);
  console.log(`      Test Cases: ${e2eTestStrategy.test_cases.length}`);
  console.log(`      User Story Mapping: ${e2eTestStrategy.user_story_mapping.length} stories`);

  // ================================================
  // 4. GENERATE INTEGRATION TEST STRATEGY
  // ================================================
  console.log('   🔗 Generating Integration Test Strategy...');
  const integrationTestStrategy = await generateIntegrationTestStrategy(sd, prd, userStories);
  console.log(`      Test Cases: ${integrationTestStrategy.test_cases.length}`);
  console.log(`      Dependencies: ${integrationTestStrategy.dependencies.length}`);

  // ================================================
  // 5. GENERATE PERFORMANCE TEST STRATEGY
  // ================================================
  console.log('   ⚡ Generating Performance Test Strategy...');
  const performanceTestStrategy = await generatePerformanceTestStrategy(sd, prd, userStories);
  console.log(`      Test Cases: ${performanceTestStrategy.test_cases.length}`);
  console.log(`      Benchmarks: ${performanceTestStrategy.benchmarks.length}`);

  return {
    sd_id,
    prd_id: prd?.id || null,
    unit_test_strategy: unitTestStrategy,
    e2e_test_strategy: e2eTestStrategy,
    integration_test_strategy: integrationTestStrategy,
    performance_test_strategy: performanceTestStrategy,
    metadata: {
      generated_at: new Date().toISOString(),
      user_story_count: storyCount,
      prd_available: !!prd
    }
  };
}

/**
 * Generate Unit Test Strategy
 *
 * Focus: Business logic, utilities, services, data transformations
 * Coverage: Statements, branches, functions
 */
async function generateUnitTestStrategy(sd, prd, userStories) {
  const testCases = [];

  // Default test cases for common patterns
  testCases.push({
    id: 'UT-001',
    name: 'Component mounting and initial state',
    description: 'Verify component mounts correctly with expected initial state',
    type: 'smoke',
    priority: 'HIGH',
    frameworks: ['vitest', '@testing-library/react'],
    estimated_duration_seconds: 30
  });

  testCases.push({
    id: 'UT-002',
    name: 'Input validation and error handling',
    description: 'Test input validation rules and error message display',
    type: 'validation',
    priority: 'HIGH',
    frameworks: ['vitest'],
    estimated_duration_seconds: 45
  });

  testCases.push({
    id: 'UT-003',
    name: 'State management and data flow',
    description: 'Verify state updates propagate correctly through component tree',
    type: 'integration',
    priority: 'MEDIUM',
    frameworks: ['vitest', '@testing-library/react'],
    estimated_duration_seconds: 60
  });

  // Add test cases based on user stories
  if (userStories && userStories.length > 0) {
    userStories.forEach((story, idx) => {
      testCases.push({
        id: `UT-${String(idx + 4).padStart(3, '0')}`,
        name: `Business logic for ${story.story_key}`,
        description: `Unit tests for business logic implementing "${story.title}"`,
        type: 'feature',
        priority: determinePriority(story),
        user_story_ref: story.story_key,
        frameworks: ['vitest'],
        estimated_duration_seconds: 60
      });
    });
  }

  // Add test cases for specific SD categories
  if (isAPISD(sd)) {
    testCases.push({
      id: 'UT-API-001',
      name: 'API endpoint request/response handling',
      description: 'Test API endpoints with various request payloads',
      type: 'api',
      priority: 'HIGH',
      frameworks: ['vitest', 'msw'],
      estimated_duration_seconds: 90
    });
  }

  if (isDatabaseSD(sd)) {
    testCases.push({
      id: 'UT-DB-001',
      name: 'Database query logic and error handling',
      description: 'Test database queries with mocked Supabase client',
      type: 'database',
      priority: 'HIGH',
      frameworks: ['vitest', 'pg-mem'],
      estimated_duration_seconds: 120
    });
  }

  return {
    test_cases: testCases,
    coverage_targets: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    },
    frameworks: ['vitest', '@testing-library/react', 'msw'],
    execution_order: ['smoke', 'validation', 'integration', 'feature', 'api', 'database'],
    total_estimated_duration_seconds: testCases.reduce((sum, tc) => sum + (tc.estimated_duration_seconds || 0), 0)
  };
}

/**
 * Generate E2E Test Strategy
 *
 * Focus: User flows, acceptance criteria, UI interactions
 * Coverage: 100% user story mapping (≥1 test per story)
 */
async function generateE2ETestStrategy(sd, prd, userStories) {
  const testCases = [];
  const userStoryMapping = [];

  // Authentication flow (if auth-related SD)
  if (isAuthSD(sd)) {
    testCases.push({
      id: 'E2E-AUTH-001',
      name: 'User login flow',
      description: 'Complete login workflow from landing page to authenticated dashboard',
      type: 'authentication',
      priority: 'CRITICAL',
      user_actions: ['Navigate to login', 'Enter credentials', 'Submit form', 'Verify redirect'],
      expected_outcomes: ['Successful authentication', 'Dashboard loads', 'User data displayed'],
      estimated_duration_seconds: 180
    });
  }

  // Generate E2E test for each user story (MANDATORY 100% coverage)
  if (userStories && userStories.length > 0) {
    userStories.forEach((story, idx) => {
      const testCase = {
        id: `E2E-${String(idx + 1).padStart(3, '0')}`,
        name: `${story.story_key}: ${story.title}`,
        description: `E2E test validating acceptance criteria for user story ${story.story_key}`,
        type: 'user_story',
        priority: determinePriority(story),
        user_story_ref: story.story_key,
        user_actions: parseUserActions(story),
        expected_outcomes: parseExpectedOutcomes(story),
        test_data: story.test_data || {},
        estimated_duration_seconds: 120
      };

      testCases.push(testCase);

      userStoryMapping.push({
        story_key: story.story_key,
        story_title: story.title,
        test_case_id: testCase.id,
        coverage_status: 'planned'
      });
    });
  }

  // Default E2E smoke tests
  testCases.push({
    id: 'E2E-SMOKE-001',
    name: 'Page load and navigation smoke test',
    description: 'Verify page loads without errors and basic navigation works',
    type: 'smoke',
    priority: 'CRITICAL',
    user_actions: ['Load application', 'Navigate to main sections', 'Verify no console errors'],
    expected_outcomes: ['All pages load', 'Navigation works', 'No errors in console'],
    locator_strategy: 'role-based (getByRole, getByLabel)',
    estimated_duration_seconds: 90
  });

  // Visual regression test for UI changes
  if (isUISD(sd)) {
    testCases.push({
      id: 'E2E-VISUAL-001',
      name: 'Visual regression baseline verification',
      description: 'Capture and compare screenshots of critical UI components',
      type: 'visual_regression',
      priority: 'MEDIUM',
      user_actions: ['Navigate to main pages', 'Capture screenshots', 'Compare with baseline'],
      expected_outcomes: ['Screenshots match baseline', 'No unintended visual changes'],
      locator_strategy: 'role-based + toHaveScreenshot()',
      playwright_features: ['toHaveScreenshot()', 'animations: disabled', 'mask dynamic content'],
      estimated_duration_seconds: 120
    });
  }

  return {
    test_cases: testCases,
    user_story_mapping: userStoryMapping,
    scenarios: extractScenarios(sd, prd),
    frameworks: ['playwright', '@playwright/test'],
    browser_matrix: ['chromium', 'firefox', 'webkit'],
    execution_order: ['smoke', 'authentication', 'user_story', 'visual_regression', 'edge_case'],
    locator_guidelines: {
      priority_hierarchy: ['getByRole()', 'getByLabel()', 'getByTestId()', 'getByText()', 'CSS selectors (last resort)'],
      best_practices: [
        'Use role-based locators for accessibility and resilience',
        'Avoid text-based regex locators (brittle)',
        'Add data-testid for complex components',
        'Test locators work with Radix UI/Shadcn components',
        'Reference: docs/testing/locator-strategy-guide.md'
      ]
    },
    visual_regression: {
      enabled: isUISD(sd),
      strategy: 'toHaveScreenshot() for critical pages',
      baseline_storage: 'tests/e2e/__screenshots__/',
      configuration: {
        animations: 'disabled',
        maxDiffPixels: 100,
        mask_dynamic_content: true
      },
      reference: 'docs/testing/visual-regression-guide.md'
    },
    debugging_tools: {
      ui_mode: 'npm run test:e2e:ui (interactive test runner)',
      trace_viewer: 'Automatic trace capture on failure',
      reference: 'docs/testing/ui-mode-debugging.md'
    },
    total_estimated_duration_seconds: testCases.reduce((sum, tc) => sum + (tc.estimated_duration_seconds || 0), 0),
    coverage_requirement: '100% user story mapping (≥1 E2E test per story)'
  };
}

/**
 * Generate Integration Test Strategy
 *
 * Focus: API integrations, database operations, third-party services
 * Coverage: All external dependencies
 */
async function generateIntegrationTestStrategy(sd, _prd, _userStories) {
  const testCases = [];
  const dependencies = [];

  // Database integration tests
  if (isDatabaseSD(sd)) {
    testCases.push({
      id: 'INT-DB-001',
      name: 'Database connection and query execution',
      description: 'Test database connectivity and basic CRUD operations',
      type: 'database',
      priority: 'HIGH',
      test_scenarios: ['Connect to database', 'Execute SELECT query', 'Execute INSERT', 'Verify data integrity'],
      estimated_duration_seconds: 180
    });

    dependencies.push({
      name: 'Supabase PostgreSQL',
      type: 'database',
      test_mode: 'test_database',
      mocks_needed: false
    });
  }

  // API integration tests
  if (isAPISD(sd)) {
    testCases.push({
      id: 'INT-API-001',
      name: 'External API integration and error handling',
      description: 'Test API calls with real endpoints or mocked responses',
      type: 'api',
      priority: 'HIGH',
      test_scenarios: ['Successful API call', 'Error handling (4xx)', 'Error handling (5xx)', 'Timeout handling'],
      estimated_duration_seconds: 240
    });

    dependencies.push({
      name: 'External API',
      type: 'rest_api',
      test_mode: 'mocked',
      mocks_needed: true
    });
  }

  // Authentication integration
  if (isAuthSD(sd)) {
    testCases.push({
      id: 'INT-AUTH-001',
      name: 'Authentication service integration',
      description: 'Test authentication flow with Supabase Auth',
      type: 'authentication',
      priority: 'CRITICAL',
      test_scenarios: ['Login', 'Logout', 'Token refresh', 'Session persistence'],
      estimated_duration_seconds: 200
    });

    dependencies.push({
      name: 'Supabase Auth',
      type: 'authentication',
      test_mode: 'test_account',
      mocks_needed: false
    });
  }

  // Default integration test
  if (testCases.length === 0) {
    testCases.push({
      id: 'INT-001',
      name: 'Component integration test',
      description: 'Test integration between multiple components',
      type: 'component',
      priority: 'MEDIUM',
      test_scenarios: ['Component communication', 'Data flow', 'Event handling'],
      estimated_duration_seconds: 150
    });
  }

  return {
    test_cases: testCases,
    dependencies: dependencies,
    mocks_needed: dependencies.filter(d => d.mocks_needed).length,
    test_environment: detectTestEnvironment(sd),
    frameworks: ['vitest', 'msw', '@testing-library/react'],
    execution_order: ['authentication', 'database', 'api', 'component'],
    total_estimated_duration_seconds: testCases.reduce((sum, tc) => sum + (tc.estimated_duration_seconds || 0), 0)
  };
}

/**
 * Generate Performance Test Strategy
 *
 * Focus: Load time, response time, scalability
 * Coverage: Critical paths and high-traffic endpoints
 */
async function generatePerformanceTestStrategy(sd, _prd, _userStories) {
  const testCases = [];
  const benchmarks = [];

  // Page load performance
  if (isUISD(sd)) {
    testCases.push({
      id: 'PERF-001',
      name: 'Page load time benchmark',
      description: 'Measure page load time under normal conditions',
      type: 'page_load',
      priority: 'MEDIUM',
      metrics: ['First Contentful Paint', 'Time to Interactive', 'Largest Contentful Paint'],
      estimated_duration_seconds: 120
    });

    benchmarks.push({
      metric: 'Page Load Time',
      target: '< 3 seconds',
      threshold: '3000ms',
      measurement_method: 'Lighthouse'
    });
  }

  // API response time
  if (isAPISD(sd)) {
    testCases.push({
      id: 'PERF-API-001',
      name: 'API response time under load',
      description: 'Measure API response times with concurrent requests',
      type: 'api_performance',
      priority: 'HIGH',
      metrics: ['Response time (p50, p95, p99)', 'Throughput (requests/sec)', 'Error rate'],
      estimated_duration_seconds: 300
    });

    benchmarks.push({
      metric: 'API Response Time (p95)',
      target: '< 500ms',
      threshold: '500ms',
      measurement_method: 'Artillery / K6'
    });
  }

  // Database query performance
  if (isDatabaseSD(sd)) {
    testCases.push({
      id: 'PERF-DB-001',
      name: 'Database query performance',
      description: 'Measure query execution time and optimization',
      type: 'database_performance',
      priority: 'MEDIUM',
      metrics: ['Query execution time', 'Index usage', 'N+1 query detection'],
      estimated_duration_seconds: 180
    });

    benchmarks.push({
      metric: 'Database Query Time',
      target: '< 100ms',
      threshold: '100ms',
      measurement_method: 'PostgreSQL EXPLAIN ANALYZE'
    });
  }

  // Default performance test
  if (testCases.length === 0) {
    testCases.push({
      id: 'PERF-001',
      name: 'Component rendering performance',
      description: 'Measure component render time and re-render optimization',
      type: 'rendering',
      priority: 'LOW',
      metrics: ['Render time', 'Re-render count', 'Memory usage'],
      estimated_duration_seconds: 90
    });
  }

  return {
    test_cases: testCases,
    benchmarks: benchmarks,
    thresholds: benchmarks.map(b => ({
      metric: b.metric,
      threshold: b.threshold,
      severity: b.priority === 'HIGH' ? 'CRITICAL' : 'WARNING'
    })),
    frameworks: ['lighthouse', 'artillery', 'k6'],
    execution_order: ['page_load', 'api_performance', 'database_performance', 'rendering'],
    total_estimated_duration_seconds: testCases.reduce((sum, tc) => sum + (tc.estimated_duration_seconds || 0), 0),
    optional: true // Performance tests are optional for most SDs
  };
}

/**
 * Store test plan in database
 *
 * @param {Object} testPlan - Generated test plan
 * @param {Object} supabase - Supabase client (must use SERVICE_ROLE_KEY)
 * @returns {Promise<Object>} Result with test plan ID
 */
export async function storeTestPlan(testPlan, supabase) {
  console.log('\n💾 Storing test plan in database...');

  const { data, error } = await supabase
    .from('test_plans')
    .insert({
      sd_id: testPlan.sd_id,
      prd_id: testPlan.prd_id,
      unit_test_strategy: testPlan.unit_test_strategy,
      e2e_test_strategy: testPlan.e2e_test_strategy,
      integration_test_strategy: testPlan.integration_test_strategy,
      performance_test_strategy: testPlan.performance_test_strategy
    })
    .select('id')
    .single();

  if (error) {
    console.error(`   ❌ Failed to store test plan: ${error.message}`);
    throw error;
  }

  console.log(`   ✅ Test plan stored with ID: ${data.id}`);
  return { id: data.id, sd_id: testPlan.sd_id };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function isUISD(sd) {
  const uiCategories = ['UI', 'Feature', 'Dashboard', 'Component', 'Page', 'Frontend'];
  const uiKeywords = ['component', 'page', 'dashboard', 'interface', 'form', 'button', 'modal'];

  const categoryMatch = uiCategories.some(cat =>
    sd.category?.toLowerCase().includes(cat.toLowerCase())
  );

  const scopeMatch = uiKeywords.some(kw =>
    sd.scope?.toLowerCase().includes(kw) || sd.description?.toLowerCase().includes(kw)
  );

  return categoryMatch || scopeMatch;
}

function isAPISD(sd) {
  const apiKeywords = ['api', 'endpoint', 'rest', 'graphql', 'webhook', 'integration'];
  const content = `${sd.title} ${sd.description || ''} ${sd.scope || ''}`.toLowerCase();
  return apiKeywords.some(kw => content.includes(kw));
}

function isDatabaseSD(sd) {
  const dbKeywords = ['database', 'migration', 'schema', 'table', 'query', 'sql', 'supabase', 'postgresql'];
  const content = `${sd.title} ${sd.description || ''} ${sd.scope || ''}`.toLowerCase();
  return dbKeywords.some(kw => content.includes(kw));
}

function isAuthSD(sd) {
  const authKeywords = ['auth', 'login', 'authentication', 'authorization', 'session', 'token', 'rbac'];
  const content = `${sd.title} ${sd.description || ''} ${sd.scope || ''}`.toLowerCase();
  return authKeywords.some(kw => content.includes(kw));
}

function determinePriority(story) {
  if (story.priority) {
    const p = story.priority.toLowerCase();
    if (p.includes('critical') || p.includes('high')) return 'HIGH';
    if (p.includes('low')) return 'LOW';
  }
  return 'MEDIUM';
}

function parseUserActions(story) {
  // Extract user actions from story description or acceptance criteria
  const actions = [];
  const text = `${story.description || ''} ${story.acceptance_criteria || ''}`;

  // Common action patterns
  const actionPatterns = [
    /user (can|should|will|must) (.+?)(?:\.|,|$)/gi,
    /when user (.+?)(?:\.|,|$)/gi,
    /click (.+?)(?:\.|,|$)/gi,
    /navigate to (.+?)(?:\.|,|$)/gi
  ];

  actionPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      actions.push(match[0].trim());
    }
  });

  return actions.length > 0 ? actions : ['Navigate to feature', 'Interact with UI', 'Verify behavior'];
}

function parseExpectedOutcomes(story) {
  // Extract expected outcomes from acceptance criteria
  const outcomes = [];
  const text = story.acceptance_criteria || story.description || '';

  // Common outcome patterns
  const outcomePatterns = [
    /then (.+?)(?:\.|$)/gi,
    /system (should|will|must) (.+?)(?:\.|$)/gi,
    /verify (.+?)(?:\.|$)/gi
  ];

  outcomePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      outcomes.push(match[0].trim());
    }
  });

  return outcomes.length > 0 ? outcomes : ['Feature works as expected', 'No errors occur', 'Data is correct'];
}

function extractScenarios(sd, prd) {
  // Extract test scenarios from SD/PRD description
  const scenarios = ['Happy path', 'Error handling', 'Edge cases'];

  if (prd?.functional_requirements) {
    scenarios.push('Functional requirements validation');
  }

  if (prd?.non_functional_requirements) {
    scenarios.push('Non-functional requirements validation');
  }

  return scenarios;
}

function detectTestEnvironment(sd) {
  // Determine appropriate test environment
  if (isAuthSD(sd) || isDatabaseSD(sd)) {
    return 'test_database';
  }

  if (isAPISD(sd)) {
    return 'mocked_services';
  }

  return 'development';
}
