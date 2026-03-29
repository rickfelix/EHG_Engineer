import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

/**
 * Master Reset Validation Test
 * SD: SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-A
 *
 * Verifies that all tables referenced by master_reset_portfolio() exist in the
 * database. Catches schema drift before reset attempts fail at runtime.
 */

// Tables that master_reset_portfolio() unconditionally deletes from.
// These MUST exist for the RPC to succeed.
const REQUIRED_TABLES = [
  // Phase 2: Governance
  'chairman_decisions', 'chairman_directives', 'governance_decisions',
  'compliance_gate_events', 'risk_escalation_log', 'risk_gate_passage_log',
  // Phase 3: FK nulling
  'strategic_directives_v2', 'sd_phase_handoffs', 'sd_proposals',
  'product_requirements_v2', 'venture_dependencies', 'venture_capabilities',
  'venture_templates', 'venture_nursery', 'agent_registry', 'ventures',
  // Phase 4: EVA
  'eva_vision_scores', 'eva_scheduler_metrics', 'eva_scheduler_queue',
  'eva_audit_log', 'venture_separability_scores', 'eva_actions',
  'eva_architecture_plans', 'eva_interactions', 'eva_orchestration_events',
  'eva_saga_log', 'eva_stage_gate_results', 'eva_trace_log',
  'eva_vision_documents', 'eva_ventures',
  // Phase 4: Financial
  'chairman_approval_requests', 'chairman_settings', 'capital_transactions',
  'financial_models', 'venture_financial_contract', 'venture_phase_budgets',
  'venture_token_budgets', 'venture_token_ledger',
  // Phase 4: Marketing
  'marketing_attribution', 'marketing_campaigns', 'marketing_channels',
  'marketing_content', 'marketing_content_queue', 'channel_budgets',
  'distribution_history',
  // Phase 4: Stage/Execution
  'stage_executions', 'risk_recalibration_forms', 'stage13_valuations',
  'stage13_substage_states', 'stage13_assessments', 'substage_transition_log',
  'stage_zero_requests', 'venture_stage_transitions', 'venture_stage_work',
  'stage_events', 'stage_proving_journal',
  // Phase 4: Documents
  'venture_documents', 'venture_decisions', 'venture_compliance_artifacts',
  'venture_compliance_progress', 'venture_exit_profiles',
  // Phase 4: Artifacts
  'venture_artifact_summaries', 'venture_sd_artifact_mapping', 'venture_artifacts',
  // Phase 4: Core
  'venture_asset_registry', 'venture_briefs', 'venture_exit_readiness',
  'venture_tiers', 'venture_fundamentals', 'venture_compliance',
  'venture_provisioning_state',
  // Phase 4: SRIP
  'srip_brand_interviews', 'srip_site_dna',
  // Phase 4: Agent
  'agent_memory_stores', 'intelligence_analysis', 'competitors',
  // Phase 4: Operational
  'daily_rollups', 'missions', 'modeling_requests', 'monthly_ceo_reports',
  'naming_suggestions', 'naming_favorites', 'orchestration_metrics',
  'pending_ceo_handoffs', 'public_portfolio', 'tool_usage_ledger',
  'venture_tool_quotas',
  // Phase 4: Services
  'service_tasks', 'venture_service_bindings', 'service_telemetry',
  'workflow_executions',
  // Supporting
  'operations_audit_log',
];

// Tables in Phase 4.5 that use IF EXISTS — optional, won't break RPC if missing.
const OPTIONAL_TABLES = [
  'genesis_deployments',
  'ci_cd_failure_resolutions', 'github_webhook_events', 'ci_cd_pipeline_status',
  'application_credentials', 'application_directives', 'application_sync_history',
  'application_context', 'managed_applications',
  'protected_resources',
];

let client;

beforeAll(async () => {
  client = new Client({ connectionString: process.env.SUPABASE_POOLER_URL });
  await client.connect();
});

afterAll(async () => {
  if (client) await client.end();
});

describe('master_reset_portfolio table coverage', () => {
  it('all required tables exist in the public schema', async () => {
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);
    const existing = new Set(result.rows.map(r => r.table_name));
    const missing = REQUIRED_TABLES.filter(t => !existing.has(t));

    expect(missing, `Missing required tables: ${missing.join(', ')}`).toEqual([]);
  });

  it('reports optional table presence (informational)', async () => {
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);
    const existing = new Set(result.rows.map(r => r.table_name));
    const present = OPTIONAL_TABLES.filter(t => existing.has(t));
    const absent = OPTIONAL_TABLES.filter(t => !existing.has(t));

    // Log for visibility — these are optional so we don't fail on them
    if (absent.length > 0) {
      console.log(`Optional tables NOT YET created (${absent.length}): ${absent.join(', ')}`);
    }
    if (present.length > 0) {
      console.log(`Optional tables present (${present.length}): ${present.join(', ')}`);
    }

    // This test always passes — it's informational
    expect(true).toBe(true);
  });

  it('master_reset_portfolio RPC exists', async () => {
    const result = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name = 'master_reset_portfolio'
    `);
    expect(result.rows.length, 'master_reset_portfolio() RPC should exist').toBe(1);
  });
});
