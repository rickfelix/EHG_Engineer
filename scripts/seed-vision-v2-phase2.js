#!/usr/bin/env node
/**
 * Seed Vision V2 Phase 2 Strategic Directives
 *
 * Creates parent SD-VISION-V2-P2-000 and children SD-VISION-V2-009 through SD-VISION-V2-013
 * Based on 3-AI analysis synthesis (Claude, Gemini, OpenAI Codex)
 *
 * Research Reference: /home/rickf/.claude/plans/reactive-dazzling-reef.md
 *
 * Run: node scripts/seed-vision-v2-phase2.js
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { v4 as uuidv4 } from 'uuid';

const PARENT_SD_ID = uuidv4();

// Research metadata common to all SDs
const RESEARCH_METADATA = {
  research_sources: {
    claude_analysis: {
      date: '2025-12-16',
      findings: ['1241 ESLint problems', '101 TODO comments', 'Parent SD status bug']
    },
    gemini_analysis: {
      date: '2025-12-16',
      findings: ['generateProactiveInsight frontend-only', 'Safe Mode needs verification', 'Mobile responsiveness opportunity']
    },
    codex_analysis: {
      date: '2025-12-16',
      findings: ['4 competing decision tables', 'Blueprint job runner missing', 'Token ledger placeholder']
    }
  },
  investigation_results: {
    competing_models: [
      { table: 'agent_messages', used_by: 'useChairmanDashboardData.ts', status: 'ACTIVE' },
      { table: 'venture_decisions', used_by: '/api/v2/chairman/decisions.ts', status: 'ACTIVE' },
      { table: 'venture_stage_work', used_by: 'evaStateMachines.ts', status: 'ACTIVE' },
      { table: 'chairman_decisions', used_by: 'evaStateMachines.ts', status: 'POSSIBLY_MISSING' }
    ],
    critical_files: [
      'src/hooks/useChairmanDashboardData.ts',
      'src/pages/api/v2/chairman/decisions.ts',
      'src/services/evaStateMachines.ts',
      'src/pages/api/v2/chairman/briefing.ts'
    ]
  },
  phase1_completion: {
    parent_sd: 'SD-VISION-V2-000',
    children_completed: 8,
    completion_date: '2025-12-16'
  },
  plan_file: '/home/rickf/.claude/plans/reactive-dazzling-reef.md'
};

// Parent SD
const parentSD = {
  id: PARENT_SD_ID,
  sd_key: 'SD-VISION-V2-P2-000',
  title: 'Vision V2 Phase 2: Data Model Consolidation & Real Metrics',
  description: 'Phase 2 of the Chairman\'s Operating System initiative focuses on data model consolidation and replacing placeholder metrics with real values. This parent SD orchestrates critical fixes identified by three independent AI analyses (Claude, Gemini, OpenAI Codex) that all converged on the same core issues: competing decision data models, placeholder dashboard values, and EVA backend integration gaps.',
  rationale: 'Investigation revealed 4 competing tables storing decision data (agent_messages, venture_decisions, venture_stage_work, chairman_decisions) with no unified query. The Chairman OS UI queries one table while the API queries another, creating inconsistent views. Additionally, one referenced table (chairman_decisions) may not exist, risking runtime errors in EVA state machine.',
  scope: 'Database schema consolidation (bridging views, not full refactor), UI/API integration to unified data sources, Token ledger implementation (currently placeholder values), EVA backend intelligence migration (from frontend heuristics), Job runner verification and contract testing.',
  strategic_objectives: [
    'Unify all Chairman decision data into single queryable source',
    'Replace all placeholder/hardcoded metrics with real database values',
    'Move EVA insights from frontend to backend orchestration',
    'Verify deal flow pipeline actually executes',
    'Establish contract and invariant test coverage'
  ],
  success_metrics: [
    '0 competing data models for decisions (unified view)',
    '0 hardcoded values in Chairman dashboard',
    'EVA insights generated from backend, not frontend',
    '100% of blueprint jobs have worker consumption verified',
    'API contract test coverage ≥80%'
  ],
  key_principles: [
    'Bridging views first, full refactor later (non-breaking changes)',
    'Data model fixes before feature enhancements',
    'Real metrics over placeholder values',
    'Backend intelligence over frontend heuristics'
  ],
  status: 'active',
  current_phase: 'LEAD',
  category: 'infrastructure',
  priority: 'critical',
  parent_sd_id: null,
  target_application: 'EHG',
  sequence_rank: 1,
  risks: [
    { id: 'R1', description: 'chairman_decisions table may not exist - requires immediate verification', mitigation: 'Verify table existence first, create if missing' },
    { id: 'R2', description: 'Bridging views may have performance impact', mitigation: 'Monitor via EXPLAIN ANALYZE, add indexes if needed' },
    { id: 'R3', description: 'Changing data sources may break existing integrations', mitigation: 'Thorough E2E testing before rollout' }
  ],
  dependencies: [
    { sd_id: 'SD-VISION-V2-000', type: 'predecessor', description: 'Vision V2 Phase 1 completed' }
  ],
  success_criteria: [
    'Chairman dashboard shows unified pending decisions from all sources',
    'Token summary shows real aggregated values',
    'EVA generates insights from multi-agent analysis',
    'No dead code references to non-existent tables'
  ],
  implementation_guidelines: `
1. Execute child SDs in sequence (009 first, then 010-013)
2. SD-009 is foundational - must complete before others
3. SD-012 can run in parallel with SD-010/011
4. SD-013 should be last (tests depend on stable data model)
  `.trim(),
  metadata: {
    ...RESEARCH_METADATA,
    is_parent: true,
    child_count: 5,
    track: 'A',
    phase: 2
  }
};

// Child SDs
const childSDs = [
  {
    id: uuidv4(),
    sd_key: 'SD-VISION-V2-009',
    title: 'Vision V2: Decision Data Model Unification',
    description: 'Create a unified decision data model that consolidates all four competing decision sources (agent_messages, venture_decisions, venture_stage_work, chairman_decisions) into a single queryable interface. This SD implements bridging views and RPCs rather than full table refactoring to minimize disruption.',
    rationale: 'Currently the Chairman OS UI (useChairmanDashboardData.ts) queries agent_messages for escalations, while the API (/api/v2/chairman/decisions.ts) queries venture_decisions for gate decisions. This means a user could have pending items in both places with no unified view. Additionally, evaStateMachines.ts references chairman_decisions which may not exist as a table.',
    scope: 'Verify existence of all 4 decision-related tables, Create/fix chairman_decisions table if missing, Create chairman_unified_decisions bridging VIEW, Create get_pending_chairman_items() RPC function, Update UI hook to use unified source, Update API endpoint to use unified source, Add foreign key relationships where appropriate, Document decision routing logic.',
    strategic_objectives: [
      'Single source of truth for all Chairman decision items',
      'No runtime errors from missing table references',
      'Consistent decision counts between UI and API'
    ],
    success_metrics: [
      '1 unified view/RPC for all decision data (down from 4 separate queries)',
      '0 dead code references to non-existent tables',
      'UI and API show identical pending decision counts',
      'All decision types visible in Chairman dashboard'
    ],
    key_principles: [
      'Bridging views preserve existing table structures',
      'Backward compatible - existing code continues to work',
      'Performance monitored via EXPLAIN ANALYZE'
    ],
    status: 'active',
    current_phase: 'LEAD',
    category: 'database',
    priority: 'critical',
    parent_sd_id: PARENT_SD_ID,
    target_application: 'EHG',
    sequence_rank: 1,
    risks: [
      { id: 'R1', description: 'Performance impact of UNION views', mitigation: 'Proper indexing and EXPLAIN ANALYZE' },
      { id: 'R2', description: 'Schema changes may require migration', mitigation: 'Use ALTER carefully, test in staging' }
    ],
    dependencies: [],
    success_criteria: [
      'chairman_decisions table exists and is queryable',
      'chairman_unified_decisions VIEW returns all pending items',
      'UI hook updated to single data source',
      'API endpoint updated to same data source',
      'E2E test verifies unified view works'
    ],
    implementation_guidelines: `
1. VERIFY: Check if chairman_decisions table exists
   - Query: SELECT * FROM information_schema.tables WHERE table_name = 'chairman_decisions'
   - If missing: Create migration

2. CREATE VIEW: chairman_unified_decisions
   SELECT 'escalation' as decision_type, id, created_at, ... FROM agent_messages WHERE message_type='escalation'
   UNION ALL
   SELECT 'gate_decision' as decision_type, id, created_at, ... FROM venture_decisions WHERE decision IS NULL
   UNION ALL
   SELECT 'chairman_approval' as decision_type, id, created_at, ... FROM chairman_decisions WHERE status='pending'

3. UPDATE: useChairmanDashboardData.ts
   - Replace agent_messages query with unified view query
   - Maintain existing return type structure

4. UPDATE: /api/v2/chairman/decisions.ts
   - Replace venture_decisions query with unified view query
   - Add decision_type filter parameter

5. TEST: Add E2E test for unified decisions
    `.trim(),
    metadata: {
      research_reference: 'reactive-dazzling-reef.md#investigation-results',
      tables_to_unify: ['agent_messages', 'venture_decisions', 'venture_stage_work', 'chairman_decisions'],
      files_to_modify: [
        'src/hooks/useChairmanDashboardData.ts',
        'src/pages/api/v2/chairman/decisions.ts',
        'src/services/evaStateMachines.ts'
      ],
      estimated_effort: '3-5 days',
      ai_consensus: 'All 3 AI analyses identified this as CRITICAL priority',
      sd_type: 'database'
    }
  },
  {
    id: uuidv4(),
    sd_key: 'SD-VISION-V2-010',
    title: 'Vision V2: Token Ledger & Budget Enforcement',
    description: 'Replace placeholder token metrics in the Chairman dashboard with real aggregated values from the token ledger. Connect token consumption to EVA circuit breaker for automatic budget enforcement.',
    rationale: 'Currently src/pages/api/v2/chairman/briefing.ts returns hardcoded tokenSummary values. A "command center" showing fake numbers is worse than no numbers - it misleads the Chairman about actual resource consumption and budget status.',
    scope: 'Implement token ledger aggregation queries, Replace hardcoded tokenSummary in briefing API, Replace hardcoded portfolio value in UI hook, Replace hardcoded team capacity (78%), Connect to EVA circuit breaker thresholds, Add real-time token consumption tracking.',
    strategic_objectives: [
      'Real-time visibility into token consumption',
      'Automatic budget threshold alerts',
      'EVA circuit breaker integration'
    ],
    success_metrics: [
      '0 hardcoded values in token summary',
      'Real-time token consumption within 5 minute lag',
      'Circuit breaker triggers at configured thresholds'
    ],
    key_principles: [
      'Real data over placeholder data',
      'Aggregate at query time for accuracy',
      'Cache sparingly, refresh frequently'
    ],
    status: 'draft',
    current_phase: 'LEAD',
    category: 'feature',
    priority: 'critical',
    parent_sd_id: PARENT_SD_ID,
    target_application: 'EHG',
    sequence_rank: 2,
    risks: [
      { id: 'R1', description: 'Token ledger table may not exist or be empty', mitigation: 'Verify table and seed test data' },
      { id: 'R2', description: 'Aggregation queries may be slow', mitigation: 'Use materialized views if needed' }
    ],
    dependencies: [
      { sd_id: 'SD-VISION-V2-009', type: 'predecessor', description: 'Unified decision model provides foundation' }
    ],
    success_criteria: [
      'Briefing API returns real token consumption values',
      'Dashboard shows actual portfolio value',
      'Team capacity reflects real venture workload',
      'Circuit breaker respects configured limits'
    ],
    implementation_guidelines: `
1. AUDIT: Find all hardcoded metrics
   - Search: grep -r "tokenSummary|portfolioValue|teamCapacity" src/

2. CREATE: Token aggregation functions
   - get_token_consumption_by_venture()
   - get_total_token_spend()
   - get_budget_remaining()

3. UPDATE: briefing.ts API
   - Replace static tokenSummary with aggregation query
   - Add real-time refresh capability

4. CONNECT: EVA circuit breaker
   - Add threshold configuration
   - Implement budget exceeded handling
    `.trim(),
    metadata: {
      research_reference: 'reactive-dazzling-reef.md#codex-found',
      placeholder_locations: [
        'src/pages/api/v2/chairman/briefing.ts:tokenSummary',
        'src/hooks/useChairmanDashboardData.ts:portfolioValue',
        'src/hooks/useChairmanDashboardData.ts:teamCapacity'
      ],
      estimated_effort: '2-3 days',
      sd_type: 'feature'
    }
  },
  {
    id: uuidv4(),
    sd_key: 'SD-VISION-V2-011',
    title: 'Vision V2: EVA Backend Intelligence',
    description: 'Move generateProactiveInsight from frontend heuristics to EVA backend orchestration. Implement real multi-agent insight aggregation instead of simulated frontend logic.',
    rationale: 'Currently generateProactiveInsight is a frontend function that generates fake insights. The EVA (Executive Virtual Assistant) should provide real intelligence based on actual venture data, agent messages, and portfolio analysis - not frontend approximations.',
    scope: 'Move generateProactiveInsight to EVA backend service, Implement multi-agent insight aggregation, Connect to real venture/agent data sources, Add insight prioritization and filtering, Create API endpoint for EVA insights.',
    strategic_objectives: [
      'Backend-generated insights based on real data',
      'Multi-agent intelligence aggregation',
      'Proactive recommendations for Chairman'
    ],
    success_metrics: [
      '0 frontend-generated fake insights',
      'Insights based on actual database queries',
      'Multi-agent recommendations aggregated'
    ],
    key_principles: [
      'Backend intelligence over frontend heuristics',
      'Real data over simulated data',
      'Aggregated multi-source insights'
    ],
    status: 'draft',
    current_phase: 'LEAD',
    category: 'feature',
    priority: 'high',
    parent_sd_id: PARENT_SD_ID,
    target_application: 'EHG',
    sequence_rank: 3,
    risks: [
      { id: 'R1', description: 'EVA backend services may need significant refactoring', mitigation: 'Incremental migration, keep frontend fallback' },
      { id: 'R2', description: 'Real insights may be less polished than hardcoded ones', mitigation: 'Template system for consistent formatting' }
    ],
    dependencies: [
      { sd_id: 'SD-VISION-V2-009', type: 'predecessor', description: 'Unified decision data' },
      { sd_id: 'SD-VISION-V2-010', type: 'predecessor', description: 'Real metrics for insight generation' }
    ],
    success_criteria: [
      'EVA service generates insights from database',
      'No frontend mock insight generation',
      'Insights reflect actual portfolio state'
    ],
    implementation_guidelines: `
1. LOCATE: generateProactiveInsight function
   - Find current implementation
   - Document existing insight types

2. CREATE: EVA insight service
   - src/services/evaInsightService.ts
   - Multi-source data aggregation
   - Prioritization algorithm

3. CREATE: API endpoint
   - GET /api/v2/chairman/insights
   - Returns EVA-generated insights

4. REMOVE: Frontend mock generation
   - Replace with API call
    `.trim(),
    metadata: {
      research_reference: 'reactive-dazzling-reef.md#gemini-found',
      current_implementation: 'frontend heuristic in generateProactiveInsight',
      target_implementation: 'EVA backend service',
      estimated_effort: '2-3 days',
      sd_type: 'feature'
    }
  },
  {
    id: uuidv4(),
    sd_key: 'SD-VISION-V2-012',
    title: 'Vision V2: Blueprint Job Runner Verification',
    description: 'Verify that the blueprint job runner exists and actually consumes jobs from blueprint_jobs table. Ensure the deal flow pipeline executes as designed rather than just creating jobs that are never processed.',
    rationale: 'Codex analysis identified that blueprint_jobs may create jobs that are never consumed. A job queue without a worker is worse than no job queue - it gives false confidence that work is happening when it\'s not.',
    scope: 'Verify blueprint_jobs table exists and has data, Verify worker/consumer exists for job processing, Trace job lifecycle from creation to completion, Fix or document any gaps in job processing, Add job processing observability.',
    strategic_objectives: [
      'Verify deal flow pipeline is functional',
      'Jobs created are actually processed',
      'Observability into job queue health'
    ],
    success_metrics: [
      'Job completion rate ≥95%',
      'No orphaned jobs older than 1 hour',
      'Job processing observability dashboard'
    ],
    key_principles: [
      'Verify before assuming',
      'Observability over hope',
      'Complete pipelines over partial ones'
    ],
    status: 'draft',
    current_phase: 'LEAD',
    category: 'infrastructure',
    priority: 'high',
    parent_sd_id: PARENT_SD_ID,
    target_application: 'EHG',
    sequence_rank: 4,
    risks: [
      { id: 'R1', description: 'Job runner may not exist', mitigation: 'Create worker if missing' },
      { id: 'R2', description: 'Existing jobs may be stale/orphaned', mitigation: 'Add cleanup job for old jobs' }
    ],
    dependencies: [],
    success_criteria: [
      'Job runner verified or created',
      'Test job completes within expected time',
      'Observability shows job queue health'
    ],
    implementation_guidelines: `
1. VERIFY: blueprint_jobs table
   - SELECT COUNT(*) FROM blueprint_jobs
   - Check job statuses

2. FIND: Job consumer/worker
   - Search for queue processing code
   - Check for cron/scheduled tasks

3. IF MISSING: Create worker
   - Implement job processing logic
   - Add retry/failure handling

4. ADD: Observability
   - Job queue metrics
   - Processing time tracking
    `.trim(),
    metadata: {
      research_reference: 'reactive-dazzling-reef.md#codex-found',
      table_to_verify: 'blueprint_jobs',
      estimated_effort: '1-2 days',
      sd_type: 'infrastructure'
    }
  },
  {
    id: uuidv4(),
    sd_key: 'SD-VISION-V2-013',
    title: 'Vision V2: Contract & Invariant Test Suite',
    description: 'Establish API contract tests against Zod schemas and invariant tests for critical state transitions. Cover idempotency, atomicity, and RLS boundary scenarios.',
    rationale: 'Both Claude and Codex analyses identified testing gaps, particularly around invariants. While Vision V2 has 20 smoke tests, there are no contract tests verifying API responses match schemas, and no invariant tests for stage transitions.',
    scope: 'API contract tests against Zod schemas, Stage transition invariant tests, RLS boundary tests, Idempotency tests for mutation endpoints, Atomicity tests for multi-step operations.',
    strategic_objectives: [
      'API responses match documented schemas',
      'State transitions are valid and complete',
      'RLS policies enforced correctly'
    ],
    success_metrics: [
      'API contract test coverage ≥80%',
      'All stage transitions have invariant tests',
      'RLS boundary tests for all tables with policies'
    ],
    key_principles: [
      'Contract tests catch drift',
      'Invariants prevent invalid states',
      'RLS tests verify security'
    ],
    status: 'draft',
    current_phase: 'LEAD',
    category: 'quality',
    priority: 'medium',
    parent_sd_id: PARENT_SD_ID,
    target_application: 'EHG',
    sequence_rank: 5,
    risks: [
      { id: 'R1', description: 'Existing code may not match schemas', mitigation: 'Tests will initially fail, fix code to match' },
      { id: 'R2', description: 'Test maintenance overhead', mitigation: 'Auto-generate from schemas where possible' }
    ],
    dependencies: [
      { sd_id: 'SD-VISION-V2-009', type: 'predecessor', description: 'Data model stabilized' },
      { sd_id: 'SD-VISION-V2-010', type: 'predecessor', description: 'Metrics stabilized' },
      { sd_id: 'SD-VISION-V2-011', type: 'predecessor', description: 'EVA stabilized' },
      { sd_id: 'SD-VISION-V2-012', type: 'predecessor', description: 'Job runner stabilized' }
    ],
    success_criteria: [
      'Contract tests in place for Chairman APIs',
      'Invariant tests for venture stage transitions',
      'RLS tests for Chairman-specific tables'
    ],
    implementation_guidelines: `
1. CREATE: Contract test framework
   - Use Zod schemas as source of truth
   - Compare API responses to schemas

2. CREATE: Invariant test suite
   - Stage transition tests
   - Decision state machine tests

3. CREATE: RLS boundary tests
   - Test as different user roles
   - Verify unauthorized access blocked
    `.trim(),
    metadata: {
      research_reference: 'reactive-dazzling-reef.md#common-findings',
      test_types: ['contract', 'invariant', 'rls_boundary'],
      estimated_effort: '3-5 days',
      sd_type: 'infrastructure'
    }
  }
];

async function seedVisionV2Phase2() {
  console.log('\n🚀 Seeding Vision V2 Phase 2 Strategic Directives');
  console.log('═'.repeat(60));

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  // Check if parent already exists
  const { data: existingParent } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('sd_key', 'SD-VISION-V2-P2-000')
    .single();

  if (existingParent) {
    console.log('⚠️  Parent SD-VISION-V2-P2-000 already exists');
    console.log('   Use --force to recreate');

    // Check for children
    const { data: existingChildren } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq('parent_sd_id', existingParent.id);

    if (existingChildren?.length) {
      console.log(`   Existing children: ${existingChildren.map(c => c.sd_key).join(', ')}`);
    }

    if (!process.argv.includes('--force')) {
      console.log('\n   Run with --force to delete and recreate');
      return;
    }

    console.log('\n🔄 --force detected, deleting existing SDs...');

    // Delete children first
    if (existingChildren?.length) {
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('parent_sd_id', existingParent.id);
      console.log(`   Deleted ${existingChildren.length} children`);
    }

    // Delete parent
    await supabase
      .from('strategic_directives_v2')
      .delete()
      .eq('id', existingParent.id);
    console.log('   Deleted parent SD');
  }

  // Insert parent SD
  console.log('\n📦 Inserting Parent SD: SD-VISION-V2-P2-000');
  const { error: parentError } = await supabase
    .from('strategic_directives_v2')
    .insert(parentSD);

  if (parentError) {
    console.error('❌ Failed to insert parent SD:', parentError.message);
    return;
  }
  console.log('   ✅ Parent SD inserted');

  // Insert child SDs
  console.log('\n📦 Inserting Child SDs:');
  for (const childSD of childSDs) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .insert(childSD);

    if (error) {
      console.error(`   ❌ ${childSD.sd_key}: ${error.message}`);
    } else {
      console.log(`   ✅ ${childSD.sd_key}: ${childSD.title}`);
    }
  }

  // Verify insertion
  console.log('\n🔍 Verifying insertion...');
  const { data: verifyParent } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title')
    .eq('sd_key', 'SD-VISION-V2-P2-000')
    .single();

  const { data: verifyChildren } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, priority, sequence_rank')
    .eq('parent_sd_id', verifyParent?.id)
    .order('sequence_rank');

  console.log('\n📋 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Parent: ${verifyParent?.sd_key} - ${verifyParent?.title}`);
  console.log(`Children: ${verifyChildren?.length || 0}`);
  verifyChildren?.forEach(c => {
    console.log(`   [${c.priority}] ${c.sd_key}: ${c.title}`);
  });

  console.log('\n✅ Vision V2 Phase 2 seeded successfully!');
  console.log('   Run "npm run sd:next" to see the updated queue');
}

seedVisionV2Phase2().catch(console.error);
