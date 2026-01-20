#!/usr/bin/env node
/**
 * Add User Stories for SD-QA-STAGES-21-25-001
 * E2E Test Coverage for Venture Lifecycle Stages 21-25
 *
 * Creates user stories based on test scenarios:
 * - TS-1: Stage 21 - Create Test Plan
 * - TS-2: Stage 21 - Generate UAT Report
 * - TS-3: Stage 22 - Build Deployment Runbook
 * - TS-4: Stage 23 - Complete Launch Checklist
 * - TS-5: Stage 24 - View Analytics Dashboard
 * - TS-6: Stage 25 - Create Optimization Roadmap
 * - TS-7: Stage 25 - Assumptions vs Reality
 * - TS-8: Stage Navigation - Linear Progression
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-QA-STAGES-21-25-001';
const PRD_ID = 'PRD-SD-QA-STAGES-21-25-001';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
// story_key format: {SD-ID}:US-XXX (required by valid_story_key constraint)
const userStories = [
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage 21 - Create Test Plan',
    user_role: 'QA Engineer',
    user_want: 'Automated E2E test that validates the Create Test Plan functionality in Stage 21',
    user_benefit: 'Ensures QA teams can successfully create comprehensive test plans for venture releases',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Create test plan successfully',
        given: 'User is on Stage 21 (Create Test Plan) AND user is authenticated',
        when: 'User clicks "Create Test Plan" button AND fills in test plan details (scope, approach, resources) AND clicks "Submit"',
        then: 'Test plan is created in database AND user sees success message AND test plan appears in list'
      },
      {
        id: 'AC-001-2',
        scenario: 'Validation - Required fields',
        given: 'User is on Create Test Plan form',
        when: 'User leaves required field empty (test scope) AND clicks "Submit"',
        then: 'Form shows validation error "Test scope is required" AND test plan NOT created'
      },
      {
        id: 'AC-001-3',
        scenario: 'Test plan sections - Completeness',
        given: 'User is creating test plan',
        when: 'User reviews available sections',
        then: 'Form includes sections for: Test Scope, Test Approach, Test Resources, Test Schedule, Test Deliverables'
      },
      {
        id: 'AC-001-4',
        scenario: 'Navigation - Stage progression',
        given: 'Test plan is created successfully',
        when: 'User views stage status',
        then: 'Stage 21 shows as completed OR in-progress AND navigation allows moving to Stage 22'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-001-create-test-plan.spec.ts',
      'Test covers happy path (successful creation)',
      'Test covers validation errors (required fields)',
      'Test verifies test plan sections completeness',
      'Test validates database record creation',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should navigate to Stage 21, fill Create Test Plan form, submit, and verify database state. Use Playwright page object pattern for maintainability. Edge cases: Very long test scope text (>2000 characters), special characters in test plan fields, multiple test plans for same venture, concurrent test plan creation by multiple users.',
    implementation_approach: 'Create Playwright spec with page objects for Stage 21 test plan form. Use database helpers to verify test plan creation.',
    implementation_context: 'This is the first test in the suite - establishes patterns for remaining stage tests.',
    architecture_references: [
      'tests/e2e/ventures/venture-stages-1-5.spec.ts - existing stage test patterns',
      'tests/e2e/helpers/database-helpers.ts - database verification utilities',
      'src/components/ventures/stages/Stage21TestPlan.tsx',
      'src/hooks/useVentureStages.ts',
      'Database: venture_stages table'
    ],
    example_code_patterns: {
      test_structure: `test('US-001: Create Test Plan successfully', async ({ page }) => {
  await navigateToStage21(page, ventureId);
  await page.click('[data-testid="create-test-plan-btn"]');
  await page.fill('[name="test_scope"]', 'Comprehensive UAT');
  await page.fill('[name="test_approach"]', 'Black box and exploratory');
  await page.click('[data-testid="submit-test-plan"]');
  await expect(page.locator('.success-message')).toBeVisible();

  // Verify database
  const testPlan = await getTestPlan(ventureId);
  expect(testPlan.test_scope).toBe('Comprehensive UAT');
});`,
      page_object: `class Stage21Page {
  async createTestPlan(data) {
    await this.page.click('[data-testid="create-test-plan-btn"]');
    await this.fillTestPlanForm(data);
    await this.submitForm();
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Create test plan with all required fields', type: 'e2e', priority: 'P0' },
      { scenario: 'Validation error on missing required field', type: 'e2e', priority: 'P1' },
      { scenario: 'Test plan sections completeness', type: 'e2e', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage 21 - Generate UAT Report',
    user_role: 'QA Engineer',
    user_want: 'Automated E2E test that validates UAT Report generation in Stage 21',
    user_benefit: 'Ensures comprehensive UAT reports can be generated and downloaded for stakeholder review',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Generate UAT report',
        given: 'Test plan exists for venture AND user is on Stage 21',
        when: 'User clicks "Generate UAT Report" button',
        then: 'UAT report is generated AND report preview is shown AND download button is enabled'
      },
      {
        id: 'AC-002-2',
        scenario: 'Error path - No test plan',
        given: 'No test plan exists for venture',
        when: 'User attempts to generate UAT report',
        then: 'Error message shown "Create test plan before generating UAT report"'
      },
      {
        id: 'AC-002-3',
        scenario: 'Report content - Completeness',
        given: 'UAT report is generated',
        when: 'User reviews report content',
        then: 'Report includes: Test Summary, Test Results, Defects Found, Test Coverage, Sign-off Section'
      },
      {
        id: 'AC-002-4',
        scenario: 'Download functionality',
        given: 'UAT report is generated',
        when: 'User clicks "Download Report" button',
        then: 'PDF file downloads successfully with filename format "UAT_Report_{venture_name}_{date}.pdf"'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-002-generate-uat-report.spec.ts',
      'Test covers happy path (report generation)',
      'Test covers error case (no test plan)',
      'Test validates report content sections',
      'Test verifies download functionality',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should verify report generation, content structure, and PDF download. May need to mock PDF generation in test environment. Depends on US-001 (test plan must exist). Edge cases: Large test plan with 100+ test cases, test plan with no defects (all pass), test plan with all failures, network interruption during report generation.',
    implementation_approach: 'Create Playwright spec that triggers UAT report generation and validates response. Use download API to verify PDF file.',
    implementation_context: 'Depends on US-001 (test plan must exist). Tests report generation capability.',
    architecture_references: [
      'src/components/ventures/stages/Stage21UATReport.tsx',
      'src/lib/pdf-generator.ts - PDF generation utilities',
      'Database: test_plans, test_results tables'
    ],
    example_code_patterns: {
      test_structure: `test('US-002: Generate UAT Report successfully', async ({ page }) => {
  // Setup: Create test plan first
  await createTestPlan(ventureId);

  await navigateToStage21(page, ventureId);
  await page.click('[data-testid="generate-uat-report-btn"]');

  // Wait for report generation
  await expect(page.locator('.report-preview')).toBeVisible();

  // Verify report sections
  await expect(page.locator('.test-summary')).toBeVisible();
  await expect(page.locator('.test-results')).toBeVisible();

  // Test download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="download-report-btn"]')
  ]);
  expect(download.suggestedFilename()).toMatch(/UAT_Report_.*\\.pdf/);
});`
    },
    testing_scenarios: [
      { scenario: 'Generate UAT report with existing test plan', type: 'e2e', priority: 'P0' },
      { scenario: 'Error when no test plan exists', type: 'e2e', priority: 'P1' },
      { scenario: 'Verify report content completeness', type: 'e2e', priority: 'P1' },
      { scenario: 'Download UAT report as PDF', type: 'e2e', priority: 'P0' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage 22 - Build Deployment Runbook',
    user_role: 'DevOps Engineer',
    user_want: 'Automated E2E test that validates Deployment Runbook creation in Stage 22',
    user_benefit: 'Ensures deployment procedures are documented and accessible for production releases',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Create deployment runbook',
        given: 'User is on Stage 22 (Deployment Preparation) AND user is authenticated',
        when: 'User clicks "Create Deployment Runbook" AND fills deployment steps AND adds rollback procedures AND clicks "Save"',
        then: 'Runbook is saved to database AND success message shown AND runbook appears in stage view'
      },
      {
        id: 'AC-003-2',
        scenario: 'Validation - Required sections',
        given: 'User is creating deployment runbook',
        when: 'User attempts to save without required sections (deployment steps or rollback procedures)',
        then: 'Validation error shown AND runbook NOT saved'
      },
      {
        id: 'AC-003-3',
        scenario: 'Runbook sections - Completeness',
        given: 'User is building runbook',
        when: 'User reviews required sections',
        then: 'Form includes: Pre-deployment checklist, Deployment steps, Post-deployment validation, Rollback procedures, Contact information'
      },
      {
        id: 'AC-003-4',
        scenario: 'Runbook versioning',
        given: 'Deployment runbook already exists',
        when: 'User updates runbook and saves',
        then: 'New version is created AND previous version is archived AND version history is visible'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-003-deployment-runbook.spec.ts',
      'Test covers happy path (runbook creation)',
      'Test covers validation errors (missing required sections)',
      'Test verifies runbook section completeness',
      'Test validates versioning functionality',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should navigate to Stage 22, create deployment runbook, verify database persistence, and test versioning. Use structured runbook data. Edge cases: Very complex runbook with 50+ steps, runbook with embedded scripts or commands, concurrent runbook edits by multiple users, runbook export to external format (PDF, Markdown).',
    implementation_approach: 'Create Playwright spec for Stage 22 runbook builder. Use page object pattern for runbook form interactions.',
    implementation_context: 'Stage 22 is deployment preparation - critical for production readiness. Tests documentation completeness.',
    architecture_references: [
      'src/components/ventures/stages/Stage22DeploymentRunbook.tsx',
      'src/hooks/useDeploymentRunbooks.ts',
      'Database: deployment_runbooks, deployment_runbook_versions tables'
    ],
    example_code_patterns: {
      test_structure: `test('US-003: Create Deployment Runbook successfully', async ({ page }) => {
  await navigateToStage22(page, ventureId);
  await page.click('[data-testid="create-runbook-btn"]');

  // Fill runbook sections
  await page.fill('[name="pre_deployment_checklist"]', 'Backup database, notify team');
  await page.fill('[name="deployment_steps"]', '1. Deploy API, 2. Migrate DB, 3. Deploy UI');
  await page.fill('[name="rollback_procedures"]', 'Revert to previous version, restore backup');

  await page.click('[data-testid="save-runbook"]');
  await expect(page.locator('.success-message')).toBeVisible();

  // Verify database
  const runbook = await getDeploymentRunbook(ventureId);
  expect(runbook.deployment_steps).toContain('Deploy API');
});`
    },
    testing_scenarios: [
      { scenario: 'Create complete deployment runbook', type: 'e2e', priority: 'P0' },
      { scenario: 'Validation error on missing required sections', type: 'e2e', priority: 'P1' },
      { scenario: 'Update existing runbook (versioning)', type: 'e2e', priority: 'P1' },
      { scenario: 'View runbook version history', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage 23 - Complete Launch Checklist',
    user_role: 'Product Manager',
    user_want: 'Automated E2E test that validates Launch Checklist completion in Stage 23',
    user_benefit: 'Ensures all pre-launch tasks are completed before venture goes live',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy path - Complete all checklist items',
        given: 'User is on Stage 23 (Launch Preparation) AND launch checklist exists',
        when: 'User checks all checklist items as complete AND clicks "Mark Stage Complete"',
        then: 'All items marked complete in database AND stage status updates to completed AND user can progress to Stage 24'
      },
      {
        id: 'AC-004-2',
        scenario: 'Error path - Incomplete checklist',
        given: 'User is on Stage 23 with incomplete checklist items',
        when: 'User attempts to mark stage complete',
        then: 'Error shown "Complete all checklist items before proceeding" AND stage remains incomplete'
      },
      {
        id: 'AC-004-3',
        scenario: 'Checklist categories - Completeness',
        given: 'Launch checklist is displayed',
        when: 'User reviews checklist',
        then: 'Checklist includes categories: Technical Readiness, Business Readiness, Marketing Readiness, Legal/Compliance, Support Readiness'
      },
      {
        id: 'AC-004-4',
        scenario: 'Checklist item details',
        given: 'User clicks on checklist item',
        when: 'Item details modal opens',
        then: 'Modal shows item description, owner, due date, and completion notes field'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-004-launch-checklist.spec.ts',
      'Test covers happy path (complete all items)',
      'Test covers error case (incomplete checklist)',
      'Test validates checklist categories',
      'Test verifies item detail modal',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should load launch checklist, mark items complete, verify stage progression blocked until all complete, then allow progression. Edge cases: Checklist with 100+ items, partial completion saved on page refresh, multiple users completing same checklist, checklist item marked complete but later unchecked.',
    implementation_approach: 'Create Playwright spec for Stage 23 checklist. Test sequential item completion and final stage completion validation.',
    implementation_context: 'Stage 23 is final pre-launch gate - critical for launch readiness. Tests completeness enforcement.',
    architecture_references: [
      'src/components/ventures/stages/Stage23LaunchChecklist.tsx',
      'src/hooks/useLaunchChecklist.ts',
      'Database: launch_checklist_items, venture_stages tables'
    ],
    example_code_patterns: {
      test_structure: `test('US-004: Complete Launch Checklist successfully', async ({ page }) => {
  await navigateToStage23(page, ventureId);

  // Get all checklist items
  const checkboxes = page.locator('[data-testid^="checklist-item-"]');
  const count = await checkboxes.count();

  // Mark all items complete
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }

  // Verify all checked
  for (let i = 0; i < count; i++) {
    await expect(checkboxes.nth(i)).toBeChecked();
  }

  // Complete stage
  await page.click('[data-testid="complete-stage-btn"]');
  await expect(page.locator('.stage-complete-message')).toBeVisible();

  // Verify can proceed to Stage 24
  await expect(page.locator('[data-testid="stage-24-link"]')).toBeEnabled();
});`
    },
    testing_scenarios: [
      { scenario: 'Complete all checklist items and mark stage complete', type: 'e2e', priority: 'P0' },
      { scenario: 'Attempt stage completion with incomplete items', type: 'e2e', priority: 'P1' },
      { scenario: 'View checklist item details', type: 'e2e', priority: 'P1' },
      { scenario: 'Add completion notes to checklist item', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage 24 - View Analytics Dashboard',
    user_role: 'Product Owner',
    user_want: 'Automated E2E test that validates Analytics Dashboard viewing in Stage 24',
    user_benefit: 'Ensures post-launch analytics are visible and actionable for decision-making',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - View analytics dashboard',
        given: 'Venture is in Stage 24 (Post-Launch Monitoring) AND analytics data exists',
        when: 'User navigates to Stage 24',
        then: 'Analytics dashboard is displayed with key metrics: User count, Revenue, Engagement, Performance'
      },
      {
        id: 'AC-005-2',
        scenario: 'No data state',
        given: 'Venture is in Stage 24 but no analytics data exists yet',
        when: 'User views analytics dashboard',
        then: 'Empty state shown with message "Analytics data will appear here after launch"'
      },
      {
        id: 'AC-005-3',
        scenario: 'Dashboard widgets - Completeness',
        given: 'Analytics dashboard is displayed',
        when: 'User reviews available widgets',
        then: 'Dashboard includes: User Growth Chart, Revenue Trends, Feature Usage Heatmap, Performance Metrics, Error Rates'
      },
      {
        id: 'AC-005-4',
        scenario: 'Date range filtering',
        given: 'Analytics data spans multiple months',
        when: 'User selects date range filter (Last 7 days, Last 30 days, Last 90 days)',
        then: 'Dashboard updates to show data for selected period AND charts re-render'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-005-analytics-dashboard.spec.ts',
      'Test covers happy path (dashboard with data)',
      'Test covers empty state (no data yet)',
      'Test validates dashboard widget completeness',
      'Test verifies date range filtering',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should verify analytics dashboard renders correctly with mock data. May need to seed analytics data in test setup. Edge cases: Very large dataset (1M+ data points), real-time data updates (WebSocket), missing data for specific metrics, extremely slow query performance.',
    implementation_approach: 'Create Playwright spec for Stage 24 analytics dashboard. Use database helpers to seed analytics data for testing.',
    implementation_context: 'Stage 24 is post-launch monitoring - tests data visualization and filtering capabilities.',
    architecture_references: [
      'src/components/ventures/stages/Stage24Analytics.tsx',
      'src/hooks/useVentureAnalytics.ts',
      'src/components/charts/ - chart components',
      'Database: venture_analytics table'
    ],
    example_code_patterns: {
      test_structure: `test('US-005: View Analytics Dashboard successfully', async ({ page }) => {
  // Seed analytics data
  await seedAnalyticsData(ventureId);

  await navigateToStage24(page, ventureId);

  // Verify key metrics visible
  await expect(page.locator('[data-testid="metric-user-count"]')).toBeVisible();
  await expect(page.locator('[data-testid="metric-revenue"]')).toBeVisible();

  // Verify charts render
  await expect(page.locator('[data-testid="user-growth-chart"]')).toBeVisible();

  // Test date filtering
  await page.selectOption('[data-testid="date-range-filter"]', 'last_30_days');
  await expect(page.locator('.chart-loading')).toBeVisible();
  await expect(page.locator('.chart-loading')).not.toBeVisible();
});`
    },
    testing_scenarios: [
      { scenario: 'View analytics dashboard with data', type: 'e2e', priority: 'P0' },
      { scenario: 'View empty state when no data exists', type: 'e2e', priority: 'P1' },
      { scenario: 'Filter analytics by date range', type: 'e2e', priority: 'P1' },
      { scenario: 'Verify all dashboard widgets render', type: 'e2e', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage 25 - Create Optimization Roadmap',
    user_role: 'Product Strategist',
    user_want: 'Automated E2E test that validates Optimization Roadmap creation in Stage 25',
    user_benefit: 'Ensures continuous improvement plans are documented based on post-launch insights',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - Create optimization roadmap',
        given: 'User is on Stage 25 (Continuous Improvement) AND analytics data is available',
        when: 'User clicks "Create Roadmap" AND adds optimization initiatives AND sets priorities AND clicks "Save"',
        then: 'Roadmap is saved to database AND initiatives appear in timeline view AND roadmap is associated with venture'
      },
      {
        id: 'AC-006-2',
        scenario: 'Validation - Required fields',
        given: 'User is creating optimization roadmap',
        when: 'User attempts to save without required fields (initiative name, priority, or target date)',
        then: 'Validation error shown AND roadmap NOT saved'
      },
      {
        id: 'AC-006-3',
        scenario: 'Analytics integration',
        given: 'User is creating optimization roadmap',
        when: 'User views suggested initiatives',
        then: 'System suggests initiatives based on analytics insights AND shows data-driven recommendations'
      },
      {
        id: 'AC-006-4',
        scenario: 'Roadmap timeline view',
        given: 'Optimization roadmap exists with multiple initiatives',
        when: 'User switches to timeline view',
        then: 'Initiatives displayed on timeline with dates AND color-coded by priority (High=Red, Medium=Yellow, Low=Green)'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-006-optimization-roadmap.spec.ts',
      'Test covers happy path (roadmap creation)',
      'Test covers validation errors (missing required fields)',
      'Test validates analytics integration (suggested initiatives)',
      'Test verifies timeline view rendering',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should create optimization roadmap with multiple initiatives, verify analytics suggestions, and validate timeline visualization. Edge cases: Roadmap with 50+ initiatives, overlapping initiative dates, initiative with no target date (ongoing), roadmap export to external format.',
    implementation_approach: 'Create Playwright spec for Stage 25 roadmap builder. Test initiative creation and timeline rendering.',
    implementation_context: 'Stage 25 is continuous improvement planning - final stage in lifecycle. Tests roadmap creation and analytics integration.',
    architecture_references: [
      'src/components/ventures/stages/Stage25OptimizationRoadmap.tsx',
      'src/hooks/useOptimizationRoadmap.ts',
      'src/hooks/useVentureAnalytics.ts',
      'Database: optimization_roadmaps, roadmap_initiatives tables'
    ],
    example_code_patterns: {
      test_structure: `test('US-006: Create Optimization Roadmap successfully', async ({ page }) => {
  await navigateToStage25(page, ventureId);
  await page.click('[data-testid="create-roadmap-btn"]');

  // Add initiative
  await page.click('[data-testid="add-initiative-btn"]');
  await page.fill('[name="initiative_name"]', 'Improve onboarding flow');
  await page.selectOption('[name="priority"]', 'high');
  await page.fill('[name="target_date"]', '2025-03-01');

  await page.click('[data-testid="save-roadmap"]');
  await expect(page.locator('.success-message')).toBeVisible();

  // Verify timeline view
  await page.click('[data-testid="timeline-view-btn"]');
  await expect(page.locator('.roadmap-timeline')).toBeVisible();

  // Verify database
  const roadmap = await getOptimizationRoadmap(ventureId);
  expect(roadmap.initiatives).toHaveLength(1);
  expect(roadmap.initiatives[0].name).toBe('Improve onboarding flow');
});`
    },
    testing_scenarios: [
      { scenario: 'Create optimization roadmap with initiatives', type: 'e2e', priority: 'P0' },
      { scenario: 'Validation error on missing required fields', type: 'e2e', priority: 'P1' },
      { scenario: 'View analytics-driven suggested initiatives', type: 'e2e', priority: 'P1' },
      { scenario: 'Render roadmap timeline view', type: 'e2e', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-007',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage 25 - Assumptions vs Reality Analysis',
    user_role: 'Product Owner',
    user_want: 'Automated E2E test that validates Assumptions vs Reality comparison in Stage 25',
    user_benefit: 'Ensures learning from initial assumptions compared to actual outcomes for future venture planning',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Happy path - View assumptions vs reality',
        given: 'Venture has initial assumptions documented AND actual outcomes are available',
        when: 'User navigates to Assumptions vs Reality tab in Stage 25',
        then: 'Comparison table is displayed showing assumptions, actual outcomes, variance, and lessons learned'
      },
      {
        id: 'AC-007-2',
        scenario: 'Add lessons learned',
        given: 'User is viewing assumptions vs reality comparison',
        when: 'User clicks "Add Lesson" AND enters lesson learned AND clicks "Save"',
        then: 'Lesson is saved to database AND appears in lessons learned section'
      },
      {
        id: 'AC-007-3',
        scenario: 'Variance calculation',
        given: 'Assumptions and actuals have numeric values (revenue, users)',
        when: 'Comparison is displayed',
        then: 'Variance is automatically calculated AND displayed as percentage AND color-coded (green=positive, red=negative)'
      },
      {
        id: 'AC-007-4',
        scenario: 'Export learning report',
        given: 'Assumptions vs reality data is complete',
        when: 'User clicks "Export Learning Report"',
        then: 'PDF report downloads with assumptions, actuals, variances, and lessons learned'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-007-assumptions-vs-reality.spec.ts',
      'Test covers happy path (view comparison)',
      'Test covers adding lessons learned',
      'Test validates variance calculation',
      'Test verifies export functionality',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should verify comparison table renders, lessons can be added, variance calculations are correct, and export works. Edge cases: No assumptions documented initially, actual values not yet available, extremely large variance (>1000%), multiple users adding lessons simultaneously.',
    implementation_approach: 'Create Playwright spec for Stage 25 assumptions vs reality feature. Test CRUD operations on lessons learned.',
    implementation_context: 'Stage 25 learning analysis - critical for organizational learning and future venture success prediction.',
    architecture_references: [
      'src/components/ventures/stages/Stage25AssumptionsVsReality.tsx',
      'src/hooks/useVentureAssumptions.ts',
      'src/lib/variance-calculator.ts',
      'Database: venture_assumptions, venture_actuals, lessons_learned tables'
    ],
    example_code_patterns: {
      test_structure: `test('US-007: View and add to Assumptions vs Reality', async ({ page }) => {
  await navigateToStage25(page, ventureId);
  await page.click('[data-testid="assumptions-vs-reality-tab"]');

  // Verify comparison table
  await expect(page.locator('.assumptions-comparison-table')).toBeVisible();

  // Verify variance calculation
  const variance = await page.locator('[data-testid="variance-user-count"]').textContent();
  expect(variance).toMatch(/-?\\d+%/);

  // Add lesson learned
  await page.click('[data-testid="add-lesson-btn"]');
  await page.fill('[name="lesson_text"]', 'User acquisition was 30% faster than expected');
  await page.selectOption('[name="category"]', 'marketing');
  await page.click('[data-testid="save-lesson"]');

  await expect(page.locator('.lesson-success-message')).toBeVisible();
});`
    },
    testing_scenarios: [
      { scenario: 'View assumptions vs reality comparison', type: 'e2e', priority: 'P0' },
      { scenario: 'Add lesson learned', type: 'e2e', priority: 'P1' },
      { scenario: 'Verify variance calculations', type: 'e2e', priority: 'P1' },
      { scenario: 'Export learning report as PDF', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-QA-STAGES-21-25-001:US-008',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Test: Stage Navigation - Linear Progression (21-25)',
    user_role: 'Venture Manager',
    user_want: 'Automated E2E test that validates stage navigation and progression logic for Stages 21-25',
    user_benefit: 'Ensures users can only progress through stages in correct order and that stage completion is properly tracked',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-008-1',
        scenario: 'Happy path - Linear progression',
        given: 'User completes Stage 21',
        when: 'User navigates to stage selector',
        then: 'Stage 22 is unlocked and clickable AND Stages 23-25 are locked AND Stage 21 shows completion indicator'
      },
      {
        id: 'AC-008-2',
        scenario: 'Error path - Skip stages',
        given: 'User is on Stage 21 (incomplete)',
        when: 'User attempts to navigate directly to Stage 24',
        then: 'Navigation blocked with message "Complete previous stages first" AND user remains on Stage 21'
      },
      {
        id: 'AC-008-3',
        scenario: 'Stage completion indicators',
        given: 'User has completed Stages 21 and 22',
        when: 'User views stage timeline',
        then: 'Stages 21-22 show green checkmarks AND Stage 23 shows "In Progress" AND Stages 24-25 show locked icon'
      },
      {
        id: 'AC-008-4',
        scenario: 'Back navigation allowed',
        given: 'User is on Stage 24',
        when: 'User navigates back to Stage 22',
        then: 'Navigation succeeds AND Stage 22 data is displayed in read-only mode AND user can view but not edit completed stages'
      },
      {
        id: 'AC-008-5',
        scenario: 'Stage progress persistence',
        given: 'User completes Stage 21 and logs out',
        when: 'User logs back in and navigates to venture',
        then: 'Stage 21 still shows as completed AND Stage 22 is unlocked AND progress is preserved'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/stages-21-25/US-008-stage-navigation.spec.ts',
      'Test covers linear progression enforcement',
      'Test covers skip stage prevention',
      'Test validates stage completion indicators',
      'Test verifies back navigation',
      'Test validates progress persistence across sessions',
      'Test passes in CI pipeline'
    ],
    technical_notes: 'Test should verify stage progression logic, navigation guards, completion tracking, and persistence. Critical for data integrity. Edge cases: Concurrent stage completion by multiple users, stage completion rollback (undo), direct URL navigation attempts to locked stages, browser refresh during stage transition, network interruption during stage completion.',
    implementation_approach: 'Create comprehensive Playwright spec testing stage progression rules. Use database helpers to verify stage states.',
    implementation_context: 'Cross-cutting concern - tests navigation logic across all stages 21-25. Foundation for stage flow integrity.',
    architecture_references: [
      'src/hooks/useVentureStages.ts - stage progression logic',
      'src/components/ventures/StageNavigator.tsx',
      'src/lib/stage-validation.ts',
      'Database: venture_stages, stage_transitions tables'
    ],
    example_code_patterns: {
      test_structure: `test('US-008: Stage navigation enforces linear progression', async ({ page }) => {
  // Start at Stage 21
  await navigateToStage21(page, ventureId);

  // Complete Stage 21
  await completeStage21Tasks(page);
  await page.click('[data-testid="complete-stage-21"]');

  // Verify Stage 22 unlocked
  await expect(page.locator('[data-testid="stage-22-link"]')).toBeEnabled();

  // Verify Stage 23 still locked
  await expect(page.locator('[data-testid="stage-23-link"]')).toBeDisabled();

  // Attempt to skip to Stage 24 directly (should fail)
  await page.goto(\`/ventures/\${ventureId}/stages/24\`);
  await expect(page.locator('.error-message')).toContainText('Complete previous stages');

  // Verify user redirected back
  await expect(page).toHaveURL(\`/ventures/\${ventureId}/stages/22\`);
});`,
      persistence_test: `test('US-008: Stage progress persists across sessions', async ({ page, context }) => {
  // Complete Stage 21
  await navigateToStage21(page, ventureId);
  await completeStage21Tasks(page);

  // Logout
  await page.click('[data-testid="logout-btn"]');

  // Clear cookies (simulate fresh session)
  await context.clearCookies();

  // Login again
  await loginUser(page);
  await page.goto(\`/ventures/\${ventureId}\`);

  // Verify Stage 21 still completed
  await expect(page.locator('[data-testid="stage-21-status"]')).toHaveClass(/completed/);
  await expect(page.locator('[data-testid="stage-22-link"]')).toBeEnabled();
});`
    },
    testing_scenarios: [
      { scenario: 'Linear progression from Stage 21 to 25', type: 'e2e', priority: 'P0' },
      { scenario: 'Prevent skipping stages', type: 'e2e', priority: 'P0' },
      { scenario: 'Stage completion indicators update correctly', type: 'e2e', priority: 'P1' },
      { scenario: 'Back navigation to completed stages', type: 'e2e', priority: 'P1' },
      { scenario: 'Progress persists across logout/login', type: 'e2e', priority: 'P0' }
    ],
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log('📋 Creating user stories for SD-QA-STAGES-21-25-001...\n');

  // Check if stories already exist
  const { data: existing, error: checkError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (checkError) {
    console.error('❌ Error checking existing stories:', checkError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log('⚠️  User stories already exist for this SD:');
    existing.forEach(s => console.log('   -', s.story_key));
    console.log('\n💡 To recreate, first delete existing stories:');
    console.log(`   DELETE FROM user_stories WHERE sd_id = '${SD_ID}';`);
    process.exit(0);
  }

  // Insert stories
  const { data: inserted, error: insertError } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select();

  if (insertError) {
    console.error('❌ Error inserting user stories:', insertError.message);
    console.error('   Details:', insertError);
    process.exit(1);
  }

  console.log('✅ Successfully created', inserted.length, 'user stories:\n');

  let totalPoints = 0;
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  inserted.forEach(story => {
    console.log(`   ${story.story_key}: ${story.title}`);
    console.log(`     Priority: ${story.priority} | Points: ${story.story_points}`);
    console.log(`     AC Count: ${story.acceptance_criteria?.length || 0}`);
    console.log('');
    totalPoints += story.story_points || 0;
    priorityCounts[story.priority] = (priorityCounts[story.priority] || 0) + 1;
  });

  console.log('--- Summary ---');
  console.log(`Total Stories: ${inserted.length}`);
  console.log(`Total Story Points: ${totalPoints}`);
  console.log(`SD: ${SD_ID}`);
  console.log(`PRD: ${PRD_ID}`);

  console.log('\n--- Priority Breakdown ---');
  console.log(`  Critical: ${priorityCounts.critical} stories`);
  console.log(`  High: ${priorityCounts.high} stories`);
  console.log(`  Medium: ${priorityCounts.medium} stories`);
  console.log(`  Low: ${priorityCounts.low} stories`);

  console.log('\n--- Test Coverage Mapping ---');
  console.log('  TS-1 (Create Test Plan) → US-001');
  console.log('  TS-2 (Generate UAT Report) → US-002');
  console.log('  TS-3 (Build Deployment Runbook) → US-003');
  console.log('  TS-4 (Complete Launch Checklist) → US-004');
  console.log('  TS-5 (View Analytics Dashboard) → US-005');
  console.log('  TS-6 (Create Optimization Roadmap) → US-006');
  console.log('  TS-7 (Assumptions vs Reality) → US-007');
  console.log('  TS-8 (Stage Navigation) → US-008');

  console.log('\n--- Implementation Order ---');
  console.log('  1. US-001 (Stage 21 - Test Plan) - Foundation');
  console.log('  2. US-002 (Stage 21 - UAT Report) - Depends on US-001');
  console.log('  3. US-003 (Stage 22 - Deployment Runbook)');
  console.log('  4. US-004 (Stage 23 - Launch Checklist)');
  console.log('  5. US-005 (Stage 24 - Analytics Dashboard)');
  console.log('  6. US-006 (Stage 25 - Optimization Roadmap)');
  console.log('  7. US-007 (Stage 25 - Assumptions vs Reality)');
  console.log('  8. US-008 (Stage Navigation) - Integration test (implement last)');

  console.log('\n--- Next Steps ---');
  console.log('1. Review stories in LEO Dashboard or Supabase');
  console.log('2. Run PLAN-TO-EXEC handoff when ready');
  console.log('3. Create E2E test files in tests/e2e/stages-21-25/');
  console.log('4. Implement tests in recommended order');
  console.log('5. Verify 100% coverage of TS-1 through TS-8');
}

addUserStories().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
