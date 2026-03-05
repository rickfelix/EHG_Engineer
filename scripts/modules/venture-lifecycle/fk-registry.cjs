/**
 * FK Registry — Central registry of all venture FK relationships.
 * Each entry defines: table, column, and delete policy.
 * This registry drives all lifecycle operations (teardown, archive, constraint migration).
 *
 * Policies:
 *   CASCADE  — child data deleted when venture is deleted (50+ data tables)
 *   RESTRICT — deletion blocked if records exist (governance/audit tables)
 *   SET_NULL — FK set to NULL on delete (cross-reference tables)
 */

const VENTURE_FK_REGISTRY = [
  // ─── Governance tables — RESTRICT (audit records must be preserved) ───
  { table: 'chairman_decisions', column: 'venture_id', policy: 'RESTRICT', category: 'governance' },
  { table: 'chairman_directives', column: 'venture_id', policy: 'RESTRICT', category: 'governance' },
  { table: 'governance_decisions', column: 'venture_id', policy: 'RESTRICT', category: 'governance' },
  { table: 'compliance_gate_events', column: 'venture_id', policy: 'RESTRICT', category: 'governance' },
  { table: 'risk_escalation_log', column: 'venture_id', policy: 'RESTRICT', category: 'governance' },
  { table: 'risk_gate_passage_log', column: 'venture_id', policy: 'RESTRICT', category: 'governance' },

  // ─── Cross-reference tables — SET_NULL (preserve records, null the FK) ───
  { table: 'strategic_directives_v2', column: 'venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'sd_phase_handoffs', column: 'venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'sd_proposals', column: 'venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'product_requirements_v2', column: 'venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'venture_dependencies', column: 'dependent_venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'venture_dependencies', column: 'provider_venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'venture_capabilities', column: 'origin_venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'venture_templates', column: 'source_venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'venture_nursery', column: 'promoted_to_venture_id', policy: 'SET_NULL', category: 'cross_ref' },
  { table: 'agent_registry', column: 'venture_id', policy: 'SET_NULL', category: 'cross_ref' },

  // ─── EVA system tables — CASCADE ───
  { table: 'eva_actions', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_architecture_plans', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_interactions', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_orchestration_events', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_saga_log', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_stage_gate_results', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_trace_log', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_vision_documents', column: 'venture_id', policy: 'CASCADE', category: 'eva' },
  { table: 'eva_ventures', column: 'venture_id', policy: 'CASCADE', category: 'eva' },

  // ─── Chairman settings — CASCADE ───
  { table: 'chairman_approval_requests', column: 'venture_id', policy: 'CASCADE', category: 'chairman' },
  { table: 'chairman_settings', column: 'venture_id', policy: 'CASCADE', category: 'chairman' },

  // ─── Financial / capital — CASCADE ───
  { table: 'capital_transactions', column: 'venture_id', policy: 'CASCADE', category: 'financial' },
  { table: 'financial_models', column: 'venture_id', policy: 'CASCADE', category: 'financial' },

  // ─── Marketing — CASCADE ───
  { table: 'marketing_attribution', column: 'venture_id', policy: 'CASCADE', category: 'marketing' },
  { table: 'marketing_campaigns', column: 'venture_id', policy: 'CASCADE', category: 'marketing' },
  { table: 'marketing_channels', column: 'venture_id', policy: 'CASCADE', category: 'marketing' },
  { table: 'marketing_content', column: 'venture_id', policy: 'CASCADE', category: 'marketing' },
  { table: 'marketing_content_queue', column: 'venture_id', policy: 'CASCADE', category: 'marketing' },
  { table: 'channel_budgets', column: 'venture_id', policy: 'CASCADE', category: 'marketing' },
  { table: 'distribution_history', column: 'venture_id', policy: 'CASCADE', category: 'marketing' },

  // ─── Risk / compliance (non-governance data) — CASCADE ───
  { table: 'risk_recalibration_forms', column: 'venture_id', policy: 'CASCADE', category: 'risk' },

  // ─── Stage / lifecycle — CASCADE ───
  { table: 'stage13_valuations', column: 'venture_id', policy: 'CASCADE', category: 'stage' },
  { table: 'stage13_substage_states', column: 'venture_id', policy: 'CASCADE', category: 'stage' },
  { table: 'stage13_assessments', column: 'venture_id', policy: 'CASCADE', category: 'stage' },
  { table: 'substage_transition_log', column: 'venture_id', policy: 'CASCADE', category: 'stage' },
  { table: 'stage_zero_requests', column: 'venture_id', policy: 'CASCADE', category: 'stage' },
  { table: 'venture_stage_transitions', column: 'venture_id', policy: 'CASCADE', category: 'stage' },
  { table: 'venture_stage_work', column: 'venture_id', policy: 'CASCADE', category: 'stage' },

  // ─── Venture child data tables — CASCADE ───
  { table: 'venture_documents', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_decisions', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_compliance_artifacts', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_compliance_progress', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_exit_profiles', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_financial_contract', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_phase_budgets', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_token_budgets', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  // venture_token_ledger — not in live DB (phantom migration artifact)
  { table: 'venture_tool_quotas', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  // venture_data_room_artifacts — not in live DB (phantom migration artifact)
  // venture_separability_scores — not in live DB (phantom migration artifact)
  { table: 'venture_artifacts', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_asset_registry', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },
  { table: 'venture_briefs', column: 'venture_id', policy: 'CASCADE', category: 'venture_data' },

  // ─── Agent / intelligence — CASCADE ───
  { table: 'agent_memory_stores', column: 'venture_id', policy: 'CASCADE', category: 'agent' },
  { table: 'intelligence_analysis', column: 'venture_id', policy: 'CASCADE', category: 'agent' },

  // ─── Other data tables — CASCADE ───
  { table: 'competitors', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  // counterfactual_scores — not in live DB (phantom migration artifact)
  { table: 'daily_rollups', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'missions', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'modeling_requests', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'monthly_ceo_reports', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'naming_suggestions', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'naming_favorites', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'orchestration_metrics', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'pending_ceo_handoffs', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  { table: 'public_portfolio', column: 'venture_id', policy: 'CASCADE', category: 'other' },
  // stage_of_death_predictions — not in live DB (phantom migration artifact)
  { table: 'tool_usage_ledger', column: 'venture_id', policy: 'CASCADE', category: 'other' },
];

// Self-referencing FK columns on ventures table that must be nulled before delete
const VENTURE_SELF_REFS = [
  'brief_id',
  'vision_id',
  'architecture_plan_id',
  'ceo_agent_id',
  'portfolio_id',
  'company_id',
  'source_blueprint_id',
];

function getByPolicy(policy) {
  return VENTURE_FK_REGISTRY.filter(e => e.policy === policy);
}

function getByCategory(category) {
  return VENTURE_FK_REGISTRY.filter(e => e.category === category);
}

function getTeardownOrder() {
  // RESTRICT tables first (check for blockers), then SET_NULL, then CASCADE
  const restrict = getByPolicy('RESTRICT');
  const setNull = getByPolicy('SET_NULL');
  const cascade = getByPolicy('CASCADE');
  return { restrict, setNull, cascade };
}

function getSummary() {
  const cascade = getByPolicy('CASCADE').length;
  const restrict = getByPolicy('RESTRICT').length;
  const setNull = getByPolicy('SET_NULL').length;
  return {
    total: VENTURE_FK_REGISTRY.length,
    cascade,
    restrict,
    setNull,
    selfRefs: VENTURE_SELF_REFS.length,
  };
}

module.exports = {
  VENTURE_FK_REGISTRY,
  VENTURE_SELF_REFS,
  getByPolicy,
  getByCategory,
  getTeardownOrder,
  getSummary,
};
