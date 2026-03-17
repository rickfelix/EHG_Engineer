/**
 * User Stories for SD-LEO-SELF-IMPROVE-002F - Phase 6: Outcome Signal & Loop Closure
 *
 * This script inserts 5 user stories following INVEST principles with:
 * - Clear Given-When-Then acceptance criteria
 * - Rich implementation context
 * - Database-specific focus
 * - Testable scenarios
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-SELF-IMPROVE-002F';
const SD_UUID = 'fc01f49d-38e1-4f5a-9e9a-45fb43e0d8c7';
const PRD_ID = 'PRD-fc01f49d-38e1-4f5a-9e9a-45fb43e0d8c7';

const userStories = [
  {
    story_key: 'SD-LEO-SELF-IMPROVE-002F:US-001',
    title: 'Add outcome_signal and loop_closed_at columns to enhancement_proposals table',
    user_role: 'EVA (Automated Evaluator)',
    user_want: 'to record whether an applied improvement succeeded, failed, or partially worked',
    user_benefit: 'the system can learn from outcomes and adjust future recommendations, enabling data-driven improvement',
    story_points: 5,
    priority: 'critical',
    acceptance_criteria: [
      'Given an enhancement_proposals record with status=\'applied\' AND applied_at non-null, When EVA sets outcome_signal to \'success\', Then outcome_signal is \'success\' AND loop_closed_at is auto-populated AND update succeeds',
      'Given an enhancement_proposals record with status=\'queued\' AND applied_at NULL, When EVA attempts to set outcome_signal, Then update fails with constraint error AND outcome_signal remains NULL',
      'Given an applied proposal with outcome_signal=\'failure\' and loop_closed_at=T1, When outcome_signal is updated to \'partial\', Then outcome_signal becomes \'partial\' AND loop_closed_at remains T1 (unchanged)'
    ],
    technical_notes: 'Database changes: Create ENUM outcome_signal_enum (\'success\',\'failure\',\'partial\'); Add nullable columns outcome_signal and loop_closed_at to enhancement_proposals; Create BEFORE UPDATE trigger to enforce outcome rules; Create BEFORE UPDATE trigger to auto-populate loop_closed_at on first outcome. Constraints: outcome_signal only non-null when status IN (\'applied\',\'completed\') AND applied_at IS NOT NULL; loop_closed_at auto-set when outcome_signal transitions from NULL to non-null; loop_closed_at is immutable after first setting.',
    implementation_context: JSON.stringify({
      database_changes: [
        'Create ENUM type outcome_signal_enum with values (\'success\', \'failure\', \'partial\')',
        'Add outcome_signal column to enhancement_proposals (nullable, type outcome_signal_enum)',
        'Add loop_closed_at column to enhancement_proposals (nullable, type timestamptz)',
        'Create BEFORE UPDATE trigger to enforce outcome recording rules',
        'Create BEFORE UPDATE trigger to auto-populate loop_closed_at on first outcome'
      ],
      constraints: [
        'outcome_signal can only be non-null when status IN (\'applied\', \'completed\')',
        'outcome_signal can only be non-null when applied_at IS NOT NULL',
        'loop_closed_at is set automatically when outcome_signal transitions from NULL to non-null',
        'loop_closed_at is immutable after first setting (except via superuser)'
      ],
      similar_patterns: [
        'database/migrations/*_add_status_tracking.sql (status transition patterns)',
        'database/schema/007_leo_protocol_schema_fixed.sql (trigger examples)'
      ],
      test_data: {
        valid_outcome: { proposal_id: 'test-001', status: 'applied', applied_at: '2026-01-28T10:00:00Z', outcome_signal: 'success' },
        blocked_outcome: { proposal_id: 'test-002', status: 'queued', applied_at: null, outcome_signal: 'failure' },
        outcome_update: { proposal_id: 'test-003', existing_outcome: 'failure', existing_closed_at: '2026-01-28T10:00:00Z', new_outcome: 'partial' }
      }
    }),
    architecture_references: ['enhancement_proposals table', 'protocol_improvement_queue table', 'SD-LEO-SELF-IMPROVE-002B (proposal/queue linkage)'],
    testing_scenarios: [
      'Valid outcome recording for applied proposal',
      'Blocked outcome recording for non-applied proposal',
      'loop_closed_at auto-population on first outcome',
      'loop_closed_at immutability on outcome updates',
      'End-to-end: create proposal → apply → record outcome',
      'Concurrent outcome updates maintain consistency'
    ],
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: 'STORIES-AGENT',
    updated_at: new Date().toISOString()
  },
  {
    story_key: 'SD-LEO-SELF-IMPROVE-002F:US-002',
    title: 'Synchronize outcome_signal and loop_closed_at between enhancement_proposals and protocol_improvement_queue',
    user_role: 'DevOps Engineer',
    user_want: 'outcome tracking to be consistent across both the proposals table (system of record) and the queue table (operational view)',
    user_benefit: 'I can query either table and get accurate outcome data without manual reconciliation or complex joins',
    story_points: 8,
    priority: 'critical',
    acceptance_criteria: [
      'Given enhancement_proposals id=\'prop-123\' with status=\'applied\' AND protocol_improvement_queue references it, When outcome_signal is set to \'success\' on proposals, Then queue.outcome_signal becomes \'success\' AND queue.loop_closed_at matches proposals.loop_closed_at in same transaction',
      'Given protocol_improvement_queue references proposal id=\'prop-789\', When outcome_signal is set to \'failure\' on queue, Then proposals.outcome_signal becomes \'failure\' AND proposals.loop_closed_at is populated in same transaction',
      'Given queue record with enhancement_proposal_id=NULL, When outcome_signal is set on queue, Then queue updates successfully AND no proposal sync attempted AND no error',
      'Given sync trigger active on both tables, When outcome_signal is updated, Then pg_trigger_depth() guard prevents infinite recursion AND only one sync occurs'
    ],
    technical_notes: 'Database changes: Add outcome_signal and loop_closed_at columns to protocol_improvement_queue (same types as proposals); Create sync_outcome_between_proposal_and_queue() PL/pgSQL function; Create AFTER UPDATE triggers on both tables; Implement recursion guard using pg_trigger_depth(). Constraints: Sync only when enhancement_proposal_id IS NOT NULL; Sync in same transaction (AFTER UPDATE); Recursion prevented by trigger depth check; Row-level locking for consistency.',
    implementation_context: JSON.stringify({
      database_changes: [
        'Add outcome_signal and loop_closed_at columns to protocol_improvement_queue',
        'Create sync_outcome_between_proposal_and_queue() PL/pgSQL function',
        'Create AFTER UPDATE trigger on enhancement_proposals',
        'Create AFTER UPDATE trigger on protocol_improvement_queue',
        'Implement recursion guard using pg_trigger_depth()'
      ],
      trigger_logic: [
        'Check pg_trigger_depth() > 1 to prevent recursion',
        'Lock both rows in consistent order to prevent deadlocks',
        'Sync only when enhancement_proposal_id IS NOT NULL',
        'Use AFTER UPDATE to ensure main update succeeds first'
      ],
      test_scenarios: {
        proposal_to_queue: { proposal_id: 'prop-123', queue_id: 'queue-456', outcome: 'success' },
        queue_to_proposal: { proposal_id: 'prop-789', queue_id: 'queue-101', outcome: 'failure' },
        no_link: { queue_id: 'queue-202', enhancement_proposal_id: null },
        recursion_test: { trigger_depth_check: true }
      }
    }),
    architecture_references: ['enhancement_proposals table', 'protocol_improvement_queue table', 'PL/pgSQL triggers', 'SD-LEO-SELF-IMPROVE-002B'],
    testing_scenarios: [
      'Proposal update syncs to queue',
      'Queue update syncs to proposal',
      'No sync when enhancement_proposal_id is null',
      'Recursion guard prevents infinite loop',
      'Concurrent updates maintain consistency',
      'Transaction rollback scenarios',
      'Deadlock prevention with row locking'
    ],
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: 'STORIES-AGENT',
    updated_at: new Date().toISOString()
  },
  {
    story_key: 'SD-LEO-SELF-IMPROVE-002F:US-003',
    title: 'Create v_improvement_lineage view for end-to-end outcome traceability',
    user_role: 'Chairman/Governance Stakeholder',
    user_want: 'to see the complete lifecycle of each improvement proposal from creation through application to outcome in a single view',
    user_benefit: 'I can audit the self-improvement system, understand which proposal types deliver value, and support governance reviews',
    story_points: 5,
    priority: 'high',
    acceptance_criteria: [
      'Given 100k+ proposals with various outcomes, When Chairman queries WHERE outcome_signal=\'success\', Then view returns all successful proposals with proposal_id, title, created_at, applied_at, outcome_signal, loop_closed_at, queue_id, queue_status AND query executes in <500ms',
      'Given lineage view with 6 months of data, When Chairman queries WHERE loop_closed_at >= NOW() - INTERVAL \'30 days\', Then view returns last 30 days AND uses index on loop_closed_at AND completes in <500ms',
      'Given proposals applied but outcome not yet recorded, When Chairman queries v_improvement_lineage, Then view includes proposals with NULL outcome_signal AND NULL loop_closed_at AND non-null applied_at',
      'Given proposals from various sources, When Chairman queries v_improvement_lineage, Then view includes source_reference column with origin context (retro_id, pattern_id) when available'
    ],
    technical_notes: 'Database changes: CREATE VIEW v_improvement_lineage with LEFT JOINs to protocol_improvement_queue; Add indexes on enhancement_proposals(applied_at, outcome_signal, loop_closed_at); Add index on protocol_improvement_queue(enhancement_proposal_id). View columns: proposal_id, proposal_title, proposal_created_at, queue_id, queue_status, applied_at, outcome_signal, loop_closed_at, source_reference (JSONB), outcome_recorded_by. Performance: Use LEFT JOIN to include proposals without queue items; Test with EXPLAIN ANALYZE on 100k+ dataset; Consider materialized view if needed.',
    implementation_context: JSON.stringify({
      view_columns: [
        'proposal_id (UUID)', 'proposal_title (TEXT)', 'proposal_created_at (TIMESTAMPTZ)',
        'queue_id (UUID, nullable)', 'queue_status (TEXT, nullable)',
        'applied_at (TIMESTAMPTZ, nullable)', 'outcome_signal (outcome_signal_enum, nullable)',
        'loop_closed_at (TIMESTAMPTZ, nullable)', 'source_reference (JSONB, nullable)',
        'outcome_recorded_by (TEXT, nullable)'
      ],
      indexes: [
        'idx_proposals_applied_at ON enhancement_proposals(applied_at)',
        'idx_proposals_outcome_signal ON enhancement_proposals(outcome_signal)',
        'idx_proposals_loop_closed_at ON enhancement_proposals(loop_closed_at)',
        'idx_queue_proposal_fk ON protocol_improvement_queue(enhancement_proposal_id)'
      ],
      performance_tests: [
        'EXPLAIN ANALYZE with outcome_signal filter (expect: index usage)',
        'Query <500ms with 100k proposals',
        'Time window filtering uses loop_closed_at index'
      ]
    }),
    architecture_references: ['v_improvement_lineage view', 'enhancement_proposals table', 'protocol_improvement_queue table', 'US-002F-001', 'US-002F-002'],
    testing_scenarios: [
      'View returns correct data for outcome filters',
      'Time window filtering uses indexes',
      'JOIN handles null enhancement_proposal_id correctly',
      'View reflects real-time updates',
      'EXPLAIN ANALYZE shows index usage',
      'Query performance <500ms with 100k rows',
      'Proposals with multiple queue items handled'
    ],
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: 'STORIES-AGENT',
    updated_at: new Date().toISOString()
  },
  {
    story_key: 'SD-LEO-SELF-IMPROVE-002F:US-004',
    title: 'Implement automatic discovery record creation for failed outcomes',
    user_role: 'EVA (Automated Evaluator)',
    user_want: 'failed improvement outcomes to automatically create discovery records for investigation',
    user_benefit: 'failures generate actionable follow-up work rather than being ignored, closing the learning loop',
    story_points: 8,
    priority: 'high',
    acceptance_criteria: [
      'Given an applied proposal with no discovery record, When outcome_signal is set to \'failure\', Then discovery_outcome_failures record is created with proposal_id, queue_id, context payload AND exactly one record exists (idempotent) AND outcome update succeeds',
      'Given a failed proposal with existing discovery record, When outcome_signal is set to \'failure\' again, Then no additional discovery record is created AND unique(proposal_id) constraint enforces idempotency',
      'Given proposal with outcome_signal=\'failure\' and discovery record, When outcome_signal changes to \'success\', Then discovery record remains AND is marked as \'superseded\' with superseded_by_outcome=\'success\' and superseded_at timestamp',
      'Given discovery table constraint will fail, When outcome_signal is set to \'failure\', Then entire transaction fails AND outcome_signal remains NULL AND loop_closed_at remains NULL (no partial commit)'
    ],
    technical_notes: 'Database changes: CREATE TABLE discovery_outcome_failures with UNIQUE(proposal_id); Required columns: proposal_id (FK), queue_id, outcome_signal, created_at, context_payload (JSONB); Optional columns: superseded_by_outcome, superseded_at; Create trigger create_discovery_on_failure AFTER UPDATE on enhancement_proposals; Create PL/pgSQL function handle_failure_to_discovery(). Trigger logic: IF NEW.outcome_signal=\'failure\' AND OLD.outcome_signal IS DISTINCT FROM \'failure\' then INSERT with ON CONFLICT DO NOTHING; IF NEW.outcome_signal!=\'failure\' AND OLD.outcome_signal=\'failure\' then UPDATE discovery with superseded info.',
    implementation_context: JSON.stringify({
      table_definition: {
        name: 'discovery_outcome_failures',
        columns: [
          'id (UUID, PK)',
          'proposal_id (UUID, FK, UNIQUE)',
          'queue_id (UUID, nullable)',
          'outcome_signal (outcome_signal_enum)',
          'created_at (TIMESTAMPTZ)',
          'context_payload (JSONB)',
          'superseded_by_outcome (outcome_signal_enum, nullable)',
          'superseded_at (TIMESTAMPTZ, nullable)'
        ],
        constraints: [
          'UNIQUE(proposal_id) for idempotency',
          'FOREIGN KEY (proposal_id) REFERENCES enhancement_proposals(id) ON DELETE CASCADE'
        ]
      },
      trigger_logic: [
        'AFTER UPDATE trigger on enhancement_proposals',
        'IF NEW.outcome_signal = \'failure\' AND OLD.outcome_signal IS DISTINCT FROM \'failure\'',
        'INSERT INTO discovery_outcome_failures ON CONFLICT (proposal_id) DO NOTHING',
        'IF NEW.outcome_signal != \'failure\' AND OLD.outcome_signal = \'failure\'',
        'UPDATE discovery_outcome_failures SET superseded_by_outcome, superseded_at'
      ],
      context_payload_fields: ['proposal_title', 'applied_at', 'outcome_recorded_at', 'failure_context']
    }),
    architecture_references: ['discovery_outcome_failures table', 'enhancement_proposals table', 'protocol_improvement_queue table', 'US-002F-001'],
    testing_scenarios: [
      'Failure creates discovery record',
      'Duplicate failure is idempotent',
      'Failure to success marks discovery as superseded',
      'Discovery insert failure rolls back outcome',
      'End-to-end: proposal → apply → failure → discovery',
      'Concurrent failure updates maintain idempotency',
      'Multiple outcome transitions: failure → success → failure'
    ],
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: 'STORIES-AGENT',
    updated_at: new Date().toISOString()
  },
  {
    story_key: 'SD-LEO-SELF-IMPROVE-002F:US-005',
    title: 'Create KPI queries for outcome capture rate and loop closure compliance',
    user_role: 'Chairman/Operations Team',
    user_want: 'stable SQL queries that show what percentage of applied improvements have recorded outcomes within 7 days',
    user_benefit: 'I can measure whether the outcome feedback loop is working as designed and identify gaps for follow-up',
    story_points: 3,
    priority: 'medium',
    acceptance_criteria: [
      'Given applied proposals with varying timelines, When Chairman runs outcome_capture_rate query, Then returns percentage with outcome_signal recorded within 7 days of applied_at AND excludes non-applied proposals AND handles NULL applied_at safely',
      'Given applied proposals with varying closure status, When Chairman runs loop_closure_rate query, Then returns percentage with loop_closed_at populated AND matches outcome_signal population (enforced by trigger)',
      'Given proposal applied 3 days ago without outcome, When Chairman runs outcome_capture_rate, Then proposal is excluded from denominator (not yet past 7-day window) OR clearly marked as "draft"',
      'Given applied proposals missing outcomes after 7+ days, When Chairman runs gap identification query, Then returns list of proposal_id, title, applied_at, days_since_applied ordered by days DESC'
    ],
    technical_notes: 'Database changes: Create SQL views v_outcome_capture_rate_kpi, v_loop_closure_rate_kpi, v_outcome_gaps. Query logic: Outcome capture rate = COUNT(outcome_signal NOT NULL AND loop_closed_at - applied_at <= 7 days) / COUNT(*) WHERE applied_at NOT NULL AND applied_at <= NOW() - 7 days; Loop closure rate = COUNT(loop_closed_at NOT NULL) / COUNT(*) WHERE applied_at NOT NULL; Outcome gaps = SELECT * WHERE applied_at NOT NULL AND applied_at <= NOW() - 7 days AND outcome_signal IS NULL. Use indexes on applied_at and loop_closed_at; Consider materialized view if dataset >1M rows.',
    implementation_context: JSON.stringify({
      views: [
        'v_outcome_capture_rate_kpi',
        'v_loop_closure_rate_kpi',
        'v_outcome_gaps'
      ],
      query_formulas: {
        outcome_capture_rate: 'COUNT(outcome_signal IS NOT NULL AND loop_closed_at - applied_at <= INTERVAL \'7 days\') / COUNT(*) WHERE applied_at IS NOT NULL AND applied_at <= NOW() - INTERVAL \'7 days\'',
        loop_closure_rate: 'COUNT(loop_closed_at IS NOT NULL) / COUNT(*) WHERE applied_at IS NOT NULL',
        outcome_gaps: 'SELECT proposal_id, title, applied_at, NOW() - applied_at AS days_since_applied WHERE applied_at IS NOT NULL AND applied_at <= NOW() - INTERVAL \'7 days\' AND outcome_signal IS NULL ORDER BY days_since_applied DESC'
      },
      indexes: ['idx_proposals_applied_at', 'idx_proposals_loop_closed_at'],
      sample_results: {
        outcome_capture_rate: { total_applied_past_7d: 100, with_outcome_within_7d: 85, percentage: 85.0 },
        loop_closure_rate: { total_applied: 100, with_loop_closed_at: 85, percentage: 85.0 },
        outcome_gaps: { sample: [{ proposal_id: 'gap-001', title: 'Test Proposal', applied_at: '2026-01-15', days_since_applied: 18 }] }
      }
    }),
    architecture_references: ['v_outcome_capture_rate_kpi', 'v_loop_closure_rate_kpi', 'v_outcome_gaps', 'enhancement_proposals table', 'US-002F-001', 'US-002F-003'],
    testing_scenarios: [
      'Outcome capture rate calculates correctly for known dataset',
      'Loop closure rate matches outcome signal population',
      'Gap query identifies proposals missing outcomes after 7 days',
      'Queries exclude non-applied proposals',
      'Queries perform acceptably on 100k+ dataset',
      'Results update in real-time as outcomes recorded',
      'Division by zero handling for zero applied proposals'
    ],
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: 'STORIES-AGENT',
    updated_at: new Date().toISOString()
  }
];

async function insertUserStories() {
  console.log('Inserting user stories for SD-LEO-SELF-IMPROVE-002F...\n');

  for (const story of userStories) {
    console.log(`Inserting ${story.story_key}: ${story.title}`);

    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select();

    if (error) {
      console.error(`❌ Error inserting ${story.story_key}:`, error.message);
      console.error('Details:', error);
    } else {
      console.log(`✅ Successfully inserted ${story.story_key}`);
    }
  }

  console.log('\n✨ User story insertion complete!');
  console.log(`Total stories: ${userStories.length}`);
  console.log(`SD Key: ${SD_KEY}`);
  console.log(`PRD ID: ${PRD_ID}`);
}

insertUserStories()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
