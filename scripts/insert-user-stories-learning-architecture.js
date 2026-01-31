import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// IMPORTANT: sd_id in user_stories references strategic_directives_v2.id (the primary key)
// NOT sd_key or uuid_id!
const sdId = 'b6d39011-f80d-407f-aded-d8299f94e987';  // From strategic_directives_v2.id
const sdKey = 'SD-LEO-FIX-LEO-PROTOCOL-LEARNING-001';

const userStories = [
  {
    sd_id: sdId,
    story_key: `${sdKey}:US-001`,
    title: 'Automatic Feedback Clustering by Error Hash',
    user_role: 'system',
    user_want: 'to automatically cluster feedback items by error_hash',
    user_benefit: 'so that recurring issues can be identified and tracked without manual analysis',
    acceptance_criteria: [
      'Given feedback items exist in the database, When error_hash is populated, Then items with same error_hash are identified as a cluster',
      'Given a cluster is formed, When analyzing, Then count total items in cluster',
      'Given a cluster is analyzed, When checking timespan, Then calculate days between first and last occurrence',
      'Given cluster metrics are calculated, When storing results, Then update feedback.cluster_id to link related items',
      'Given clustering runs, When complete, Then all feedback items with error_hash have cluster_id assigned'
    ],
    priority: 'critical',
    story_points: 3,
    implementation_context: {
      core_module: 'lib/learning/feedback-clusterer.js',
      key_functions: ['findPromotableClusters()', 'evaluateForPromotion()', 'markProcessed()'],
      clustering_logic: 'Group by error_hash, count occurrences, calculate timespan',
      database_fields: ['feedback.error_hash', 'feedback.cluster_id', 'feedback.promoted_to_pattern_id'],
      edge_cases: [
        'Feedback items without error_hash (skip clustering)',
        'Empty feedback table',
        'All feedback items have unique error_hash (no clusters)'
      ],
      integration_points: [
        'feedback table: Read error_hash, write cluster_id',
        'Database transaction handling for consistency',
        'CLI integration for manual cluster runs'
      ]
    },
    architecture_references: {
      similar_components: ['lib/learning/issue-knowledge-base.js', 'lib/learning/pattern-library.js'],
      patterns_to_follow: ['Batch processing with database transactions', 'Error hash generation', 'Cluster identification'],
      integration_points: [
        'feedback table (source data)',
        'issue_patterns table (promotion target)',
        'scripts/auto-extract-patterns-from-retro.js (existing pattern creation)'
      ]
    },
    testing_scenarios: {
      happy_path: 'Multiple feedback items with same error_hash → Cluster identified → cluster_id assigned',
      edge_cases: ['Single feedback item (no cluster)', 'Multiple error hashes simultaneously', 'NULL error_hash values']
    }
  },
  {
    sd_id: sdId,
    story_key: `${sdKey}:US-002`,
    title: 'Automatic Pattern Promotion from Clusters',
    user_role: 'system',
    user_want: 'to automatically promote clustered feedback to draft patterns when threshold is met',
    user_benefit: 'so that recurring issues become tracked patterns without manual intervention',
    acceptance_criteria: [
      'Given a cluster exists, When evaluating, Then check if occurrence_count ≥5',
      'Given a cluster meets count threshold, When evaluating, Then check if timespan ≤14 days',
      'Given a cluster meets both thresholds, When promoting, Then create draft pattern in issue_patterns table',
      'Given draft pattern is created, When populating fields, Then extract: title (from first feedback), description (aggregate), category (infer from context), severity (from feedback priority)',
      'Given pattern is promoted, When updating feedback, Then set promoted_to_pattern_id for all items in cluster',
      'Given pattern is created, When setting status, Then set pattern_status = "draft" for human review',
      'Given pattern is promoted, When setting source tracking, Then set source_feedback_ids array with all cluster item IDs'
    ],
    priority: 'critical',
    story_points: 5,
    implementation_context: {
      core_module: 'lib/learning/feedback-clusterer.js',
      key_functions: ['evaluateForPromotion()', 'createDraftPattern()', 'markProcessed()'],
      promotion_thresholds: {
        occurrence_count: '≥5 feedback items',
        timespan: '≤14 days',
        pattern_status: 'draft (requires human review)'
      },
      pattern_fields: {
        pattern_key: 'Auto-generated PAT-XXX-NNN',
        title: 'From first feedback item title',
        description: 'Aggregated from cluster descriptions',
        category: 'Inferred from feedback context',
        severity: 'Max severity from cluster',
        source_feedback_ids: 'Array of all cluster feedback IDs'
      },
      edge_cases: [
        'Cluster already has promoted_to_pattern_id (skip)',
        'Pattern key generation collision (increment suffix)',
        'Feedback items deleted during promotion (transaction rollback)'
      ],
      integration_points: [
        'issue_patterns table: Insert draft pattern',
        'feedback table: Update promoted_to_pattern_id',
        'Pattern key generator: scripts/lib/pattern-key-generator.js',
        'Idempotency check: Skip if cluster already promoted'
      ]
    },
    architecture_references: {
      similar_components: [
        'scripts/auto-extract-patterns-from-retro.js (existing pattern creation)',
        'lib/learning/issue-knowledge-base.js (pattern management)'
      ],
      patterns_to_follow: [
        'Draft pattern creation with human review gate',
        'Source tracking for traceability',
        'Batch promotion with transaction safety'
      ],
      integration_points: [
        'feedback table (source)',
        'issue_patterns table (target)',
        'Pattern key generation (PAT-XXX-NNN)',
        'Human review workflow (draft status)'
      ]
    },
    testing_scenarios: {
      happy_path: 'Cluster with 5+ items in 14 days → Draft pattern created → Feedback items linked',
      threshold_checks: [
        'Cluster with 4 items → No promotion',
        'Cluster with 6 items over 20 days → No promotion',
        'Cluster with 5 items in 10 days → Promotion triggered'
      ],
      edge_cases: [
        'Empty cluster',
        'Cluster already promoted (idempotency)',
        'Pattern key collision (retry with new key)'
      ]
    }
  },
  {
    sd_id: sdId,
    story_key: `${sdKey}:US-003`,
    title: 'Idempotent Retrospective Pattern Extraction',
    user_role: 'system',
    user_want: 'to have retrospective pattern extraction be idempotent',
    user_benefit: 'so that patterns are not duplicated when extraction runs multiple times',
    acceptance_criteria: [
      'Given a retrospective exists, When checking extraction status, Then verify learning_extracted_at field',
      'Given learning_extracted_at is NULL, When running extraction, Then proceed with pattern extraction',
      'Given learning_extracted_at is populated, When running extraction, Then skip retrospective and log skip reason',
      'Given patterns are extracted, When complete, Then update learning_extracted_at to current timestamp',
      'Given extraction fails, When rolling back, Then do NOT update learning_extracted_at',
      'Given multiple extraction runs occur, When checking results, Then each retrospective produces patterns exactly once'
    ],
    priority: 'critical',
    story_points: 2,
    implementation_context: {
      migration_file: 'database/migrations/retrospective_idempotency.sql',
      modified_script: 'scripts/auto-extract-patterns-from-retro.js',
      idempotency_check: 'WHERE learning_extracted_at IS NULL',
      update_statement: 'UPDATE retrospectives SET learning_extracted_at = NOW() WHERE retro_id = $1',
      rollback_handling: 'Transaction ensures learning_extracted_at only updated on success',
      edge_cases: [
        'Retrospective with learning_extracted_at but no patterns (orphaned state)',
        'Concurrent extraction runs (database-level locking)',
        'Extraction script crashes mid-processing (transaction rollback)'
      ],
      integration_points: [
        'retrospectives table: Add learning_extracted_at TIMESTAMP WITH TIME ZONE',
        'scripts/auto-extract-patterns-from-retro.js: Add idempotency check',
        'Database transaction: Ensure atomic update',
        'CLI output: Show skipped vs processed counts'
      ]
    },
    architecture_references: {
      migration_location: 'database/migrations/retrospective_idempotency.sql',
      affected_files: ['scripts/auto-extract-patterns-from-retro.js'],
      patterns_to_follow: [
        'Idempotency via timestamp tracking',
        'Database transaction for consistency',
        'Skip already-processed records'
      ],
      integration_points: [
        'retrospectives table: Add learning_extracted_at column',
        'Pattern extraction script: Check before processing',
        'Transaction boundary: Update only on success'
      ]
    },
    testing_scenarios: {
      happy_path: 'New retrospective → Extraction runs → learning_extracted_at set → Second run skips',
      idempotency_verification: [
        'Run extraction twice on same retrospective → Patterns created once',
        'Run extraction on batch → Each retrospective processed once',
        'Extraction fails → learning_extracted_at remains NULL → Retry succeeds'
      ],
      edge_cases: [
        'Empty retrospectives table',
        'All retrospectives already extracted',
        'Mix of extracted and unextracted retrospectives'
      ]
    }
  },
  {
    sd_id: sdId,
    story_key: `${sdKey}:US-004`,
    title: 'CLI for Manual Feedback Clustering',
    user_role: 'developer',
    user_want: 'to run the feedback clusterer via CLI to see what patterns would be promoted',
    user_benefit: 'so that I can preview and test clustering logic before automation runs',
    acceptance_criteria: [
      'Given CLI command is run, When executing, Then show all identified clusters with metrics',
      'Given clusters are identified, When displaying, Then show: error_hash, occurrence_count, first_seen, last_seen, timespan_days',
      'Given clusters are evaluated, When displaying, Then indicate which meet promotion threshold (≥5 in 14 days)',
      'Given promotable clusters are found, When running in dry-run mode, Then show what draft patterns WOULD be created without creating them',
      'Given CLI runs in execute mode, When promoting, Then create draft patterns and update feedback items',
      'Given CLI completes, When showing summary, Then display: total clusters, promotable clusters, patterns created, feedback items updated'
    ],
    priority: 'high',
    story_points: 3,
    implementation_context: {
      cli_location: 'scripts/run-feedback-clusterer.js',
      core_module: 'lib/learning/feedback-clusterer.js',
      execution_modes: {
        'dry_run': 'Show analysis without creating patterns',
        'execute': 'Create patterns and update database'
      },
      cli_flags: ['--dry-run', '--verbose', '--threshold-count=N', '--threshold-days=N'],
      output_format: 'ASCII table showing clusters, metrics, promotion eligibility',
      edge_cases: [
        'Empty feedback table → Show "No feedback items found"',
        'No error_hash values → Show "No clusters identified"',
        'Invalid threshold values → Show validation error',
        'Database connection failure → Show error with retry instructions'
      ],
      integration_points: [
        'CLI entry point: scripts/run-feedback-clusterer.js',
        'Core logic: lib/learning/feedback-clusterer.js',
        'npm script alias: npm run feedback:cluster',
        'Help text: node scripts/run-feedback-clusterer.js --help'
      ]
    },
    architecture_references: {
      cli_patterns: ['scripts/pattern-alert.js (similar format)', 'scripts/show-issue-patterns.js (table display)'],
      similar_components: ['lib/learning/feedback-clusterer.js (core logic)', 'CLI argument parsing'],
      patterns_to_follow: [
        'Dry-run mode for safe testing',
        'Verbose mode for debugging',
        'Configurable thresholds for experimentation'
      ],
      integration_points: [
        'lib/learning/feedback-clusterer.js (orchestrator)',
        'CLI argument parsing (process.argv)',
        'Output formatting (console.table or ASCII tables)'
      ]
    },
    testing_scenarios: {
      happy_path: 'node scripts/run-feedback-clusterer.js --dry-run → Shows clusters and metrics → No database changes',
      execute_mode: 'node scripts/run-feedback-clusterer.js → Creates patterns → Shows summary',
      custom_thresholds: 'node scripts/run-feedback-clusterer.js --threshold-count=3 --threshold-days=7 → Uses custom thresholds',
      edge_cases: [
        'No clusters found',
        'All clusters below threshold',
        'All clusters already promoted'
      ]
    }
  }
];

async function insertUserStories() {
  console.log(`Inserting ${userStories.length} user stories for ${sdKey}...\n`);

  for (const story of userStories) {
    const { error } = await supabase
      .from('user_stories')
      .insert(story);

    if (error) {
      console.error(`❌ Error inserting ${story.story_key}:`, error.message);
    } else {
      console.log(`✅ ${story.story_key}: ${story.title}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   SD ID (UUID): ${sdId}`);
  console.log(`   SD Key: ${sdKey}`);
  console.log(`   User Stories: ${userStories.length}`);
  console.log('   Priority Breakdown:');
  console.log(`     - Critical: ${userStories.filter(s => s.priority === 'critical').length}`);
  console.log(`     - High: ${userStories.filter(s => s.priority === 'high').length}`);
  console.log(`   Story Points Total: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);

  console.log('\n📋 Context Engineering Summary (v2.0.0):');
  console.log('   ✓ All stories include implementation_context with edge_cases');
  console.log('   ✓ All stories include architecture_references');
  console.log('   ✓ All stories include testing_scenarios');
  console.log('   ✓ All stories include integration_points in context');
  console.log('   ✓ All acceptance criteria in Given-When-Then format');
  console.log('   ✓ Rich context engineering applied (v2.0.0 standards)');
}

insertUserStories();
