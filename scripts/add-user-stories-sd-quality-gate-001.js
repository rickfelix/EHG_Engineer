#!/usr/bin/env node
/**
 * Add User Stories for SD-QUALITY-GATE-001
 * Quality Gate Reweighting (35/25/20/20)
 *
 * Creates user stories based on functional requirements:
 * - FR-1: Create Gate Q validation rules in database
 * - FR-2: Implement hasTestEvidence check
 * - FR-3: Implement hasDiffMinimality check
 * - FR-4: Implement hasRollbackSafety check
 * - FR-5: Implement hasMigrationCorrectness check
 * - FR-6: Create Gate Q runner (gateQ.ts)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-QUALITY-GATE-001';
const PRD_ID = 'PRD-SD-QUALITY-GATE-001';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
// story_key format: {SD-ID}:US-XXX (required by valid_story_key constraint)
const userStories = [
  {
    story_key: 'SD-QUALITY-GATE-001:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Gate Q validation rules in database',
    user_role: 'LEO Protocol Administrator',
    user_want: 'Gate Q validation rules stored in the leo_validation_rules table with proper weights (35/25/20/20)',
    user_benefit: 'The validation ladder can query and execute Gate Q rules consistently across all SD handoffs',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Gate Q rules exist in database',
        given: 'The leo_validation_rules table exists',
        when: 'Administrator queries for Gate Q validation rules',
        then: 'Four rules are returned: hasTestEvidence (35%), hasDiffMinimality (25%), hasRollbackSafety (20%), hasMigrationCorrectness (20%)'
      },
      {
        id: 'AC-001-2',
        scenario: 'Validation - Weights sum to 100',
        given: 'Gate Q rules are inserted into the database',
        when: 'Weights are summed for all Gate Q rules',
        then: 'Total weight equals 100 (35 + 25 + 20 + 20)'
      },
      {
        id: 'AC-001-3',
        scenario: 'Metadata completeness',
        given: 'Gate Q rules exist in database',
        when: 'Each rule is inspected',
        then: 'Each rule has gate_id = "Q", name, weight, description, and severity fields populated'
      }
    ],
    definition_of_done: [
      'SQL migration file created for Gate Q rules',
      'Migration applied to database successfully',
      'Rules queryable via leo_validation_rules table',
      'Unit test verifies rules exist with correct weights'
    ],
    technical_notes: 'Insert into leo_validation_rules table with gate_id = "Q". Use severity "error" for all rules since they block handoff. Dependency: None (foundational story)',
    implementation_approach: 'Create SQL migration file in database/migrations/, apply via Supabase CLI or direct execution',
    implementation_context: 'This is the foundational story - Gate Q rules must exist in database before other stories can implement the checks.',
    architecture_references: [
      'database/schema/007_leo_protocol_schema.sql',
      'lib/sub-agent-executor.js - references leo_validation_rules'
    ],
    testing_scenarios: [
      { scenario: 'Verify 4 rules with gate_id Q exist', type: 'database_query' },
      { scenario: 'Verify weight sum equals 100', type: 'validation' }
    ],
    created_by: 'PLAN'
  },
  {
    story_key: 'SD-QUALITY-GATE-001:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement hasTestEvidence check (35%)',
    user_role: 'EXEC Agent',
    user_want: 'Automated verification that implementation includes test evidence (test files, coverage reports, or passing CI results)',
    user_benefit: 'SD implementations are validated for quality before handoff, reducing rework cycles',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Test files exist',
        given: 'An SD has been implemented with test files in tests/ directory',
        when: 'hasTestEvidence check is executed',
        then: 'Check returns PASS with evidence paths listed'
      },
      {
        id: 'AC-002-2',
        scenario: 'Error path - No test files',
        given: 'An SD has been implemented without any test files',
        when: 'hasTestEvidence check is executed',
        then: 'Check returns FAIL with message "No test files found for SD-XXX"'
      },
      {
        id: 'AC-002-3',
        scenario: 'Coverage threshold',
        given: 'Test files exist and coverage report is available',
        when: 'hasTestEvidence check is executed',
        then: 'Check validates coverage meets minimum threshold (configurable, default 60%)'
      },
      {
        id: 'AC-002-4',
        scenario: 'CI results integration',
        given: 'GitHub Actions workflow has completed for the branch',
        when: 'hasTestEvidence check is executed',
        then: 'Check includes CI pass/fail status as evidence'
      }
    ],
    definition_of_done: [
      'hasTestEvidence function implemented in lib/validation/',
      'Function detects test files by pattern matching (*.test.ts, *.spec.ts)',
      'Function parses coverage reports if available',
      'Function queries GitHub Actions API for CI status',
      'Unit tests for all scenarios',
      'Integration test with sample SD'
    ],
    technical_notes: 'Check should scan for test files, parse vitest/jest coverage JSON, and optionally query GitHub API. Weight: 35%. Dependency: US-001 (needs rule in database)',
    implementation_approach: 'Create hasTestEvidence.ts in lib/validation/ with glob patterns for test detection and coverage parsing',
    implementation_context: 'Most heavily weighted check (35%) - test evidence is the primary quality gate for SD completion.',
    architecture_references: [
      'scripts/qa-engineering-director-enhanced.js - existing test detection logic',
      'lib/sub-agents/testing.js - test discovery patterns'
    ],
    testing_scenarios: [
      { scenario: 'Mock SD with tests - expect PASS', type: 'unit' },
      { scenario: 'Mock SD without tests - expect FAIL', type: 'unit' },
      { scenario: 'Coverage below threshold - expect FAIL', type: 'unit' }
    ],
    created_by: 'PLAN'
  },
  {
    story_key: 'SD-QUALITY-GATE-001:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement hasDiffMinimality check (25%)',
    user_role: 'EXEC Agent',
    user_want: 'Automated verification that code changes are minimal and focused on the SD scope',
    user_benefit: 'Prevents scope creep and ensures PRs remain reviewable with targeted changes',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Minimal diff',
        given: 'An SD implementation with <200 lines changed',
        when: 'hasDiffMinimality check is executed',
        then: 'Check returns PASS with line count details'
      },
      {
        id: 'AC-003-2',
        scenario: 'Warning - Medium diff',
        given: 'An SD implementation with 200-400 lines changed',
        when: 'hasDiffMinimality check is executed',
        then: 'Check returns CONDITIONAL_PASS with warning "Diff size exceeds recommended threshold"'
      },
      {
        id: 'AC-003-3',
        scenario: 'Error path - Large diff',
        given: 'An SD implementation with >400 lines changed',
        when: 'hasDiffMinimality check is executed',
        then: 'Check returns FAIL with message "Diff too large - consider splitting into multiple SDs"'
      },
      {
        id: 'AC-003-4',
        scenario: 'Files outside scope',
        given: 'An SD implementation modifies files not listed in PRD scope',
        when: 'hasDiffMinimality check is executed',
        then: 'Check includes warning listing out-of-scope file modifications'
      }
    ],
    definition_of_done: [
      'hasDiffMinimality function implemented in lib/validation/',
      'Function calculates diff size using git diff --stat',
      'Function compares modified files against PRD file_scope',
      'Configurable thresholds (default: <200 PASS, 200-400 WARN, >400 FAIL)',
      'Unit tests for all threshold scenarios'
    ],
    technical_notes: 'Use git diff main...HEAD --stat for line count. Compare modified files against PRD file_scope field. Weight: 25%. Dependency: US-001',
    implementation_approach: 'Create hasDiffMinimality.ts with git integration and PRD scope comparison',
    implementation_context: 'Second highest weight (25%) - enforces LEO Protocol PR size guidelines.',
    architecture_references: [
      'CLAUDE_CORE.md - PR Size Guidelines section',
      'docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md'
    ],
    testing_scenarios: [
      { scenario: 'Small diff <200 lines - expect PASS', type: 'unit' },
      { scenario: 'Medium diff 250 lines - expect CONDITIONAL_PASS', type: 'unit' },
      { scenario: 'Large diff 500 lines - expect FAIL', type: 'unit' }
    ],
    created_by: 'PLAN'
  },
  {
    story_key: 'SD-QUALITY-GATE-001:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement hasRollbackSafety check (20%)',
    user_role: 'EXEC Agent',
    user_want: 'Automated verification that database migrations include rollback scripts',
    user_benefit: 'Ensures production deployments can be safely reverted if issues arise',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy path - Rollback exists',
        given: 'An SD with migration file has corresponding rollback file',
        when: 'hasRollbackSafety check is executed',
        then: 'Check returns PASS with rollback file path confirmed'
      },
      {
        id: 'AC-004-2',
        scenario: 'No migrations - Skip check',
        given: 'An SD has no database migrations',
        when: 'hasRollbackSafety check is executed',
        then: 'Check returns SKIP with message "No migrations to verify"'
      },
      {
        id: 'AC-004-3',
        scenario: 'Error path - Missing rollback',
        given: 'An SD has migration file but no rollback file',
        when: 'hasRollbackSafety check is executed',
        then: 'Check returns FAIL with message "Migration X has no rollback script"'
      },
      {
        id: 'AC-004-4',
        scenario: 'Rollback syntax validation',
        given: 'Rollback file exists but contains syntax errors',
        when: 'hasRollbackSafety check is executed',
        then: 'Check returns FAIL with syntax error details'
      }
    ],
    definition_of_done: [
      'hasRollbackSafety function implemented in lib/validation/',
      'Function scans database/migrations/ for migration files',
      'Function validates matching rollback files exist',
      'Optional SQL syntax validation for rollback scripts',
      'Unit tests for all scenarios'
    ],
    technical_notes: 'Migration pattern: YYYYMMDD_name.sql, rollback pattern: YYYYMMDD_name_rollback.sql. Weight: 20%. Dependency: US-001',
    implementation_approach: 'Create hasRollbackSafety.ts with glob pattern matching for migration/rollback pairs',
    implementation_context: 'Critical for database safety - prevents unrollbackable migrations reaching production.',
    architecture_references: [
      'database/migrations/ - existing migration patterns',
      'supabase/ehg_engineer/migrations/ - Supabase migration structure'
    ],
    testing_scenarios: [
      { scenario: 'Migration with rollback - expect PASS', type: 'unit' },
      { scenario: 'Migration without rollback - expect FAIL', type: 'unit' },
      { scenario: 'No migrations in SD - expect SKIP', type: 'unit' }
    ],
    created_by: 'PLAN'
  },
  {
    story_key: 'SD-QUALITY-GATE-001:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement hasMigrationCorrectness check (20%)',
    user_role: 'EXEC Agent',
    user_want: 'Automated verification that database schema changes are syntactically correct and follow conventions',
    user_benefit: 'Catches schema errors before deployment, preventing production database issues',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - Valid migration',
        given: 'An SD with syntactically correct SQL migration',
        when: 'hasMigrationCorrectness check is executed',
        then: 'Check returns PASS with parsed schema summary'
      },
      {
        id: 'AC-005-2',
        scenario: 'Error path - SQL syntax error',
        given: 'An SD with SQL migration containing syntax errors',
        when: 'hasMigrationCorrectness check is executed',
        then: 'Check returns FAIL with syntax error location and message'
      },
      {
        id: 'AC-005-3',
        scenario: 'Convention violations',
        given: 'An SD with migration that violates naming conventions',
        when: 'hasMigrationCorrectness check is executed',
        then: 'Check returns CONDITIONAL_PASS with warnings about convention violations'
      },
      {
        id: 'AC-005-4',
        scenario: 'Destructive operations warning',
        given: 'An SD with migration containing DROP TABLE or DELETE',
        when: 'hasMigrationCorrectness check is executed',
        then: 'Check returns CONDITIONAL_PASS with prominent warning about data loss risk'
      }
    ],
    definition_of_done: [
      'hasMigrationCorrectness function implemented in lib/validation/',
      'Function parses SQL for syntax validation',
      'Function checks naming conventions (snake_case tables, timestamp prefixes)',
      'Function flags destructive operations (DROP, DELETE, TRUNCATE)',
      'Unit tests for all scenarios'
    ],
    technical_notes: 'Use sql-parser-cst or similar for SQL parsing. Check conventions: snake_case names, IF EXISTS guards, timestamp prefixes. Weight: 20%. Dependency: US-001',
    implementation_approach: 'Create hasMigrationCorrectness.ts with SQL parsing and convention checking',
    implementation_context: 'Prevents common migration mistakes - complements hasRollbackSafety check.',
    architecture_references: [
      'database/schema/ - existing schema conventions',
      'docs/reference/database-agent-patterns.md - database patterns'
    ],
    testing_scenarios: [
      { scenario: 'Valid SQL migration - expect PASS', type: 'unit' },
      { scenario: 'Invalid SQL syntax - expect FAIL', type: 'unit' },
      { scenario: 'DROP TABLE statement - expect CONDITIONAL_PASS with warning', type: 'unit' }
    ],
    created_by: 'PLAN'
  },
  {
    story_key: 'SD-QUALITY-GATE-001:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Gate Q runner (gateQ.ts)',
    user_role: 'LEO Protocol System',
    user_want: 'Orchestrator that executes all Gate Q checks and calculates weighted score',
    user_benefit: 'Single entry point for Gate Q validation during EXEC-to-PLAN handoff',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - All checks pass',
        given: 'An SD with test evidence, minimal diff, rollback safety, and correct migrations',
        when: 'Gate Q runner is executed',
        then: 'Runner returns overall PASS with score 100/100 and breakdown of all checks'
      },
      {
        id: 'AC-006-2',
        scenario: 'Partial pass - Some checks fail',
        given: 'An SD passes hasTestEvidence (35pts) and hasDiffMinimality (25pts) but fails rollback checks',
        when: 'Gate Q runner is executed',
        then: 'Runner returns FAIL with score 60/100 and detailed breakdown'
      },
      {
        id: 'AC-006-3',
        scenario: 'Threshold enforcement',
        given: 'Gate Q minimum threshold is 80%',
        when: 'SD scores 75/100',
        then: 'Runner returns FAIL with message "Score 75 below threshold 80"'
      },
      {
        id: 'AC-006-4',
        scenario: 'Result persistence',
        given: 'Gate Q runner executes',
        when: 'Execution completes',
        then: 'Results are persisted to sub_agent_execution_results table with gate_id = "Q"'
      },
      {
        id: 'AC-006-5',
        scenario: 'Skipped checks handling',
        given: 'SD has no migrations (rollback and migration checks return SKIP)',
        when: 'Gate Q runner is executed',
        then: 'Skipped checks are excluded from weight calculation (recalculate based on applicable checks only)'
      }
    ],
    definition_of_done: [
      'gateQ.ts implemented in lib/gates/',
      'Runner imports and executes all 4 validation checks',
      'Weighted score calculation with configurable threshold',
      'Results persisted to sub_agent_execution_results',
      'CLI interface: node lib/gates/gateQ.ts <SD-ID>',
      'Unit tests for scoring logic',
      'Integration test with sample SD'
    ],
    technical_notes: 'This is the orchestrator that ties together US-002 through US-005. Must handle SKIP status by recalculating weights. Dependencies: US-001 through US-005',
    implementation_approach: 'Create gateQ.ts that imports check functions, runs them, calculates weighted score, and persists results',
    implementation_context: 'Final integrating story - depends on US-001 through US-005 being complete.',
    architecture_references: [
      'lib/gates/gate0.ts - existing Gate 0 implementation',
      'lib/gates/gate1.ts - existing Gate 1 implementation',
      'scripts/modules/design-database-gates-validation.js - gate scoring patterns'
    ],
    testing_scenarios: [
      { scenario: 'All checks pass - score 100', type: 'unit' },
      { scenario: 'Some checks fail - verify weighted calculation', type: 'unit' },
      { scenario: 'Skipped checks - verify weight recalculation', type: 'unit' },
      { scenario: 'Results persisted to database', type: 'integration' }
    ],
    created_by: 'PLAN'
  }
];

async function addUserStories() {
  console.log('Creating user stories for SD-QUALITY-GATE-001...\n');

  // Check if stories already exist
  const { data: existing, error: checkError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (checkError) {
    console.error('Error checking existing stories:', checkError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log('User stories already exist for this SD:');
    existing.forEach(s => console.log('  -', s.story_key));
    console.log('\nTo recreate, first delete existing stories:');
    console.log(`DELETE FROM user_stories WHERE sd_id = '${SD_ID}';`);
    process.exit(0);
  }

  // Insert stories
  const { data: inserted, error: insertError } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select();

  if (insertError) {
    console.error('Error inserting user stories:', insertError.message);
    process.exit(1);
  }

  console.log('Successfully created', inserted.length, 'user stories:\n');

  let totalPoints = 0;
  inserted.forEach(story => {
    console.log(`  ${story.story_key}: ${story.title}`);
    console.log(`    Priority: ${story.priority} | Points: ${story.story_points}`);
    console.log(`    AC Count: ${story.acceptance_criteria?.length || 0}`);
    totalPoints += story.story_points || 0;
  });

  console.log('\n--- Summary ---');
  console.log(`Total Stories: ${inserted.length}`);
  console.log(`Total Story Points: ${totalPoints}`);
  console.log(`SD: ${SD_ID}`);
  console.log(`PRD: ${PRD_ID}`);

  console.log('\n--- Priority Breakdown ---');
  const criticalCount = inserted.filter(s => s.priority === 'critical').length;
  const highCount = inserted.filter(s => s.priority === 'high').length;
  console.log(`  Critical: ${criticalCount} stories`);
  console.log(`  High: ${highCount} stories`);

  console.log('\n--- Story Dependencies ---');
  console.log('  US-001: None (foundational)');
  console.log('  US-002: US-001');
  console.log('  US-003: US-001');
  console.log('  US-004: US-001');
  console.log('  US-005: US-001');
  console.log('  US-006: US-001 through US-005');

  console.log('\n--- Next Steps ---');
  console.log('1. Review stories in LEO Dashboard');
  console.log('2. Run PLAN-TO-EXEC handoff when ready');
  console.log('3. Implement stories in order (US-001 first, US-006 last)');
}

addUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
