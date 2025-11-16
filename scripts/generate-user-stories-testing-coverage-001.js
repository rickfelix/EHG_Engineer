#!/usr/bin/env node

/**
 * Generate User Stories for SD-TESTING-COVERAGE-001
 * Converts functional requirements into user stories for QA/Testing persona
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-TESTING-COVERAGE-001';
const PRD_ID = 'PRD-SD-TESTING-COVERAGE-001';

async function generateUserStories() {
  console.log('\n📋 Generating User Stories for Testing Coverage SD');
  console.log('='.repeat(70));

  // Get SD UUID
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('id', SD_ID)
    .single();

  if (!sd) {
    console.error('❌ SD not found:', SD_ID);
    process.exit(1);
  }

  // User stories for testing-focused SD
  // Persona: QA Engineer / Testing Agent
  const userStories = [
    // FR-1: LEO Gates
    {
      sd_id: SD_ID,
      prd_id: PRD_ID,
      story_key: `${SD_ID}:US-001`,  // MUST include SD prefix
      title: 'Fix broken LEO gates to enable EXEC validation',
      user_role: 'QA Engineer',
      user_want: 'have all 5 LEO gates (2A-2D, Gate 3) execute without exit code 1',
      user_benefit: 'EXEC validation is unblocked and PRD quality can be enforced',
      acceptance_criteria: [
        'Gate 2A (Architecture Validation) executes successfully',
        'Gate 2B (Design & Database) executes successfully',
        'Gate 2C (Testing Strategy) executes successfully',
        'Gate 2D (Implementation Readiness) executes successfully',
        'Gate 3 (EXEC Verification) executes successfully',
        'All gates return exit code 0 for valid PRDs',
        'All gates have integration tests with 100% pass rate'
      ],
      priority: 'critical',
      story_points: 8,
      status: 'draft',  // Valid: draft, ready, in_progress, testing, completed, blocked
      test_scenarios: [
        {
          scenario: 'Valid PRD passes all gates',
          given: 'A PRD with complete architecture, design, database schema, testing strategy, and implementation plan',
          when: 'I run all 5 LEO gates',
          then: 'All gates execute successfully with exit code 0'
        },
        {
          scenario: 'Invalid PRD fails appropriate gates',
          given: 'A PRD missing required sections (e.g., no database schema)',
          when: 'I run all 5 LEO gates',
          then: 'Relevant gates fail with clear error messages'
        }
      ],
      implementation_context: 'Debug and fix gate2a.ts, gate2b.ts, gate2c.ts, gate2d.ts, gate3.ts in tools/gates/. Create integration tests using Jest/Vitest. Verify gates return exit code 0 for valid PRDs and proper error messages for invalid ones.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'PLAN'
    },

    // FR-2: SD CRUD E2E Tests
    {
      sd_id: SD_ID,
      prd_id: PRD_ID,
      story_key: `${SD_ID}:US-002`,
      title: 'Create comprehensive E2E tests for Strategic Directive CRUD operations',
      user_role: 'QA Engineer',
      user_want: 'have E2E test coverage for all SD lifecycle operations',
      user_benefit: 'data corruption and workflow failures are prevented through automated testing',
      acceptance_criteria: [
        'E2E test file created: tests/e2e/strategic-directives-crud.spec.ts',
        'Test: Create SD via LEAD agent workflow',
        'Test: Edit SD (title, description, status transitions)',
        'Test: Transition SD through all status states (DRAFT→ACTIVE→IN_PROGRESS→COMPLETED)',
        'Test: Delete SD (soft delete verification)',
        'Test: SD validation rules enforced (required fields, constraints)',
        'Test: Required fields enforcement prevents invalid SDs',
        'All tests pass with 100% success rate in CI/CD'
      ],
      priority: 'critical',
      story_points: 5,
      status: 'draft',
      depends_on: [],
      test_scenarios: [
        {
          scenario: 'Complete SD lifecycle',
          given: 'A new Strategic Directive needs to be created',
          when: 'I create, edit, transition, and delete the SD',
          then: 'All operations succeed and database state is correct'
        },
        {
          scenario: 'Validation enforcement',
          given: 'An invalid SD with missing required fields',
          when: 'I attempt to save the SD',
          then: 'Validation prevents the save and provides clear error messages'
        }
      ],
      implementation_context: 'Create E2E test file tests/e2e/strategic-directives-crud.spec.ts using Playwright. Test LEAD agent SD creation workflow, edit operations, status transitions (DRAFT→ACTIVE→IN_PROGRESS→COMPLETED), soft delete, and validation enforcement.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'PLAN'
    },

    // FR-3: PRD Management E2E Tests
    {
      sd_id: SD_ID,
      prd_id: PRD_ID,
      story_key: `${SD_ID}:US-003`,
      title: 'Create comprehensive E2E tests for PRD management workflows',
      user_role: 'QA Engineer',
      user_want: 'have E2E test coverage for all PRD lifecycle operations',
      user_benefit: 'PRD creation failures are prevented and EXEC work is unblocked',
      acceptance_criteria: [
        'E2E test file created: tests/e2e/prd-management.spec.ts',
        'Test: Create PRD from SD via PLAN agent workflow',
        'Test: Validate PRD schema (all required fields present)',
        'Test: Add user stories to PRD',
        'Test: Validate user stories (acceptance criteria, test scenarios)',
        'Test: Approve PRD for EXEC handoff',
        'Test: Reject PRD with feedback loop',
        'Test: PRD status transitions (DRAFT→PLANNING→APPROVED→IN_PROGRESS→COMPLETED)',
        'All tests pass with 100% success rate in CI/CD'
      ],
      priority: 'critical',
      story_points: 8,
      status: 'draft',  // Valid: draft, ready, in_progress, testing, completed, blocked
      depends_on: [],
      test_scenarios: [
        {
          scenario: 'Complete PRD lifecycle',
          given: 'An approved Strategic Directive',
          when: 'I create a PRD, add user stories, and approve it',
          then: 'PRD is ready for EXEC handoff with all validations passing'
        },
        {
          scenario: 'PRD rejection workflow',
          given: 'A PRD with incomplete requirements',
          when: 'I attempt to approve the PRD',
          then: 'Validation rejects the PRD with specific feedback on missing items'
        }
      ],
      implementation_context: 'Create E2E test file tests/e2e/prd-management.spec.ts using Playwright. Test PLAN agent PRD creation workflow, schema validation, user story addition, approval/rejection workflows, and status transitions.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'PLAN'
    },

    // FR-4: Database Validation Integration Tests
    {
      sd_id: SD_ID,
      prd_id: PRD_ID,
      story_key: `${SD_ID}:US-004`,
      title: 'Create integration tests for database validation scripts',
      user_role: 'QA Engineer',
      user_want: 'have integration tests for database validation and repair scripts',
      user_benefit: 'data integrity issues are caught early and silent corruption is prevented',
      acceptance_criteria: [
        'Integration test file created: tests/integration/database-validation.test.js',
        'Test: Validate SD schema (detect schema violations)',
        'Test: Validate PRD schema (detect missing required fields)',
        'Test: Detect orphaned PRDs (PRDs without parent SD)',
        'Test: Detect invalid status transitions',
        'Test: Detect missing required fields',
        'Test: Generate fix scripts for detected issues',
        'Test: Apply fix scripts and verify repairs',
        'All tests pass with 100% success rate in CI/CD'
      ],
      priority: 'critical',
      story_points: 5,
      status: 'draft',
      depends_on: [],
      test_scenarios: [
        {
          scenario: 'Detect and repair schema violations',
          given: 'An SD with missing required fields in the database',
          when: 'I run database validation scripts',
          then: 'Issues are detected, fix scripts generated, and repairs applied successfully'
        },
        {
          scenario: 'Orphaned PRD detection',
          given: 'A PRD whose parent SD has been deleted',
          when: 'I run orphan detection validation',
          then: 'Orphaned PRD is identified and flagged for cleanup'
        }
      ],
      implementation_context: 'Create integration test file tests/integration/database-validation.test.js using Jest. Test comprehensive-database-validation.js script for SD/PRD schema validation, orphan detection, invalid status transitions, and fix script generation/application.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'PLAN'
    },

    // FR-5: Phase Handoff E2E Tests (Week 2)
    {
      sd_id: SD_ID,
      prd_id: PRD_ID,
      story_key: `${SD_ID}:US-005`,
      title: 'Create E2E tests for phase handoff system (LEAD→PLAN→EXEC)',
      user_role: 'QA Engineer',
      user_want: 'have E2E test coverage for all phase transition handoffs',
      user_benefit: 'workflow reliability is ensured and phase transitions never fail silently',
      acceptance_criteria: [
        'E2E test file created: tests/e2e/phase-handoffs.spec.ts',
        'Test: LEAD→PLAN handoff creation and acceptance',
        'Test: PLAN→EXEC handoff with BMAD validation',
        'Test: EXEC→PLAN handoff for verification',
        'Test: PLAN→LEAD handoff for final approval',
        'Test: Handoff rejection workflow with feedback',
        'Test: Handoff data persistence in sd_phase_handoffs table',
        'Test: SD status updates after successful handoffs',
        'All tests pass with 100% success rate in CI/CD'
      ],
      priority: 'high',
      story_points: 8,
      status: 'draft',
      depends_on: [],
      test_scenarios: [
        {
          scenario: 'Complete SD workflow with all handoffs',
          given: 'A new Strategic Directive from LEAD',
          when: 'I execute all phase transitions (LEAD→PLAN→EXEC→PLAN→LEAD)',
          then: 'All handoffs succeed, database state is correct, and SD reaches COMPLETED status'
        },
        {
          scenario: 'Handoff rejection and retry',
          given: 'A PRD that fails BMAD validation',
          when: 'I attempt PLAN→EXEC handoff',
          then: 'Handoff is rejected with specific feedback, PRD can be corrected and resubmitted'
        }
      ],
      implementation_context: 'Create E2E test file tests/e2e/phase-handoffs.spec.ts using Playwright. Test unified-handoff-system.js for all phase transitions (LEAD→PLAN→EXEC→PLAN→LEAD), BMAD validation, rejection workflows, handoff persistence, and SD status updates.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'PLAN'
    }
  ];

  console.log(`\n📝 Generated ${userStories.length} user stories from functional requirements`);
  console.log('   Persona: QA Engineer');
  console.log('   Epic: Testing Coverage Investment');
  console.log('   Total Story Points:', userStories.reduce((sum, s) => sum + s.story_points, 0));

  // Insert user stories
  console.log('\n💾 Inserting user stories into database...');

  const { data, error } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select();

  if (error) {
    console.error('❌ Error inserting user stories:', error.message);
    console.error('   Code:', error.code);
    process.exit(1);
  }

  console.log(`✅ Successfully inserted ${data.length} user stories`);
  console.log('');

  // Display summary
  console.log('📊 User Stories Summary:');
  console.log('='.repeat(70));
  data.forEach(story => {
    console.log(`   ${story.story_id}: ${story.title}`);
    console.log(`      Priority: ${story.priority} | Story Points: ${story.story_points} | Status: ${story.status}`);
    console.log(`      Acceptance Criteria: ${story.acceptance_criteria.length} items`);
    console.log('');
  });

  console.log('✅ User stories ready for PLAN→EXEC handoff');
  console.log('   Next: Re-run unified-handoff-system.js');
  console.log('');
}

generateUserStories();
