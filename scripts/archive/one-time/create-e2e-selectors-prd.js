#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  // Get SD uuid
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('id', 'SD-2025-1020-E2E-SELECTORS')
    .single();

  if (sdError || !sdData) {
    console.log('❌ SD not found:', sdError?.message);
    process.exit(1);
  }

  const prdData = {
    id: 'PRD-SD-2025-1020-E2E-SELECTORS',
    directive_id: 'SD-2025-1020-E2E-SELECTORS',
    sd_uuid: sdData.uuid_id,
    title: 'E2E Test Selector Alignment for Venture Creation Wizard',
    status: 'planning',
    category: 'testing',
    priority: 'high',
    executive_summary: 'Fix 12-14 failing E2E tests in tiered-ideation.spec.ts by adding 3 missing test-ids to VentureCreationPage.tsx. Zero functional changes - tests simply cannot locate DOM elements. Features work correctly.',
    business_context: 'E2E test failures block CI/CD pipeline and reduce confidence in tiered ideation feature. Tests verify critical user flows (tier selection, overrides, venture creation) but are unusable due to selector mismatches.',
    technical_context: 'VentureCreationPage.tsx refactored for wizard UI (SD-2025-1020-UDI) but test-ids were not updated. Tests use getByTestId() selectors that no longer exist in DOM.',
    functional_requirements: [
      { id: 'FR-001', requirement: 'Add venture-description-input test-id to description textarea', priority: 'high', acceptance_criteria: 'Tests on lines 89-94 can locate description field' },
      { id: 'FR-002', requirement: 'Add override-warning test-id to tier override alert', priority: 'high', acceptance_criteria: 'Tests on lines 210, 226, 617 can locate override warning' },
      { id: 'FR-003', requirement: 'Add create-venture-button test-id to submit button', priority: 'high', acceptance_criteria: 'Tests on lines 263, 287, 319, 345+ can locate submit button' }
    ],
    non_functional_requirements: [
      { type: 'maintainability', requirement: 'Test-ids follow naming convention (kebab-case, descriptive)', target_metric: '100% compliance' },
      { type: 'regression', requirement: 'Zero functional changes to component logic', target_metric: 'Only data-testid attributes added' }
    ],
    technical_requirements: [
      'data-testid attributes added to JSX elements only',
      'No changes to component state, props, or business logic',
      'Follow existing test-id naming patterns in codebase'
    ],
    ui_ux_requirements: [
      { id: 'UI-001', requirement: 'Add data-testid="venture-description-input" to description textarea', rationale: 'Test line 89 uses getByTestId("venture-description-input")' },
      { id: 'UI-002', requirement: 'Add data-testid="override-warning" to tier override alert', rationale: 'Tests lines 210, 226, 617 use getByTestId("override-warning")' },
      { id: 'UI-003', requirement: 'Add data-testid="create-venture-button" to submit button', rationale: 'Tests lines 263, 287, 319+ use getByTestId("create-venture-button")' }
    ],
    acceptance_criteria: [
      'All 12-14 tests in tiered-ideation.spec.ts pass (100% success rate)',
      'venture-description-input test-id added to description textarea (line ~489)',
      'override-warning test-id added to tier override alert (new element if needed)',
      'create-venture-button test-id added to submit button (line ~685)',
      'Zero functional changes verified (git diff shows only data-testid additions)',
      'No regressions in other E2E test files (full test suite passes)',
      'Git commit follows conventional commits format with SD-ID scope'
    ],
    test_scenarios: [
      { id: 'TS-001', scenario: 'Run tiered-ideation.spec.ts before changes', expected_result: '12-14 failures due to missing selectors', test_type: 'e2e' },
      { id: 'TS-002', scenario: 'Run tiered-ideation.spec.ts after adding test-ids', expected_result: '0 failures, 100% pass rate', test_type: 'e2e' },
      { id: 'TS-003', scenario: 'Manual UI verification of venture creation flow', expected_result: 'No visual or functional changes observed', test_type: 'manual' }
    ],
    plan_checklist: [
      { text: 'PRD created with 3 user stories', checked: true },
      { text: 'Baseline test run documented (capture failures)', checked: false },
      { text: 'PLAN→EXEC handoff created', checked: false }
    ],
    exec_checklist: [
      { text: 'Navigate to ../ehg and verify git remote', checked: false },
      { text: 'Add venture-description-input test-id', checked: false },
      { text: 'Add override-warning test-id (create alert if needed)', checked: false },
      { text: 'Add create-venture-button test-id', checked: false },
      { text: 'Run E2E tests and verify all pass', checked: false },
      { text: 'Create git commit with proper format', checked: false }
    ],
    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'E2E test results documented (screenshot)', checked: false },
      { text: 'EXEC→PLAN handoff created with evidence', checked: false }
    ],
    progress: 10,
    phase: 'planning',
    created_by: 'PLAN'
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (error) {
    console.log('❌ Error:', error.message);
    console.log('Details:', JSON.stringify(error, null, 2));
    process.exit(1);
  } else {
    console.log('✅ PRD created successfully');
    console.log('   ID:', data.id);
    console.log('   Title:', data.title);
    console.log('   UI/UX Requirements:', data.ui_ux_requirements?.length || 0);
    console.log('   Acceptance Criteria:', data.acceptance_criteria?.length || 0);
  }
}

createPRD();
