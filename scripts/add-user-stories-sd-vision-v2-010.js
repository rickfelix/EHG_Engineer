#!/usr/bin/env node
/**
 * Add User Stories for SD-VISION-V2-010
 * Vision V2: Token Ledger & Budget Enforcement
 *
 * Creates user stories for replacing placeholder token metrics with real aggregated
 * values and connecting EVA circuit breaker to budget enforcement.
 *
 * Functional Requirements Mapping:
 * - FR-1: Replace hardcoded tokenSummary in briefing API → US-001
 * - FR-2: Replace hardcoded financialOverview in briefing API → US-002
 * - FR-3: Replace hardcoded teamCapacity in dashboard hook → US-003
 * - FR-4: Connect EVA circuit breaker to budget exceeded events → US-004
 * - FR-5: Display budget warnings in Chairman dashboard alerts → US-005
 * - NFR-1: Token ledger aggregation performance → US-006
 * - NFR-2: Budget threshold configuration → US-007
 *
 * Existing Infrastructure:
 * - Tables: venture_token_budgets, venture_phase_budgets, venture_budget_transactions, venture_budget_warnings
 * - Service: EVATokenBudgetManager (evaTokenBudget.ts)
 * - Event Bus: EVA_ALERT events for budget warnings
 *
 * Files to Modify:
 * - src/pages/api/v2/chairman/briefing.ts (lines 175-191)
 * - src/hooks/useChairmanDashboardData.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VISION-V2-010';
const PRD_ID = 'PRD-SD-VISION-V2-010';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
const userStories = [
  {
    story_key: 'SD-VISION-V2-010:US-001',
    prd_id: null,  // PRD may not exist yet
    sd_id: SD_ID,
    title: 'Display real-time token consumption metrics in Chairman briefing',
    user_role: 'Chairman',
    user_want: 'View actual token consumption data aggregated from venture budget transactions',
    user_benefit: 'I can make informed decisions about resource allocation based on real usage patterns instead of placeholder data',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Token summary with real data',
        given: 'Chairman is authenticated AND ventures have token budget transactions',
        when: 'Chairman loads the daily briefing',
        then: 'Token summary shows real values: total_tokens_used (sum of all transactions), total_tokens_allocated (sum of all budgets), utilization_percentage (used/allocated), tokens_remaining (allocated - used) AND no hardcoded values are displayed'
      },
      {
        id: 'AC-001-2',
        scenario: 'Zero usage - New venture',
        given: 'Venture has budget allocated BUT no transactions recorded',
        when: 'Chairman views briefing',
        then: 'Token summary shows: total_tokens_used = 0, total_tokens_allocated = budget amount, utilization_percentage = 0%, tokens_remaining = budget amount'
      },
      {
        id: 'AC-001-3',
        scenario: 'Multiple ventures - Aggregation',
        given: 'Chairman has 3 active ventures with different token usage',
        when: 'Briefing API aggregates token data',
        then: 'Token summary shows sum across all ventures AND each venture\'s contribution is tracked in venture_budget_transactions table'
      },
      {
        id: 'AC-001-4',
        scenario: 'Performance - Large transaction volume',
        given: 'System has 1000+ token budget transactions',
        when: 'Chairman loads briefing',
        then: 'Token summary loads in <500ms AND uses optimized aggregation query with indexes'
      }
    ],
    definition_of_done: [
      'src/pages/api/v2/chairman/briefing.ts lines 175-181 replaced with real aggregation query',
      'Token summary uses venture_budget_transactions table for total_tokens_used',
      'Token summary uses venture_token_budgets table for total_tokens_allocated',
      'Utilization percentage calculated: (used / allocated) * 100',
      'Unit tests validate aggregation logic with multiple ventures',
      'E2E test validates real-time updates when token transaction occurs'
    ],
    technical_notes: 'Replace placeholder tokenSummary object with Supabase query. Aggregate SUM(token_amount) from venture_budget_transactions for usage. JOIN with venture_token_budgets for allocation. Calculate utilization on-the-fly. Consider caching for performance if transaction volume grows. Edge cases: No ventures (show zeros), budget not set (show N/A), negative tokens (log error).',
    implementation_approach: 'Create aggregation query using Supabase client. Query venture_budget_transactions.sum(token_amount) grouped by venture. Join with venture_token_budgets for allocation. Calculate utilization percentage. Replace hardcoded object at lines 175-181.',
    implementation_context: 'Chairman briefing API is the single source of truth for dashboard data. Token metrics drive budget warning system. Performance critical: loaded on every dashboard refresh.',
    architecture_references: [
      'src/pages/api/v2/chairman/briefing.ts - Line 175-181 (placeholder to replace)',
      'database/schema/venture_token_budgets - Budget allocation table',
      'database/schema/venture_budget_transactions - Token usage ledger',
      'src/services/evaTokenBudget.ts - EVATokenBudgetManager service (reference implementation)'
    ],
    example_code_patterns: {
      aggregation_query: `// Replace lines 175-181 in briefing.ts
// Query real token data from database
const { data: tokenData, error: tokenError } = await supabase.rpc(
  'get_chairman_token_summary',
  { chairman_id: chairmanId }
);

if (tokenError) {
  console.error('Token summary error:', tokenError);
  // Fallback to zeros, not hardcoded values
  tokenSummary = { total_tokens_used: 0, total_tokens_allocated: 0, utilization_percentage: 0, tokens_remaining: 0 };
} else {
  const used = tokenData?.total_used || 0;
  const allocated = tokenData?.total_allocated || 0;
  const utilization = allocated > 0 ? (used / allocated) * 100 : 0;

  tokenSummary = {
    total_tokens_used: used,
    total_tokens_allocated: allocated,
    utilization_percentage: Math.round(utilization * 10) / 10, // 1 decimal
    tokens_remaining: allocated - used
  };
}`,
      rpc_function: `-- Create database RPC function for optimized aggregation
CREATE OR REPLACE FUNCTION get_chairman_token_summary(chairman_id UUID)
RETURNS TABLE (
  total_used BIGINT,
  total_allocated BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(vbt.token_amount), 0)::BIGINT AS total_used,
    COALESCE(SUM(vtb.total_budget), 0)::BIGINT AS total_allocated
  FROM venture_token_budgets vtb
  LEFT JOIN venture_budget_transactions vbt ON vtb.venture_id = vbt.venture_id
  WHERE vtb.venture_id IN (
    SELECT id FROM ventures WHERE chairman_id = $1 AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`
    },
    testing_scenarios: [
      { scenario: 'Load briefing with real token data', type: 'e2e', priority: 'P0' },
      { scenario: 'Verify aggregation across multiple ventures', type: 'integration', priority: 'P0' },
      { scenario: 'Handle zero usage gracefully', type: 'unit', priority: 'P1' },
      { scenario: 'Performance test with 1000+ transactions', type: 'performance', priority: 'P2' }
    ],
    e2e_test_path: 'tests/e2e/chairman/US-001-real-token-metrics.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-010:US-002',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Display real financial overview with budget and spend data',
    user_role: 'Chairman',
    user_want: 'View actual budget allocations, spend amounts, and remaining funds across my portfolio',
    user_benefit: 'I can track real financial health instead of seeing static $10,000 placeholder values',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Financial overview with real data',
        given: 'Chairman has ventures with token budgets',
        when: 'Chairman loads the daily briefing',
        then: 'Financial overview shows: total_budget_usd (sum of venture budgets × token price), total_spent_usd (sum of transactions × token price), budget_remaining_usd (budget - spent)'
      },
      {
        id: 'AC-002-2',
        scenario: 'Top spenders list',
        given: 'Multiple ventures have token consumption',
        when: 'Briefing loads',
        then: 'top_spenders array shows top 5 ventures by token consumption with venture_id, name, and tokens_used'
      },
      {
        id: 'AC-002-3',
        scenario: 'Token-to-USD conversion',
        given: 'System has configurable TOKEN_PRICE_USD constant',
        when: 'Financial values are calculated',
        then: 'USD values use token_count × TOKEN_PRICE_USD (default $0.01 per 1K tokens = $0.00001 per token)'
      }
    ],
    definition_of_done: [
      'briefing.ts lines 183-191 replaced with real budget query',
      'TOKEN_PRICE_USD constant defined (default 0.00001)',
      'Top spenders query orders by tokens_used DESC LIMIT 5',
      'E2E test validates USD calculations'
    ],
    technical_notes: 'Replace hardcoded financialOverview. Query venture_token_budgets for allocations, venture_budget_transactions for spend. Token pricing should be configurable.',
    implementation_context: 'Financial overview is critical for budget governance. The Chairman needs accurate spend data to make informed decisions. Must maintain API contract compatibility with existing frontend.',
    e2e_test_path: 'tests/e2e/chairman/US-002-financial-overview.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-010:US-003',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Display dynamic team capacity based on venture workload',
    user_role: 'Chairman',
    user_want: 'See actual team capacity calculated from venture count and agent availability',
    user_benefit: 'I can understand real workload distribution instead of seeing hardcoded 78%',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Dynamic capacity calculation',
        given: 'Chairman has N active ventures and system has MAX_VENTURES capacity',
        when: 'Dashboard loads',
        then: 'teamCapacity shows "X%" where X = (active_ventures / MAX_VENTURES) × 100'
      },
      {
        id: 'AC-003-2',
        scenario: 'No hardcoded values',
        given: 'useChairmanDashboardData.ts line 324',
        when: 'Code is reviewed',
        then: 'No string literal "78%" exists in the codebase'
      }
    ],
    definition_of_done: [
      'useChairmanDashboardData.ts line 324 calculates capacity dynamically',
      'MAX_VENTURES constant defined (configurable)',
      'No hardcoded capacity values remain'
    ],
    technical_notes: 'Replace teamCapacity: "78%" with calculation. Use active venture count / MAX_VENTURES. Consider agent_registry capacity as alternative metric.',
    implementation_context: 'Team capacity helps Chairman understand workload distribution. Currently hardcoded in useChairmanDashboardData.ts. Simple calculation from active venture count.',
    e2e_test_path: 'tests/e2e/chairman/US-003-team-capacity.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-010:US-004',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Connect EVA circuit breaker to budget exceeded events',
    user_role: 'System',
    user_want: 'Automatically pause operations when a venture exceeds its token budget',
    user_benefit: 'Prevent runaway AI costs and ensure budget discipline',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Circuit breaker receives budget events',
        given: 'EVA circuit breaker is initialized',
        when: 'EVATokenBudgetManager emits EVA_ALERT with type budget_warning',
        then: 'Circuit breaker receives and processes the event'
      },
      {
        id: 'AC-004-2',
        scenario: 'Budget exceeded triggers pause',
        given: 'Venture reaches 100% budget utilization',
        when: 'Budget exceeded event fires',
        then: 'Circuit breaker can pause venture operations (configurable behavior)'
      },
      {
        id: 'AC-004-3',
        scenario: 'Warning thresholds',
        given: 'EVATokenBudgetManager has 85%/95%/100% thresholds',
        when: 'Venture crosses threshold',
        then: 'Appropriate event type emitted: warning (85%), critical (95%), exceeded (100%)'
      }
    ],
    definition_of_done: [
      'Circuit breaker subscribes to EVA_ALERT events',
      'Budget exceeded handler implemented',
      'Integration test verifies event flow'
    ],
    technical_notes: 'EVATokenBudgetManager already emits events via eventBus.publish(EVA_ALERT). Verify circuit breaker subscribes. Add handler for budget_warning type.',
    implementation_context: 'Circuit breaker is part of EVA orchestration layer. EVATokenBudgetManager already emits budget warning events. Need to verify circuit breaker is subscribed and handles budget exceeded events.',
    e2e_test_path: 'tests/e2e/eva/US-004-circuit-breaker.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-010:US-005',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Display budget warnings in Chairman dashboard alerts',
    user_role: 'Chairman',
    user_want: 'See budget warning alerts when ventures approach or exceed token limits',
    user_benefit: 'I can proactively manage budgets before they become critical',
    priority: 'medium',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: '85% warning threshold',
        given: 'Venture reaches 85% budget utilization',
        when: 'Chairman views dashboard',
        then: 'Alert appears with severity: warning and message about budget status'
      },
      {
        id: 'AC-005-2',
        scenario: '95% critical threshold',
        given: 'Venture reaches 95% budget utilization',
        when: 'Chairman views dashboard',
        then: 'Alert appears with severity: critical'
      },
      {
        id: 'AC-005-3',
        scenario: '100% exceeded threshold',
        given: 'Venture exceeds 100% budget',
        when: 'Chairman views dashboard',
        then: 'Alert appears with severity: critical and "exceeded" indicator'
      }
    ],
    definition_of_done: [
      'Budget warnings from venture_budget_warnings included in alerts array',
      'Alert severity maps to threshold type',
      'E2E test validates alert display'
    ],
    technical_notes: 'Query venture_budget_warnings table in briefing.ts. Map threshold_type to alert severity. Include in alerts array alongside other alert types.',
    implementation_context: 'Budget warnings stored in venture_budget_warnings table by EVATokenBudgetManager. Need to query and include in briefing API alerts array for Chairman visibility.',
    e2e_test_path: 'tests/e2e/chairman/US-005-budget-alerts.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log(`📚 Adding ${userStories.length} user stories for ${SD_ID} to database...\n`);

  try {
    // Verify SD exists (support both UUID and legacy_id)
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, sd_key, title')
      .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID}`)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${SD_ID} not found in database`);
      console.log('   Error:', sdError?.message);
      console.log('   Create SD first before adding user stories');
      process.exit(1);
    }

    // Use the UUID for foreign key references
    const sdUuid = sdData.id;

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   UUID: ${sdUuid}`);
    console.log(`   Legacy ID: ${sdData.legacy_id || 'N/A'}\n`);

    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    for (const story of userStories) {
      try {
        // Check if story already exists
        const { data: existing } = await supabase
          .from('user_stories')
          .select('story_key')
          .eq('story_key', story.story_key)
          .single();

        if (existing) {
          console.log(`⚠️  ${story.story_key} already exists, skipping...`);
          skipCount++;
          continue;
        }

        // Use UUID for sd_id foreign key
        const storyWithUuid = {
          ...story,
          sd_id: sdUuid  // Replace string SD_ID with actual UUID
        };

        const { data, error } = await supabase
          .from('user_stories')
          .insert(storyWithUuid)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error adding ${story.story_key}:`, error.message);
          console.error(`   Code: ${error.code}, Details: ${error.details}`);
          errorCount++;
        } else {
          console.log(`✅ Added ${story.story_key}: ${story.title}`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Exception adding ${story.story_key}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Success: ${successCount}/${userStories.length}`);
    console.log(`   Skipped: ${skipCount}/${userStories.length}`);
    console.log(`   Errors: ${errorCount}/${userStories.length}`);

    if (errorCount === 0 && successCount > 0) {
      console.log('\n✨ All user stories added successfully for SD-VISION-V2-010!');
      console.log('\n📋 Next Steps:');
      console.log('   1. Review stories in database: SELECT * FROM user_stories WHERE sd_id = \'SD-VISION-V2-010\'');
      console.log('   2. Validate INVEST criteria using: npm run stories:validate');
      console.log('   3. Generate E2E tests: npm run test:generate-from-stories');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUserStories()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { userStories, addUserStories };
