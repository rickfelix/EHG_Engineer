#!/usr/bin/env node

/**
 * Create User Stories for SD-VWC-INTUITIVE-FLOW-001 Checkpoint 2
 * US-005: Adapter Unit Tests
 * US-006: Dashboard Unit Tests
 * US-007: Keyboard Navigation
 * US-008: ARIA Labels & Screen Reader Support
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function createUserStories() {
  console.log('\n📋 Creating User Stories for Checkpoint 2');
  console.log('='.repeat(60));

  let client;

  try {
    client = await createDatabaseClient('engineer', { verify: true });

    const sdId = 'SD-VWC-INTUITIVE-FLOW-001';

    const userStories = [
      {
        story_key: `${sdId}:US-005`,
        sd_id: sdId,
        title: 'Adapter Unit Tests',
        user_role: 'developer',
        user_want: 'comprehensive unit tests for opportunityToVentureAdapter',
        user_benefit: 'data transformation logic is verified and regression-protected',
        acceptance_criteria: [
          '12 tests covering all transformation scenarios',
          'Edge cases handled (null/undefined, empty arrays, malformed data)',
          'Type safety verified (TypeScript assertions)',
          'Coverage: 90%+ for adapter module',
          'Tests pass in CI/CD pipeline'
        ],
        priority: 'high',
        story_points: 5,
        depends_on: [],
        test_scenarios: [
          'Basic opportunity → venture transformation',
          'Optional fields handling (category, assumptions)',
          'Array field transformations (tags, stakeholders)',
          'Date format conversions',
          'Enum value mappings',
          'Null/undefined input handling',
          'Empty object handling',
          'Partial data scenarios',
          'Invalid data rejection',
          'Default value population',
          'Type coercion verification',
          'Integration with venture schema'
        ],
        technical_notes: 'Target component: opportunityToVentureAdapter. Test file: tests/unit/opportunityToVentureAdapter.test.ts. Coverage target: 90%+. Estimated effort: 3 hours. Checkpoint 2, FR-7.',
        implementation_context: 'Unit testing for adapter module. Framework: Vitest. Create comprehensive test suite for opportunityToVentureAdapter with 12 scenarios covering transformation logic, edge cases, and type safety. Target 90%+ code coverage.'
      },
      {
        story_key: `${sdId}:US-006`,
        sd_id: sdId,
        title: 'Dashboard Unit Tests',
        user_role: 'developer',
        user_want: 'unit tests for OpportunitySourcingDashboard component',
        user_benefit: 'UI behavior and state management are verified',
        acceptance_criteria: [
          '7 tests covering critical UI scenarios',
          'Component rendering verified',
          'User interactions tested (clicks, selections)',
          'State management validated',
          'Coverage: 80%+ for dashboard component',
          'Tests pass in CI/CD pipeline'
        ],
        priority: 'high',
        story_points: 3,
        depends_on: [],
        test_scenarios: [
          'Component renders with empty state',
          'Component renders with opportunity data',
          'Filtering functionality works correctly',
          'Sorting functionality works correctly',
          'Pagination controls function',
          'Create venture button triggers modal',
          'Error states display correctly'
        ],
        technical_notes: 'Target component: OpportunitySourcingDashboard. Test file: tests/unit/OpportunitySourcingDashboard.test.tsx. Coverage target: 80%+. Estimated effort: 2 hours. Checkpoint 2, FR-7.',
        implementation_context: 'Unit testing for dashboard component. Framework: Vitest + @testing-library/react. Create test suite for OpportunitySourcingDashboard covering rendering, user interactions, filtering, sorting, and pagination. Target 80%+ code coverage.'
      },
      {
        story_key: `${sdId}:US-007`,
        sd_id: sdId,
        title: 'Keyboard Navigation',
        user_role: 'keyboard-only user',
        user_want: 'full keyboard navigation through the venture wizard',
        user_benefit: 'I can complete venture creation without a mouse',
        acceptance_criteria: [
          'Tab order logical and complete',
          'All interactive elements keyboard-accessible',
          'Focus indicators visible and clear',
          'Skip links implemented where appropriate',
          'No keyboard traps',
          'Enter/Space activate buttons',
          'Escape closes modals/dialogs',
          'Arrow keys navigate lists/menus'
        ],
        priority: 'high',
        story_points: 5,
        depends_on: [],
        test_scenarios: [
          'VentureCreationPage: Step navigation via keyboard',
          'VentureForm: All form inputs keyboard-accessible',
          'ValidationPanel: Agent status cards keyboard-navigable',
          'PreviewSection: Review editor keyboard-accessible',
          'Tooltips: Already keyboard-accessible (Radix UI)',
          'Tier selection buttons: Tab + Enter/Space',
          'Archetype selector: Arrow key navigation',
          'Intelligence drawer: Keyboard open/close'
        ],
        technical_notes: 'WCAG 2.1 AA compliance. Features: tabIndex attributes, focus indicators, skip links, keyboard event handlers. Estimated effort: 2.5 hours. Checkpoint 2, FR-4.',
        implementation_context: 'Accessibility enhancement for venture wizard. Add full keyboard navigation support across all wizard components (VentureCreationPage, VentureForm, ValidationPanel, PreviewSection). Implement tabIndex, focus indicators, and keyboard event handlers. Ensure WCAG 2.1 AA compliance.'
      },
      {
        story_key: `${sdId}:US-008`,
        sd_id: sdId,
        title: 'ARIA Labels & Screen Reader Support',
        user_role: 'screen reader user',
        user_want: 'descriptive ARIA labels on all interactive elements',
        user_benefit: 'I understand the purpose and state of each element',
        acceptance_criteria: [
          'All buttons have descriptive aria-labels',
          'Form fields have associated labels',
          'Dynamic content changes announced',
          'Loading states have aria-live regions',
          'Modal dialogs have aria-modal and aria-labelledby',
          'Tier buttons have aria-pressed states',
          'Research status has aria-busy during execution',
          'WAVE checker: 0 critical errors'
        ],
        priority: 'high',
        story_points: 3,
        depends_on: [],
        test_scenarios: [
          'VentureCreationPage: Progress stepper aria-current, Save Draft aria-busy, Next/Back aria-disabled',
          'VentureForm: Input aria-describedby, Tier aria-pressed, Complexity aria-live, Override role=alert',
          'ValidationPanel: Agent cards aria-label, Progress bar aria-valuenow/min/max, Intelligence aria-expanded',
          'PreviewSection: Review role=region with aria-label, Confirmation role=alert'
        ],
        technical_notes: 'WCAG 2.1 AA compliance. Validation tool: WAVE checker (https://wave.webaim.org/extension/). Target: 0 critical errors. Estimated effort: 1.5 hours. Checkpoint 2, FR-4.',
        implementation_context: 'Accessibility enhancement for venture wizard. Add comprehensive ARIA labels and screen reader support across all wizard components. Implement aria-labels, aria-describedby, aria-live regions, aria-busy, aria-pressed, and role attributes. Validate with WAVE checker. Ensure WCAG 2.1 AA compliance.'
      }
    ];

    console.log('\n1️⃣  Inserting user stories...\n');

    for (const story of userStories) {
      const insertQuery = `
        INSERT INTO user_stories (
          story_key, sd_id, title, user_role, user_want, user_benefit,
          acceptance_criteria, priority, story_points, depends_on,
          test_scenarios, technical_notes, implementation_context, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft')
        ON CONFLICT (story_key) DO UPDATE
        SET title = EXCLUDED.title,
            user_role = EXCLUDED.user_role,
            user_want = EXCLUDED.user_want,
            user_benefit = EXCLUDED.user_benefit,
            acceptance_criteria = EXCLUDED.acceptance_criteria,
            priority = EXCLUDED.priority,
            story_points = EXCLUDED.story_points,
            test_scenarios = EXCLUDED.test_scenarios,
            technical_notes = EXCLUDED.technical_notes,
            implementation_context = EXCLUDED.implementation_context
        RETURNING story_key, title;
      `;

      const result = await client.query(insertQuery, [
        story.story_key,
        story.sd_id,
        story.title,
        story.user_role,
        story.user_want,
        story.user_benefit,
        JSON.stringify(story.acceptance_criteria),
        story.priority,
        story.story_points,
        story.depends_on,
        JSON.stringify(story.test_scenarios),
        story.technical_notes,
        story.implementation_context
      ]);

      console.log(`   ✅ ${result.rows[0].story_key}: ${result.rows[0].title}`);
      console.log(`      Priority: ${story.priority} | Story Points: ${story.story_points}`);
      console.log(`      Acceptance Criteria: ${story.acceptance_criteria.length} items`);
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('✅ USER STORIES CREATED');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   - US-005: Adapter Unit Tests (3h, 12 scenarios)');
    console.log('   - US-006: Dashboard Unit Tests (2h, 7 scenarios)');
    console.log('   - US-007: Keyboard Navigation (2.5h, WCAG 2.1 AA)');
    console.log('   - US-008: ARIA Labels (1.5h, WCAG 2.1 AA)');
    console.log('   - Total Estimated: 9 hours');
    console.log('   - Checkpoint: 2 of 3');
    console.log('\n📋 Next Steps:');
    console.log('1. Create PLAN→EXEC handoff');
    console.log('2. Begin implementation (EXEC phase)');
    console.log('3. Track progress via user_stories table\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createUserStories()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default createUserStories;
