-- =============================================================================
-- Migration: Align venture FK policies with fk-registry.cjs
-- Date: 2026-03-06
-- Purpose: Correct ON DELETE policies for all FK constraints referencing
--          ventures(id) to match the authoritative FK registry.
--
-- Audit found:
--   - 29 mismatched policies (wrong ON DELETE action)
--   - 1 duplicate FK on financial_models (fk_venture, stale)
--   - 1 missing FK on stage_events (venture_id column exists, no constraint)
--
-- Registry policies:
--   RESTRICT  — governance/audit tables (block deletion if records exist)
--   SET NULL  — cross-reference tables (preserve records, null the FK)
--   CASCADE   — child data tables (delete with parent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: RESTRICT policy — Governance tables
-- These tables must PREVENT venture deletion when records exist.
-- =============================================================================

-- chairman_decisions: was NO ACTION, should be RESTRICT
ALTER TABLE chairman_decisions DROP CONSTRAINT IF EXISTS chairman_decisions_venture_id_fkey;
ALTER TABLE chairman_decisions
  ADD CONSTRAINT chairman_decisions_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE RESTRICT;

-- chairman_directives: was SET NULL, should be RESTRICT
ALTER TABLE chairman_directives DROP CONSTRAINT IF EXISTS chairman_directives_venture_id_fkey;
ALTER TABLE chairman_directives
  ADD CONSTRAINT chairman_directives_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE RESTRICT;

-- governance_decisions: was NO ACTION, should be RESTRICT
ALTER TABLE governance_decisions DROP CONSTRAINT IF EXISTS governance_decisions_venture_id_fkey;
ALTER TABLE governance_decisions
  ADD CONSTRAINT governance_decisions_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE RESTRICT;

-- compliance_gate_events: was CASCADE, should be RESTRICT
ALTER TABLE compliance_gate_events DROP CONSTRAINT IF EXISTS compliance_gate_events_venture_id_fkey;
ALTER TABLE compliance_gate_events
  ADD CONSTRAINT compliance_gate_events_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE RESTRICT;

-- risk_escalation_log: was CASCADE, should be RESTRICT
ALTER TABLE risk_escalation_log DROP CONSTRAINT IF EXISTS risk_escalation_log_venture_id_fkey;
ALTER TABLE risk_escalation_log
  ADD CONSTRAINT risk_escalation_log_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE RESTRICT;

-- risk_gate_passage_log: was CASCADE, should be RESTRICT
ALTER TABLE risk_gate_passage_log DROP CONSTRAINT IF EXISTS risk_gate_passage_log_venture_id_fkey;
ALTER TABLE risk_gate_passage_log
  ADD CONSTRAINT risk_gate_passage_log_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE RESTRICT;


-- =============================================================================
-- SECTION 2: SET NULL policy — Cross-reference tables
-- These tables preserve records but null the venture_id on deletion.
-- =============================================================================

-- sd_proposals: was CASCADE, should be SET NULL
ALTER TABLE sd_proposals DROP CONSTRAINT IF EXISTS sd_proposals_venture_id_fkey;
ALTER TABLE sd_proposals
  ADD CONSTRAINT sd_proposals_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE SET NULL;

-- venture_dependencies.dependent_venture_id: was CASCADE, should be SET NULL
ALTER TABLE venture_dependencies DROP CONSTRAINT IF EXISTS venture_dependencies_dependent_venture_id_fkey;
ALTER TABLE venture_dependencies
  ADD CONSTRAINT venture_dependencies_dependent_venture_id_fkey
  FOREIGN KEY (dependent_venture_id) REFERENCES ventures(id) ON DELETE SET NULL;

-- venture_dependencies.provider_venture_id: was CASCADE, should be SET NULL
ALTER TABLE venture_dependencies DROP CONSTRAINT IF EXISTS venture_dependencies_provider_venture_id_fkey;
ALTER TABLE venture_dependencies
  ADD CONSTRAINT venture_dependencies_provider_venture_id_fkey
  FOREIGN KEY (provider_venture_id) REFERENCES ventures(id) ON DELETE SET NULL;

-- venture_capabilities.origin_venture_id: was NO ACTION, should be SET NULL
ALTER TABLE venture_capabilities DROP CONSTRAINT IF EXISTS venture_capabilities_origin_venture_id_fkey;
ALTER TABLE venture_capabilities
  ADD CONSTRAINT venture_capabilities_origin_venture_id_fkey
  FOREIGN KEY (origin_venture_id) REFERENCES ventures(id) ON DELETE SET NULL;

-- venture_templates.source_venture_id: was NO ACTION, should be SET NULL
ALTER TABLE venture_templates DROP CONSTRAINT IF EXISTS venture_templates_source_venture_id_fkey;
ALTER TABLE venture_templates
  ADD CONSTRAINT venture_templates_source_venture_id_fkey
  FOREIGN KEY (source_venture_id) REFERENCES ventures(id) ON DELETE SET NULL;

-- agent_registry: was CASCADE, should be SET NULL
ALTER TABLE agent_registry DROP CONSTRAINT IF EXISTS agent_registry_venture_id_fkey;
ALTER TABLE agent_registry
  ADD CONSTRAINT agent_registry_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE SET NULL;


-- =============================================================================
-- SECTION 3: CASCADE policy — Child data tables
-- These tables are deleted when the parent venture is deleted.
-- =============================================================================

-- eva_actions: was SET NULL, should be CASCADE
ALTER TABLE eva_actions DROP CONSTRAINT IF EXISTS eva_actions_venture_id_fkey;
ALTER TABLE eva_actions
  ADD CONSTRAINT eva_actions_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- eva_architecture_plans: was SET NULL, should be CASCADE
ALTER TABLE eva_architecture_plans DROP CONSTRAINT IF EXISTS eva_architecture_plans_venture_id_fkey;
ALTER TABLE eva_architecture_plans
  ADD CONSTRAINT eva_architecture_plans_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- eva_interactions: was SET NULL, should be CASCADE
ALTER TABLE eva_interactions DROP CONSTRAINT IF EXISTS eva_interactions_venture_id_fkey;
ALTER TABLE eva_interactions
  ADD CONSTRAINT eva_interactions_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- eva_orchestration_events: was SET NULL, should be CASCADE
ALTER TABLE eva_orchestration_events DROP CONSTRAINT IF EXISTS eva_orchestration_events_venture_id_fkey;
ALTER TABLE eva_orchestration_events
  ADD CONSTRAINT eva_orchestration_events_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- eva_saga_log: was NO ACTION, should be CASCADE
ALTER TABLE eva_saga_log DROP CONSTRAINT IF EXISTS eva_saga_log_venture_id_fkey;
ALTER TABLE eva_saga_log
  ADD CONSTRAINT eva_saga_log_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- eva_trace_log: was NO ACTION, should be CASCADE
ALTER TABLE eva_trace_log DROP CONSTRAINT IF EXISTS eva_trace_log_venture_id_fkey;
ALTER TABLE eva_trace_log
  ADD CONSTRAINT eva_trace_log_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- eva_vision_documents: was SET NULL, should be CASCADE
ALTER TABLE eva_vision_documents DROP CONSTRAINT IF EXISTS eva_vision_documents_venture_id_fkey;
ALTER TABLE eva_vision_documents
  ADD CONSTRAINT eva_vision_documents_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- financial_models: has duplicate FK "fk_venture" (NO ACTION) alongside correct
-- "financial_models_venture_id_fkey" (CASCADE). Drop the stale duplicate.
ALTER TABLE financial_models DROP CONSTRAINT IF EXISTS fk_venture;

-- stage_zero_requests: was SET NULL, should be CASCADE
ALTER TABLE stage_zero_requests DROP CONSTRAINT IF EXISTS stage_zero_requests_venture_id_fkey;
ALTER TABLE stage_zero_requests
  ADD CONSTRAINT stage_zero_requests_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- venture_stage_work: was NO ACTION, should be CASCADE
ALTER TABLE venture_stage_work DROP CONSTRAINT IF EXISTS venture_stage_work_venture_id_fkey;
ALTER TABLE venture_stage_work
  ADD CONSTRAINT venture_stage_work_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- venture_artifacts: was NO ACTION, should be CASCADE
ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_venture_id_fkey;
ALTER TABLE venture_artifacts
  ADD CONSTRAINT venture_artifacts_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- venture_briefs: was SET NULL, should be CASCADE
ALTER TABLE venture_briefs DROP CONSTRAINT IF EXISTS venture_briefs_venture_id_fkey;
ALTER TABLE venture_briefs
  ADD CONSTRAINT venture_briefs_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- missions: was NO ACTION, should be CASCADE
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_venture_id_fkey;
ALTER TABLE missions
  ADD CONSTRAINT missions_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- modeling_requests: was SET NULL, should be CASCADE
ALTER TABLE modeling_requests DROP CONSTRAINT IF EXISTS modeling_requests_venture_id_fkey;
ALTER TABLE modeling_requests
  ADD CONSTRAINT modeling_requests_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- monthly_ceo_reports: was NO ACTION, should be CASCADE
ALTER TABLE monthly_ceo_reports DROP CONSTRAINT IF EXISTS monthly_ceo_reports_venture_id_fkey;
ALTER TABLE monthly_ceo_reports
  ADD CONSTRAINT monthly_ceo_reports_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- orchestration_metrics: was SET NULL, should be CASCADE
ALTER TABLE orchestration_metrics DROP CONSTRAINT IF EXISTS orchestration_metrics_venture_id_fkey;
ALTER TABLE orchestration_metrics
  ADD CONSTRAINT orchestration_metrics_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- tool_usage_ledger: was SET NULL, should be CASCADE
ALTER TABLE tool_usage_ledger DROP CONSTRAINT IF EXISTS tool_usage_ledger_venture_id_fkey;
ALTER TABLE tool_usage_ledger
  ADD CONSTRAINT tool_usage_ledger_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;


-- =============================================================================
-- SECTION 4: Missing FK — stage_events
-- Table has venture_id (UUID, NOT NULL) but no FK constraint.
-- NOTE: stage_events is NOT in the FK registry — should be added.
-- =============================================================================

-- stage_events: missing FK, adding as CASCADE (child data table)
ALTER TABLE stage_events
  ADD CONSTRAINT stage_events_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;


COMMIT;

-- =============================================================================
-- ROLLBACK (manual reference — run these statements to reverse this migration):
--
-- For each altered constraint, reverse the DROP/ADD with the original policy.
-- For financial_models, re-add: ALTER TABLE financial_models ADD CONSTRAINT
--   fk_venture FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE NO ACTION;
-- For stage_events, drop: ALTER TABLE stage_events DROP CONSTRAINT
--   stage_events_venture_id_fkey;
-- =============================================================================
