#!/usr/bin/env node
/**
 * Generate user stories for SD-FOUNDATION-V3-007 (Chairman Dashboard E2E Test Suite)
 * Quality SD focused on E2E test implementation
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-FOUNDATION-V3-007';
const PRD_ID = 'PRD-SD-FOUNDATION-V3-007';

const userStories = [
  // FR-1: AUTH-FLOW
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Chairman Login Flow E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test the complete chairman authentication flow',
    user_benefit: 'Verify Rick\'s credentials work and he is redirected to the chairman dashboard',
    story_points: 3,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy Path - Successful Chairman Login',
        given: 'User is on the login page AND chairman credentials are configured in test environment',
        when: 'User enters email "rick@ehg.com" AND enters correct password AND clicks "Sign In"',
        then: 'Authentication succeeds AND user is redirected to "/chairman" route AND EVA greeting is visible AND no error messages shown'
      },
      {
        id: 'AC-001-2',
        scenario: 'Error Path - Invalid Credentials',
        given: 'User is on the login page',
        when: 'User enters email "rick@ehg.com" AND enters incorrect password AND clicks "Sign In"',
        then: 'Authentication fails AND error message "Invalid login credentials" is displayed AND user remains on login page'
      },
      {
        id: 'AC-001-3',
        scenario: 'Edge Case - Session Persistence',
        given: 'Chairman is logged in AND has active session',
        when: 'User refreshes the page OR navigates away and returns',
        then: 'Session persists AND user remains on chairman dashboard AND no re-authentication required'
      },
      {
        id: 'AC-001-4',
        scenario: 'Security - Role-Based Access',
        given: 'User is authenticated with non-chairman role (e.g., normal user)',
        when: 'User attempts to navigate to "/chairman" route',
        then: 'Access is denied OR user is redirected to appropriate dashboard AND chairman-specific features are NOT visible'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-001-chairman-login.spec.ts',
      'Tests pass for valid chairman credentials login',
      'Tests validate invalid credentials rejection',
      'Tests verify session persistence after page refresh',
      'Tests verify role-based access control',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Login page at /auth/login. Chairman route at /chairman. Use Supabase Auth for authentication. Environment variables for test credentials.',
    implementation_approach: 'Create Playwright spec file with test cases for each acceptance criteria. Use page object model for login page interactions. Test both happy path and error scenarios.',
    implementation_context: 'FR-1: AUTH-FLOW - Critical path for all chairman dashboard tests. Must complete before dashboard tests.',
    architecture_references: [
      'app/auth/login/page.tsx - Login page component',
      'lib/supabase/auth.ts - Authentication utilities',
      'middleware.ts - Route protection and role-based access',
      'app/chairman/page.tsx - Chairman dashboard entry point'
    ]
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Chairman Session Management E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test chairman session timeout and logout flows',
    user_benefit: 'Verify session security and proper cleanup',
    story_points: 2,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy Path - Manual Logout',
        given: 'Chairman is logged in with active session',
        when: 'Chairman clicks logout button',
        then: 'Session is terminated AND user is redirected to login page AND attempting to access /chairman shows login page'
      },
      {
        id: 'AC-002-2',
        scenario: 'Edge Case - Session Expiration Handling',
        given: 'Chairman has expired session token',
        when: 'Chairman attempts to access protected route',
        then: 'User is redirected to login AND appropriate message is shown'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-002-chairman-session.spec.ts',
      'Tests pass for manual logout flow',
      'Tests validate session cleanup',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Session managed by Supabase Auth. Logout clears local storage and cookies.',
    implementation_approach: 'Create Playwright spec testing logout and session expiration scenarios.',
    implementation_context: 'FR-1: AUTH-FLOW - Session security testing.',
    architecture_references: [
      'lib/supabase/auth.ts - Session management',
      'components/chairman-v2/ChairmanLayout.tsx - Logout button location'
    ]
  },
  // FR-2: BRIEFING-DASHBOARD
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'EVA Morning Briefing Display E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test the EVA greeting and briefing components render correctly',
    user_benefit: 'Verify chairman receives personalized greeting and relevant insights',
    story_points: 3,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy Path - EVA Greeting Renders',
        given: 'Chairman is authenticated AND on dashboard',
        when: 'Dashboard loads completely',
        then: 'EVA greeting displays with time-appropriate greeting (morning/afternoon/evening) AND chairman name "Rick" is visible'
      },
      {
        id: 'AC-003-2',
        scenario: 'Happy Path - Proactive Insights Display',
        given: 'Chairman dashboard is loaded AND insights API returns data',
        when: 'EVAGreeting component renders',
        then: 'Proactive insights are visible AND prioritized by urgency AND click navigation works'
      },
      {
        id: 'AC-003-3',
        scenario: 'Error Path - API Failure Handling',
        given: 'Briefing API is unavailable or returns error',
        when: 'Dashboard attempts to load briefing data',
        then: 'Graceful error message is shown AND dashboard remains usable'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-003-eva-briefing.spec.ts',
      'Tests verify EVA greeting renders with correct time-of-day greeting',
      'Tests verify insights display correctly',
      'Tests handle API error scenarios gracefully',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'EVAGreeting component at /components/chairman-v2/EVAGreeting.tsx. Uses /api/v2/chairman/briefing and /api/v2/chairman/insights endpoints.',
    implementation_approach: 'Create Playwright spec with assertions for EVA greeting content. Mock API responses for error scenarios.',
    implementation_context: 'FR-2: BRIEFING-DASHBOARD - Core user experience testing.',
    architecture_references: [
      'components/chairman-v2/EVAGreeting.tsx - EVA greeting component',
      'components/chairman-v2/BriefingDashboard.tsx - Dashboard container',
      'api/v2/chairman/briefing - Briefing API endpoint',
      'api/v2/chairman/insights - Insights API endpoint'
    ]
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Dashboard Metrics and KPIs E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test dashboard KPI cards and metrics display',
    user_benefit: 'Verify chairman sees accurate portfolio and budget information',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy Path - Quick Stats Display',
        given: 'Chairman dashboard is loaded AND portfolio data exists',
        when: 'QuickStatCard components render',
        then: 'Total ventures count is visible AND active ventures count is visible AND tokens available are displayed'
      },
      {
        id: 'AC-004-2',
        scenario: 'Happy Path - Token Budget Bar',
        given: 'Chairman dashboard is loaded AND budget data exists',
        when: 'TokenBudgetBar component renders',
        then: 'Budget utilization percentage is shown AND visual bar reflects percentage AND remaining tokens displayed'
      },
      {
        id: 'AC-004-3',
        scenario: 'Data Accuracy - Metrics Match API',
        given: 'API returns specific metrics values',
        when: 'Dashboard displays metrics',
        then: 'Displayed values match API response exactly'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-004-dashboard-metrics.spec.ts',
      'Tests verify all KPI cards render with data',
      'Tests verify token budget bar accuracy',
      'Tests validate data matches API responses',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'QuickStatCard and TokenBudgetBar components. Uses /api/v2/chairman/briefing for data.',
    implementation_approach: 'Create Playwright spec asserting metric values. Intercept API to verify data mapping.',
    implementation_context: 'FR-2: BRIEFING-DASHBOARD - Data accuracy validation.',
    architecture_references: [
      'components/chairman-v2/QuickStatCard.tsx - KPI card component',
      'components/chairman-v2/TokenBudgetBar.tsx - Budget visualization',
      'api/v2/chairman/briefing - Data source'
    ]
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Dashboard Component Rendering E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test all dashboard components render without errors',
    user_benefit: 'Verify complete dashboard UI functionality',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy Path - All Components Render',
        given: 'Chairman is authenticated and on dashboard',
        when: 'Dashboard page loads completely',
        then: 'BriefingDashboard renders AND EVAGreeting renders AND DecisionStack renders AND PortfolioSummary renders AND no console errors'
      },
      {
        id: 'AC-005-2',
        scenario: 'Responsive Design - Mobile View',
        given: 'Chairman accesses dashboard on mobile viewport',
        when: 'Dashboard renders',
        then: 'Components stack appropriately AND no horizontal scroll AND touch interactions work'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-005-dashboard-components.spec.ts',
      'Tests verify all major components render',
      'Tests verify no console errors',
      'Tests verify responsive layout',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Full component hierarchy test. Use data-testid selectors for reliability.',
    implementation_approach: 'Create Playwright spec checking for component presence. Test multiple viewport sizes.',
    implementation_context: 'FR-2: BRIEFING-DASHBOARD - UI completeness verification.',
    architecture_references: [
      'components/chairman-v2/BriefingDashboard.tsx - Main dashboard component',
      'components/chairman-v2/ChairmanLayout.tsx - Layout wrapper'
    ]
  },
  // FR-3: DECISION-WORKFLOW
  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'View Decision Stack E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test the decision stack displays pending decisions correctly',
    user_benefit: 'Verify chairman can see all pending decisions requiring action',
    story_points: 3,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy Path - Decision Stack Display',
        given: 'Chairman dashboard is loaded AND pending decisions exist',
        when: 'DecisionStack component renders',
        then: 'Pending decisions are listed AND ordered by priority AND decision type is visible AND venture name is visible'
      },
      {
        id: 'AC-006-2',
        scenario: 'Edge Case - Empty Decision Stack',
        given: 'Chairman dashboard is loaded AND no pending decisions exist',
        when: 'DecisionStack component renders',
        then: 'Empty state message is shown AND "No pending decisions" text is visible'
      },
      {
        id: 'AC-006-3',
        scenario: 'Interaction - Decision Card Expansion',
        given: 'Decision stack has pending decisions',
        when: 'Chairman clicks on a decision card',
        then: 'Decision details expand AND evidence summary is visible AND action buttons are shown'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-006-decision-stack.spec.ts',
      'Tests verify decision stack displays correctly',
      'Tests handle empty state',
      'Tests verify card interaction',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'DecisionStack component. Uses /api/v2/chairman/decisions endpoint.',
    implementation_approach: 'Create Playwright spec for decision stack display and interaction.',
    implementation_context: 'FR-3: DECISION-WORKFLOW - Core decision viewing functionality.',
    architecture_references: [
      'components/chairman-v2/DecisionStack.tsx - Decision stack component',
      'api/v2/chairman/decisions - Decisions API endpoint'
    ]
  },
  {
    story_key: `${SD_ID}:US-007`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Approve Decision Workflow E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test the complete decision approval workflow',
    user_benefit: 'Verify chairman can approve decisions and see confirmation',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Happy Path - Approve Decision',
        given: 'Chairman has selected a pending decision',
        when: 'Chairman clicks "Approve" button AND confirms action',
        then: 'API call succeeds AND decision is removed from stack AND confirmation toast shown AND decision status updated'
      },
      {
        id: 'AC-007-2',
        scenario: 'Confirmation Dialog',
        given: 'Chairman clicks Approve on a decision',
        when: 'Confirmation dialog appears',
        then: 'Decision summary is shown AND "Confirm" and "Cancel" buttons available AND cancel returns to stack'
      },
      {
        id: 'AC-007-3',
        scenario: 'Error Handling - API Failure',
        given: 'Chairman attempts to approve AND API fails',
        when: 'API returns error',
        then: 'Error message is shown AND decision remains in stack AND retry option available'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-007-approve-decision.spec.ts',
      'Tests verify complete approval flow',
      'Tests verify confirmation dialog',
      'Tests handle API errors gracefully',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Uses /api/v2/chairman/decide endpoint with decision_type: GO. Includes idempotency key.',
    implementation_approach: 'Create Playwright spec for complete approval workflow. Mock API for error scenarios.',
    implementation_context: 'FR-3: DECISION-WORKFLOW - Core decision approval functionality.',
    architecture_references: [
      'components/chairman-v2/DecisionStack.tsx - Decision approval UI',
      'api/v2/chairman/decide - Decision submission endpoint'
    ]
  },
  {
    story_key: `${SD_ID}:US-008`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Reject Decision Workflow E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test the complete decision rejection workflow',
    user_benefit: 'Verify chairman can reject decisions with reasoning',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-008-1',
        scenario: 'Happy Path - Reject Decision with Reason',
        given: 'Chairman has selected a pending decision',
        when: 'Chairman clicks "Reject" AND provides rejection reason AND confirms',
        then: 'API call succeeds with NO_GO decision AND reason is stored AND decision removed from stack'
      },
      {
        id: 'AC-008-2',
        scenario: 'Validation - Reason Required',
        given: 'Chairman clicks Reject on a decision',
        when: 'Chairman attempts to submit without reason',
        then: 'Validation error shown AND submit disabled until reason provided'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-008-reject-decision.spec.ts',
      'Tests verify complete rejection flow',
      'Tests verify reason is required',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Uses /api/v2/chairman/decide endpoint with decision_type: NO_GO. Requires reasoning field.',
    implementation_approach: 'Create Playwright spec for rejection workflow with reason validation.',
    implementation_context: 'FR-3: DECISION-WORKFLOW - Decision rejection functionality.',
    architecture_references: [
      'components/chairman-v2/DecisionStack.tsx - Decision rejection UI',
      'api/v2/chairman/decide - Decision submission endpoint'
    ]
  },
  // FR-4: PORTFOLIO-NAVIGATION
  {
    story_key: `${SD_ID}:US-009`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Portfolio Ventures List E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test the portfolio summary and ventures list display',
    user_benefit: 'Verify chairman can view and navigate portfolio ventures',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-009-1',
        scenario: 'Happy Path - Portfolio Summary Display',
        given: 'Chairman dashboard is loaded AND ventures exist',
        when: 'PortfolioSummary component renders',
        then: 'Ventures are listed AND stage distribution is shown AND total count is accurate'
      },
      {
        id: 'AC-009-2',
        scenario: 'Interaction - Venture Selection',
        given: 'Portfolio shows ventures list',
        when: 'Chairman clicks on a venture',
        then: 'Venture details expand OR navigation to detail page occurs'
      },
      {
        id: 'AC-009-3',
        scenario: 'Filter - Stage Filtering',
        given: 'Portfolio has ventures across multiple stages',
        when: 'Chairman filters by specific stage',
        then: 'Only ventures in selected stage are shown AND filter state is visible'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-009-portfolio-ventures.spec.ts',
      'Tests verify portfolio summary display',
      'Tests verify venture interaction',
      'Tests verify stage filtering',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'PortfolioSummary component. Uses /api/v2/chairman/portfolios endpoint.',
    implementation_approach: 'Create Playwright spec for portfolio display and interaction.',
    implementation_context: 'FR-4: PORTFOLIO-NAVIGATION - Portfolio viewing functionality.',
    architecture_references: [
      'components/chairman-v2/PortfolioSummary.tsx - Portfolio component',
      'api/v2/chairman/portfolios - Portfolios API endpoint'
    ]
  },
  {
    story_key: `${SD_ID}:US-010`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage Timeline Navigation E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Test the 25-stage timeline visualization and navigation',
    user_benefit: 'Verify chairman can understand venture positions across lifecycle',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-010-1',
        scenario: 'Happy Path - Timeline Display',
        given: 'Chairman dashboard is loaded',
        when: 'StageTimeline component renders',
        then: 'All 25 stages are visible AND current stage is highlighted AND venture counts per stage shown'
      },
      {
        id: 'AC-010-2',
        scenario: 'Interaction - Stage Click',
        given: 'Timeline is displayed',
        when: 'Chairman clicks on a stage',
        then: 'Ventures in that stage are shown OR filtered in portfolio view'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman/US-007-010-stage-timeline.spec.ts',
      'Tests verify timeline renders all 25 stages',
      'Tests verify stage click interaction',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'StageTimeline component. May use lifecycle_stage_config for stage labels.',
    implementation_approach: 'Create Playwright spec for timeline display and navigation.',
    implementation_context: 'FR-4: PORTFOLIO-NAVIGATION - Stage timeline visualization.',
    architecture_references: [
      'components/chairman-v2/StageTimeline.tsx - Timeline component'
    ]
  },
  // FR-5: CI-CD-INTEGRATION
  {
    story_key: `${SD_ID}:US-011`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'CI/CD Pipeline Test Execution E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Configure and verify E2E tests run in CI/CD pipeline',
    user_benefit: 'Ensure tests execute automatically on each commit',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-011-1',
        scenario: 'Happy Path - GitHub Actions Workflow',
        given: 'Code is pushed to feature branch',
        when: 'GitHub Actions workflow triggers',
        then: 'E2E tests execute AND results are reported AND failures block merge'
      },
      {
        id: 'AC-011-2',
        scenario: 'Configuration - Test Environment',
        given: 'CI/CD pipeline runs',
        when: 'E2E tests start',
        then: 'Test environment variables are available AND test database is accessible AND Playwright is installed'
      },
      {
        id: 'AC-011-3',
        scenario: 'Reporting - Test Results',
        given: 'E2E tests complete',
        when: 'Results are generated',
        then: 'JUnit report is created AND screenshots on failure are saved AND artifacts are uploadable'
      }
    ],
    definition_of_done: [
      'GitHub Actions workflow updated: .github/workflows/e2e-tests.yml',
      'Test environment secrets configured',
      'Playwright reports uploaded as artifacts',
      'Test failures block PR merge',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'GitHub Actions workflow. Uses Playwright container. Requires CHAIRMAN_PASSWORD and SUPABASE secrets.',
    implementation_approach: 'Update GitHub Actions workflow to include E2E test job with proper configuration.',
    implementation_context: 'FR-5: CI-CD-INTEGRATION - Automated test execution.',
    architecture_references: [
      '.github/workflows/e2e-tests.yml - GitHub Actions workflow (to create/update)',
      'playwright.config.ts - Playwright configuration'
    ]
  },
  {
    story_key: `${SD_ID}:US-012`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Parallel Test Execution E2E Test',
    user_role: 'QA Engineer',
    user_want: 'Configure tests for parallel execution to reduce runtime',
    user_benefit: 'Faster CI/CD feedback loop',
    story_points: 5,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-012-1',
        scenario: 'Happy Path - Parallel Workers',
        given: 'Playwright config has workers configured',
        when: 'E2E tests run',
        then: 'Multiple test files run in parallel AND no test conflicts occur AND total runtime reduced'
      },
      {
        id: 'AC-012-2',
        scenario: 'Isolation - Test Independence',
        given: 'Tests run in parallel',
        when: 'Tests complete',
        then: 'No shared state conflicts AND each test uses isolated browser context'
      }
    ],
    definition_of_done: [
      'Playwright config updated for parallel execution',
      'Tests verified to be independent',
      'No shared state between tests',
      'Runtime measured and documented',
      'Tests run successfully in CI/CD pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Playwright workers configuration. Each test should use fresh browser context.',
    implementation_approach: 'Update Playwright config for optimal parallelism. Ensure test independence.',
    implementation_context: 'FR-5: CI-CD-INTEGRATION - Performance optimization.',
    architecture_references: [
      'playwright.config.ts - Workers and parallelism settings'
    ]
  }
];

async function insertUserStories() {
  console.log('='.repeat(70));
  console.log(`Inserting user stories for ${SD_ID}`);
  console.log('='.repeat(70));
  console.log();

  // First, lookup the SD UUID from strategic_directives_v2
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title')
    .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID}`)
    .single();

  if (sdError || !sdData) {
    console.error(`SD not found: ${SD_ID}`);
    console.error('Error:', sdError?.message);
    process.exit(1);
  }

  const sdUuid = sdData.id;
  console.log(`Found SD: ${sdData.title}`);
  console.log(`  UUID: ${sdUuid}`);
  console.log(`  Legacy ID: ${sdData.legacy_id || SD_ID}`);
  console.log();

  // Check if PRD exists
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_id, title')
    .eq('sd_id', sdUuid)
    .single();

  if (prdError) {
    console.log(`PRD check warning: ${prdError.message}`);
    console.log('Continuing without PRD link...');
  } else if (prd) {
    console.log(`Found PRD: ${prd.title}`);
  }
  console.log();

  // Check for existing stories using UUID
  const { data: existingStories } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', sdUuid);

  if (existingStories && existingStories.length > 0) {
    console.log(`Found ${existingStories.length} existing stories for ${SD_ID}`);
    console.log('Deleting existing stories to refresh...');

    const { error: deleteError } = await supabase
      .from('user_stories')
      .delete()
      .eq('sd_id', sdUuid);

    if (deleteError) {
      console.error('Failed to delete existing stories:', deleteError.message);
      process.exit(1);
    }
    console.log('Deleted existing stories');
    console.log();
  }

  // Insert new stories with UUID
  let successCount = 0;
  let failCount = 0;

  for (const story of userStories) {
    // Replace string SD_ID with actual UUID
    const storyWithUuid = {
      ...story,
      sd_id: sdUuid,
      prd_id: prd?.id || null  // Link to PRD if exists
    };

    const { error } = await supabase
      .from('user_stories')
      .insert(storyWithUuid);

    if (error) {
      console.error(`Failed to insert ${story.story_key}:`, error.message);
      failCount++;
    } else {
      console.log(`Inserted: ${story.story_key} - ${story.title}`);
      successCount++;
    }
  }

  console.log();
  console.log('='.repeat(70));
  console.log(`Results: ${successCount} inserted, ${failCount} failed`);
  console.log('='.repeat(70));

  if (failCount > 0) {
    process.exit(1);
  }

  console.log();
  console.log('Next steps:');
  console.log('  1. Retry PLAN-TO-EXEC handoff: node scripts/handoff.js execute PLAN-TO-EXEC SD-FOUNDATION-V3-007');
  console.log('  2. Implement E2E tests based on user stories');
  console.log();
  console.log(`Query stories: SELECT * FROM user_stories WHERE sd_id = '${sdUuid}'`);
}

insertUserStories().catch(console.error);
