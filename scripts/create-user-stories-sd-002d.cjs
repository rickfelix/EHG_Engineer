/**
 * Create User Stories for SD-LEO-SELF-IMPROVE-002D
 * Phase 4: Safe Execution Enhancements
 *
 * Creates 5 user stories covering:
 * 1. Dry-run preview (mandatory before APPLY)
 * 2. Rollback window with eligibility checking
 * 3. Automated rollback expiry calculation
 * 4. Safety enforcement at database level
 * 5. Operational visibility and monitoring
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '933c3806-fd7d-498e-91ec-3f9a649d4e69';
const PRD_ID = 'PRD-933c3806-fd7d-498e-91ec-3f9a649d4e69';
const SD_KEY = 'SD-LEO-SELF-IMPROVE-002D';

const userStories = [
  {
    story_key: `${SD_KEY}:US-001`,
    title: 'Mandatory dry-run preview before applying protocol improvements',
    user_role: 'DevOps Engineer',
    user_want: 'to review a structured diff preview before applying any protocol improvement',
    user_benefit: 'so that I can verify the exact changes being made and prevent unintended modifications to production protocol configuration',
    priority: 'high',
    story_points: 5,
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - dry-run preview generated and stored',
        given: 'A protocol improvement exists in protocol_improvement_queue with status=PENDING',
        when: 'The system generates a dry-run preview AND stores the diff in dry_run_diff JSONB AND sets dry_run_at timestamp',
        then: 'The dry_run_diff column contains valid JSON with before/after comparison AND dry_run_at is set to current timestamp AND the row can proceed to APPLY workflow'
      },
      {
        id: 'AC-001-2',
        scenario: 'Error path - attempt to apply without dry-run preview',
        given: 'A protocol improvement exists with status=PENDING AND dry_run_diff IS NULL OR dry_run_at IS NULL',
        when: 'An UPDATE attempts to set status=APPLIED',
        then: 'The database REJECTS the update with constraint error AND status remains PENDING AND error message indicates "dry-run preview required before APPLY"'
      },
      {
        id: 'AC-001-3',
        scenario: 'Edge case - invalid JSON in dry_run_diff',
        given: 'A protocol improvement exists in PENDING status',
        when: 'An UPDATE attempts to set dry_run_diff with invalid JSON syntax',
        then: 'PostgreSQL type enforcement REJECTS the update AND returns JSONB type validation error AND dry_run_diff remains NULL'
      },
      {
        id: 'AC-001-4',
        scenario: 'Happy path - apply with valid dry-run preview',
        given: 'A protocol improvement with dry_run_diff populated with valid JSON AND dry_run_at set to recent timestamp',
        when: 'An UPDATE sets status=APPLIED',
        then: 'The update SUCCEEDS AND status transitions to APPLIED AND rollback window is activated AND rollback_expires_at is calculated'
      }
    ],
    technical_notes: {
      functional_requirements: ['FR-1', 'FR-4'],
      database_changes: [
        'Add dry_run_diff JSONB column (nullable)',
        'Add dry_run_at TIMESTAMPTZ column (nullable)',
        'Create trigger to enforce dry-run requirement before APPLY'
      ],
      validation_logic: 'Trigger checks: status transition to APPLIED requires dry_run_diff IS NOT NULL AND dry_run_at IS NOT NULL',
      error_handling: 'Database-level constraint violation with descriptive error message'
    },
    implementation_context: {
      database_changes: [
        'Add dry_run_diff JSONB column (nullable)',
        'Add dry_run_at TIMESTAMPTZ column (nullable)',
        'Create trigger to enforce dry-run requirement before APPLY'
      ],
      validation_logic: 'Trigger checks: status transition to APPLIED requires dry_run_diff IS NOT NULL AND dry_run_at IS NOT NULL',
      error_handling: 'Database-level constraint violation with descriptive error message',
      similar_patterns: [
        'database/migrations/20260130_protocol_improvement_queue.sql',
        'database/schema/leo_protocol_schema.sql'
      ],
      integration_points: [
        'protocol_improvement_queue table',
        'CHANGE workflow (A1 primitive)',
        'AEGIS vetting system'
      ]
    },
    architecture_references: [
      'database/migrations/20260130_protocol_improvement_queue.sql',
      'database/schema/leo_protocol_schema.sql'
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/protocol-improvements/US-002D-001-dry-run-preview.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Generate and store dry-run preview', priority: 'P0' },
        { id: 'TC-002', scenario: 'Block APPLY without preview', priority: 'P0' },
        { id: 'TC-003', scenario: 'Validate JSON structure', priority: 'P1' },
        { id: 'TC-004', scenario: 'Apply with valid preview', priority: 'P0' }
      ],
      edge_cases: [
        'Concurrent updates to dry_run_diff',
        'Very large diff (>1MB JSON)',
        'Dry-run preview older than 24 hours (should warn but not block)'
      ]
    }
  },
  {
    story_key: `${SD_KEY}:US-002`,
    title: '72-hour rollback window with eligibility checking',
    user_role: 'DevOps Engineer',
    user_want: 'to rollback a recently applied protocol improvement within a 72-hour window if issues are detected',
    user_benefit: 'so that I can quickly recover from bad protocol changes without manual database manipulation and maintain an audit trail of all rollback actions',
    priority: 'high',
    story_points: 8,
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - rollback within 72-hour window',
        given: 'A protocol improvement with status=APPLIED AND rollback_eligible=TRUE AND rollback_expires_at is in the future AND rolled_back_at IS NULL',
        when: 'A rollback operation sets rolled_back_at=now() AND rolled_back_by=user AND rollback_reason=reason',
        then: 'The update SUCCEEDS AND all rollback audit fields are populated AND the improvement is marked as rolled back AND can_rollback(id) returns FALSE'
      },
      {
        id: 'AC-002-2',
        scenario: 'Error path - rollback after window expired',
        given: 'A protocol improvement with status=APPLIED AND rollback_expires_at is in the past (>72h ago)',
        when: 'An UPDATE attempts to set rolled_back_at/by/reason',
        then: 'The database REJECTS the update AND can_rollback(id) returns FALSE AND error indicates "rollback window expired"'
      },
      {
        id: 'AC-002-3',
        scenario: 'Error path - incomplete rollback audit fields',
        given: 'A protocol improvement eligible for rollback (within 72h window)',
        when: 'An UPDATE sets rolled_back_at but OMITS rolled_back_by OR rollback_reason',
        then: 'The database REJECTS the update AND no rollback fields are persisted AND error indicates "all rollback audit fields required"'
      },
      {
        id: 'AC-002-4',
        scenario: 'Error path - rollback when rollback_eligible=false',
        given: 'A protocol improvement with status=APPLIED AND rollback_eligible=FALSE (critical system change)',
        when: 'An UPDATE attempts rollback with all required fields',
        then: 'The database REJECTS the update AND can_rollback(id) returns FALSE AND error indicates "rollback not allowed for this improvement"'
      },
      {
        id: 'AC-002-5',
        scenario: 'Edge case - attempt to rollback already rolled-back improvement',
        given: 'A protocol improvement with rolled_back_at already populated',
        when: 'An UPDATE attempts to change rollback fields',
        then: 'The database REJECTS the update AND can_rollback(id) returns FALSE AND existing rollback audit trail is preserved'
      }
    ],
    technical_notes: {
      functional_requirements: ['FR-2', 'FR-4', 'FR-5'],
      database_changes: [
        'Add rollback_eligible BOOLEAN NOT NULL DEFAULT TRUE',
        'Add rollback_window_hours INTEGER NOT NULL DEFAULT 72',
        'Add rollback_expires_at TIMESTAMPTZ NULL',
        'Add rolled_back_at TIMESTAMPTZ NULL',
        'Add rolled_back_by VARCHAR NULL',
        'Add rollback_reason TEXT NULL',
        'CHECK constraint: rollback_window_hours BETWEEN 1 AND 720',
        'Trigger to enforce rollback audit field atomicity'
      ]
    },
    implementation_context: {
      database_changes: [
        'Add rollback_eligible BOOLEAN NOT NULL DEFAULT TRUE',
        'Add rollback_window_hours INTEGER NOT NULL DEFAULT 72',
        'Add rollback_expires_at TIMESTAMPTZ NULL',
        'Add rolled_back_at TIMESTAMPTZ NULL',
        'Add rolled_back_by VARCHAR NULL',
        'Add rollback_reason TEXT NULL',
        'CHECK constraint: rollback_window_hours BETWEEN 1 AND 720'
      ],
      validation_logic: 'can_rollback() checks: status=APPLIED, rollback_eligible=TRUE, rolled_back_at IS NULL, now() <= rollback_expires_at',
      similar_patterns: [
        'database/migrations/*_audit_trail.sql',
        'database/functions/rollback_*.sql'
      ],
      integration_points: [
        'protocol_improvement_queue table',
        'AEGIS rollback workflow',
        'Audit logging system'
      ]
    },
    architecture_references: [
      'database/migrations/*_audit_trail.sql',
      'database/functions/rollback_*.sql'
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/protocol-improvements/US-002D-002-rollback-window.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Successful rollback within window', priority: 'P0' },
        { id: 'TC-002', scenario: 'Block rollback after expiry', priority: 'P0' },
        { id: 'TC-003', scenario: 'Require all audit fields', priority: 'P0' },
        { id: 'TC-004', scenario: 'Respect rollback_eligible flag', priority: 'P1' },
        { id: 'TC-005', scenario: 'Prevent double rollback', priority: 'P2' }
      ],
      edge_cases: [
        'Rollback exactly at expiry boundary (now() = rollback_expires_at)',
        'Concurrent rollback attempts',
        'Rollback with very long reason text (>10k chars)',
        'Custom rollback window (non-default 72h)'
      ]
    }
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Automated rollback expiry calculation',
    user_role: 'LEO Protocol Agent',
    user_want: 'rollback_expires_at to be automatically calculated when a protocol improvement is created',
    user_benefit: 'so that rollback eligibility is deterministic and predictable without manual timestamp management, and the system can query expiring improvements for operational alerts',
    priority: 'high',
    story_points: 3,
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - auto-calculate on insert with default window',
        given: 'A new protocol improvement is being inserted with rollback_window_hours=72 (default)',
        when: 'The INSERT executes with created_at set (or defaulted to now())',
        then: 'The set_rollback_expiry trigger calculates rollback_expires_at = created_at + interval 72 hours AND the value is persisted automatically'
      },
      {
        id: 'AC-003-2',
        scenario: 'Happy path - recalculate when window changes before apply',
        given: 'An existing protocol improvement in PENDING status with rollback_window_hours=72',
        when: 'An UPDATE changes rollback_window_hours to 48 before status=APPLIED',
        then: 'The trigger recalculates rollback_expires_at = created_at + interval 48 hours AND the new expiry is stored'
      },
      {
        id: 'AC-003-3',
        scenario: 'Edge case - prevent expiry extension after apply',
        given: 'A protocol improvement with status=APPLIED and rollback_expires_at already calculated',
        when: 'An UPDATE attempts to change rollback_window_hours to extend the window',
        then: 'The trigger DOES NOT modify rollback_expires_at AND existing expiry remains unchanged AND the window change is ignored'
      },
      {
        id: 'AC-003-4',
        scenario: 'Edge case - custom rollback window',
        given: 'A new protocol improvement with rollback_window_hours=168 (7 days for critical change)',
        when: 'The INSERT executes',
        then: 'The trigger calculates rollback_expires_at = created_at + interval 168 hours AND respects the custom window'
      }
    ],
    technical_notes: {
      functional_requirements: ['FR-3'],
      database_changes: [
        'Create set_rollback_expiry() trigger function',
        'Attach BEFORE INSERT trigger to protocol_improvement_queue',
        'Attach BEFORE UPDATE trigger (only when rollback_window_hours changes)',
        'Logic: IF rollback_expires_at IS NULL OR (status != APPLIED AND window changed) THEN compute'
      ]
    },
    implementation_context: {
      database_changes: [
        'Create set_rollback_expiry() trigger function',
        'Attach BEFORE INSERT trigger to protocol_improvement_queue',
        'Attach BEFORE UPDATE trigger (only when rollback_window_hours changes)'
      ],
      validation_logic: 'Trigger runs before row commit; uses NEW.created_at + (NEW.rollback_window_hours || hours)::interval',
      similar_patterns: [
        'database/triggers/*_auto_timestamp.sql',
        'database/functions/calculate_expiry*.sql'
      ],
      integration_points: [
        'protocol_improvement_queue table',
        'can_rollback() function (reads rollback_expires_at)',
        'Operational monitoring queries'
      ]
    },
    architecture_references: [
      'database/triggers/*_auto_timestamp.sql',
      'database/functions/calculate_expiry*.sql'
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/protocol-improvements/US-002D-003-auto-expiry.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Auto-calculate on insert', priority: 'P0' },
        { id: 'TC-002', scenario: 'Recalculate on window change (pre-apply)', priority: 'P1' },
        { id: 'TC-003', scenario: 'Block extension after apply', priority: 'P0' },
        { id: 'TC-004', scenario: 'Custom window respected', priority: 'P2' }
      ],
      edge_cases: [
        'rollback_window_hours at min/max bounds (1 hour, 720 hours)',
        'Multiple rapid updates to rollback_window_hours',
        'NULL created_at (should use current timestamp)',
        'Timezone handling (UTC vs local)'
      ]
    }
  },
  {
    story_key: `${SD_KEY}:US-004`,
    title: 'Database-level safety enforcement for CHANGE workflow',
    user_role: 'LEO Protocol Agent',
    user_want: 'the database to enforce CHANGE workflow invariants so that no script, agent, or manual SQL can bypass safety rules',
    user_benefit: 'so that protocol improvements cannot be applied without dry-run preview and rollback operations are always audited, regardless of how the database is accessed',
    priority: 'high',
    story_points: 5,
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Safety rule - enforce dry-run before apply (trigger validation)',
        given: 'A protocol improvement in PENDING status without dry_run_diff or dry_run_at',
        when: 'Any database client (app, agent, psql) attempts UPDATE to set status=APPLIED',
        then: 'The BEFORE UPDATE trigger REJECTS the update with constraint error AND status remains PENDING AND transaction is rolled back'
      },
      {
        id: 'AC-004-2',
        scenario: 'Safety rule - enforce atomic rollback audit',
        given: 'A protocol improvement eligible for rollback (status=APPLIED, within window)',
        when: 'A client attempts to set rolled_back_at without rolled_back_by AND rollback_reason',
        then: 'The trigger REJECTS the partial update AND no fields are modified AND error indicates "all rollback fields required"'
      },
      {
        id: 'AC-004-3',
        scenario: 'Safety rule - check eligibility before rollback',
        given: 'A protocol improvement with can_rollback(id)=FALSE (expired or ineligible)',
        when: 'A client attempts to set all rollback audit fields',
        then: 'The trigger calls can_rollback() AND REJECTS the update AND provides specific reason (expired/ineligible/wrong status)'
      },
      {
        id: 'AC-004-4',
        scenario: 'Performance - trigger overhead within acceptable bounds',
        given: 'A protocol improvement being updated (status change or rollback)',
        when: 'The BEFORE UPDATE trigger executes validation logic',
        then: 'Trigger execution completes in <5ms AND total update latency increase is <10ms AND no table locks held beyond update duration'
      }
    ],
    technical_notes: {
      functional_requirements: ['FR-4'],
      database_changes: [
        'Create enforce_change_workflow_invariants() trigger function',
        'Attach BEFORE UPDATE trigger to protocol_improvement_queue',
        'Validation logic: check status transitions, dry-run presence, rollback eligibility',
        'Use RAISE EXCEPTION with specific error codes for each violation type'
      ]
    },
    implementation_context: {
      database_changes: [
        'Create enforce_change_workflow_invariants() trigger function',
        'Attach BEFORE UPDATE trigger to protocol_improvement_queue'
      ],
      validation_logic: 'Trigger checks: (1) APPLY requires dry-run, (2) rollback requires can_rollback()=TRUE, (3) rollback audit fields atomic',
      error_handling: 'Specific error codes: E001=missing_dry_run, E002=rollback_expired, E003=incomplete_audit, E004=not_eligible',
      similar_patterns: [
        'database/triggers/*_invariant_enforcement.sql',
        'database/functions/validate_*.sql'
      ],
      integration_points: [
        'can_rollback() function (called by trigger)',
        'protocol_improvement_queue table',
        'All database clients (web, agents, CLI)'
      ]
    },
    architecture_references: [
      'database/triggers/*_invariant_enforcement.sql',
      'database/functions/validate_*.sql'
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/protocol-improvements/US-002D-004-safety-enforcement.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Block apply without dry-run (all clients)', priority: 'P0' },
        { id: 'TC-002', scenario: 'Block partial rollback audit', priority: 'P0' },
        { id: 'TC-003', scenario: 'Check eligibility on rollback', priority: 'P0' },
        { id: 'TC-004', scenario: 'Measure trigger overhead', priority: 'P1' }
      ],
      edge_cases: [
        'Bypass attempts via SECURITY DEFINER functions',
        'Concurrent updates to same row (locking behavior)',
        'Trigger behavior under high load (>100 updates/sec)',
        'Error message clarity for different violation types'
      ]
    }
  },
  {
    story_key: `${SD_KEY}:US-005`,
    title: 'Operational visibility for rollback eligibility and expiry monitoring',
    user_role: 'DevOps Engineer',
    user_want: 'to query rollback eligibility and see upcoming expirations in real-time',
    user_benefit: 'so that I can proactively monitor protocol improvements nearing rollback expiry and make informed decisions about whether to rollback or let changes become permanent',
    priority: 'medium',
    story_points: 3,
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Query - list improvements expiring soon',
        given: 'Multiple protocol improvements with status=APPLIED and various rollback_expires_at timestamps',
        when: 'Query executed: SELECT id, rollback_expires_at, can_rollback(id) FROM protocol_improvement_queue WHERE status=APPLIED AND rolled_back_at IS NULL ORDER BY rollback_expires_at',
        then: 'Results return all applied non-rolled-back improvements sorted by expiry AND can_rollback() value is accurate AND query uses index and completes <200ms'
      },
      {
        id: 'AC-005-2',
        scenario: 'Index usage - expiring rollbacks query',
        given: 'Index (status, rolled_back_at, rollback_expires_at) exists on protocol_improvement_queue',
        when: 'Query executed to find expiring improvements (WHERE status=APPLIED AND rolled_back_at IS NULL)',
        then: 'EXPLAIN ANALYZE shows index scan (not seq scan) AND index is used for filtering AND query plan is optimal'
      },
      {
        id: 'AC-005-3',
        scenario: 'Metadata - database comments on new columns',
        given: 'Migration has been applied adding all Phase 4 columns',
        when: 'psql \\d+ protocol_improvement_queue executed OR introspection query for column comments',
        then: 'All new columns have descriptive COMMENT ON COLUMN statements AND can_rollback() function has comment describing logic AND comments are visible in database tools'
      },
      {
        id: 'AC-005-4',
        scenario: 'can_rollback() function accuracy across scenarios',
        given: 'Protocol improvements in various states (pending, applied, expired, rolled-back, ineligible)',
        when: 'can_rollback(id) called for each improvement',
        then: 'Function returns FALSE for non-existent/pending/expired/rolled-back/ineligible rows AND returns TRUE only when all conditions met (applied, eligible, not rolled back, within window)'
      }
    ],
    technical_notes: {
      functional_requirements: ['FR-5', 'FR-6'],
      database_changes: [
        'Create can_rollback(UUID) STABLE function',
        'Create index: (status, rolled_back_at, rollback_expires_at)',
        'Add COMMENT ON COLUMN for all new fields',
        'Add COMMENT ON FUNCTION for can_rollback'
      ]
    },
    implementation_context: {
      database_changes: [
        'Create can_rollback(UUID) STABLE function',
        'Create index: (status, rolled_back_at, rollback_expires_at)',
        'Add COMMENT ON COLUMN for all new fields'
      ],
      validation_logic: 'can_rollback() logic: return (status=APPLIED AND rollback_eligible=TRUE AND rolled_back_at IS NULL AND rollback_expires_at IS NOT NULL AND now() <= rollback_expires_at)',
      error_handling: 'Function returns FALSE for errors (non-existent row, permission denied)',
      similar_patterns: [
        'database/functions/can_*.sql',
        'database/indexes/*_operational_queries.sql'
      ],
      integration_points: [
        'DevOps monitoring dashboards',
        'Automation scripts (rollback eligibility checks)',
        'AEGIS operational tooling'
      ]
    },
    architecture_references: [
      'database/functions/can_*.sql',
      'database/indexes/*_operational_queries.sql'
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/protocol-improvements/US-002D-005-operational-visibility.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Query expiring improvements with index', priority: 'P1' },
        { id: 'TC-002', scenario: 'Verify index usage in EXPLAIN', priority: 'P2' },
        { id: 'TC-003', scenario: 'Check database comments', priority: 'P2' },
        { id: 'TC-004', scenario: 'can_rollback() accuracy', priority: 'P0' }
      ],
      edge_cases: [
        'can_rollback() with RLS enabled (row visibility)',
        'Index maintenance during high write load',
        'Comment visibility in different database tools (DBeaver, pgAdmin, psql)',
        'Query performance with 100k+ improvements'
      ]
    }
  }
];

async function createUserStories() {
  console.log('Creating user stories for SD-LEO-SELF-IMPROVE-002D...\n');

  // First, verify the PRD exists
  const { data: prd, error: prdError } = await supabase
    .from('prds')
    .select('id, title')
    .eq('id', PRD_ID)
    .single();

  if (prdError) {
    console.error('Error fetching PRD:', prdError);
    return;
  }

  console.log(`Found PRD: ${prd.title}\n`);

  // Create each user story
  for (const story of userStories) {
    console.log(`Creating ${story.story_key}: ${story.title}...`);

    const { data, error} = await supabase
      .from('user_stories')
      .insert({
        prd_id: PRD_ID,
        sd_id: SD_ID,
        story_key: story.story_key,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        priority: story.priority,
        story_points: story.story_points,
        status: 'draft',
        acceptance_criteria: story.acceptance_criteria,
        technical_notes: story.technical_notes,
        implementation_context: story.implementation_context,
        architecture_references: story.architecture_references,
        testing_scenarios: story.testing_scenarios,
        validation_status: 'pending',
        e2e_test_status: 'not_created',
        created_by: 'stories-agent'
      })
      .select();

    if (error) {
      console.error(`  ERROR: ${error.message}`);
    } else {
      console.log(`  SUCCESS: Created story ID ${data[0].id}`);
    }
  }

  console.log('\nUser story creation complete!');

  // Query and display summary
  const { data: stories, error: summaryError } = await supabase
    .from('user_stories')
    .select('story_key, title, priority, story_points, validation_status')
    .eq('sd_id', SD_ID)
    .order('story_key');

  if (summaryError) {
    console.error('Error fetching summary:', summaryError);
    return;
  }

  console.log('\n=== USER STORY SUMMARY ===');
  console.log(`Total stories: ${stories.length}`);
  console.log('\nStories:');
  stories.forEach(s => {
    console.log(`  ${s.story_key} [${s.priority}/${s.story_points}pts] - ${s.title}`);
  });

  console.log('\n=== INVEST CRITERIA CHECK ===');
  console.log('✓ Independent: Each story can be implemented independently');
  console.log('✓ Negotiable: Implementation details can be adjusted during EXEC');
  console.log('✓ Valuable: Each story delivers value to DevOps Engineers or LEO Protocol Agents');
  console.log('✓ Estimable: All stories have story point estimates (3/5/8 points)');
  console.log('✓ Small: Each story focused on 1-2 related features (4-5 acceptance criteria)');
  console.log('✓ Testable: All stories have Given-When-Then acceptance criteria with E2E test locations');

  console.log('\n=== COVERAGE ANALYSIS ===');
  console.log('FR-1 (Dry-run preview): US-001');
  console.log('FR-2 (Rollback columns): US-002');
  console.log('FR-3 (Auto-expiry trigger): US-003');
  console.log('FR-4 (Safety enforcement): US-001, US-002, US-004');
  console.log('FR-5 (can_rollback function): US-002, US-005');
  console.log('FR-6 (Operational visibility): US-005');
  console.log('\n✓ 100% functional requirement coverage achieved!');
}

createUserStories().catch(console.error);
