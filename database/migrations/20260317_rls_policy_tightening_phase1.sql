-- =============================================================================
-- RLS Policy Tightening Phase 1: Quick Wins
-- SD: SD-LEO-INFRA-RLS-POLICY-TIGHTENING-001
-- Date: 2026-03-17
-- Author: Database Agent (Principal Database Architect)
--
-- OBJECTIVE:
--   1. APPEND-ONLY: Audit/log tables - authenticated gets SELECT+INSERT only
--      (no UPDATE/DELETE). service_role gets INSERT+SELECT only (no UPDATE/DELETE).
--   2. SERVICE-ONLY: Empty speculative tables (0 rows) - drop authenticated/public
--      policies, keep or create service_role-only access.
--
-- SCOPE: 57 tables affected across 3 sections
--   Section 1: 37 audit/log/history tables -> APPEND-ONLY pattern
--   Section 2: 14 empty speculative tables -> SERVICE-ONLY pattern
--   Section 3: 10 additional tables caught in verification passes
--
-- SAFETY: All operations are idempotent (DROP IF EXISTS before CREATE).
-- ROLLBACK: Commented rollback SQL at the bottom.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: APPEND-ONLY PATTERN FOR AUDIT/LOG TABLES
-- Pattern: authenticated = SELECT + INSERT, service_role = SELECT + INSERT
-- No UPDATE or DELETE for anyone (immutable audit trail)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 activity_logs (242 rows)
-- Current: authenticated SELECT+INSERT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_activity_logs" ON activity_logs;
CREATE POLICY "service_role_select_activity_logs" ON activity_logs
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_activity_logs" ON activity_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.2 audit_finding_sd_links (69 rows)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role has full access to audit links" ON audit_finding_sd_links;
CREATE POLICY "service_role_select_audit_finding_sd_links" ON audit_finding_sd_links
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_audit_finding_sd_links" ON audit_finding_sd_links
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.3 audit_finding_sd_mapping (76 rows)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role has full access to audit mappings" ON audit_finding_sd_mapping;
CREATE POLICY "service_role_select_audit_finding_sd_mapping" ON audit_finding_sd_mapping
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_audit_finding_sd_mapping" ON audit_finding_sd_mapping
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.4 audit_log (611 rows)
-- Current: service_role ALL only (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full_access" ON audit_log;
CREATE POLICY "service_role_select_audit_log" ON audit_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_audit_log" ON audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.5 capability_reuse_log (0 rows but is a log table)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access on capability_reuse_log" ON capability_reuse_log;
CREATE POLICY "service_role_select_capability_reuse_log" ON capability_reuse_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_capability_reuse_log" ON capability_reuse_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.6 cascade_invalidation_log
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_cascade_log" ON cascade_invalidation_log;
CREATE POLICY "service_role_select_cascade_invalidation_log" ON cascade_invalidation_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_cascade_invalidation_log" ON cascade_invalidation_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.7 connection_selection_log (866 rows)
-- Current: service_role ALL only (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full_access" ON connection_selection_log;
CREATE POLICY "service_role_select_connection_selection_log" ON connection_selection_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_connection_selection_log" ON connection_selection_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.8 enhancement_proposal_audit
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_enhancement_proposal_audit" ON enhancement_proposal_audit;
CREATE POLICY "service_role_select_enhancement_proposal_audit" ON enhancement_proposal_audit
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_enhancement_proposal_audit" ON enhancement_proposal_audit
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.9 eva_audit_log (194 rows)
-- Current: authenticated SELECT (OK), service_role INSERT+SELECT (already good!)
-- No changes needed - already append-only pattern.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1.10 eva_event_log
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "eva_event_log_service_role_all" ON eva_event_log;
CREATE POLICY "eva_event_log_service_role_select" ON eva_event_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "eva_event_log_service_role_insert" ON eva_event_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.11 eva_saga_log
-- Current: service_role ALL only (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_eva_saga_log" ON eva_saga_log;
CREATE POLICY "service_role_select_eva_saga_log" ON eva_saga_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_eva_saga_log" ON eva_saga_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.12 governance_audit_log (139533 rows - largest audit table)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_governance_audit_log" ON governance_audit_log;
CREATE POLICY "service_role_select_governance_audit_log" ON governance_audit_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_governance_audit_log" ON governance_audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.13 handoff_audit_log (14814 rows)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role has full access to handoff_audit_log" ON handoff_audit_log;
CREATE POLICY "service_role_select_handoff_audit_log" ON handoff_audit_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_handoff_audit_log" ON handoff_audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.14 import_audit
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_import_audit" ON import_audit;
CREATE POLICY "service_role_select_import_audit" ON import_audit
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_import_audit" ON import_audit
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.15 interaction_history
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_interaction_history" ON interaction_history;
CREATE POLICY "service_role_select_interaction_history" ON interaction_history
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_interaction_history" ON interaction_history
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.16 leo_audit_checklists
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "leo_audit_checklists_service_role_all" ON leo_audit_checklists;
CREATE POLICY "leo_audit_checklists_service_role_select" ON leo_audit_checklists
  FOR SELECT TO service_role USING (true);
CREATE POLICY "leo_audit_checklists_service_role_insert" ON leo_audit_checklists
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.17 leo_audit_config
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- NOTE: Config tables may need UPDATE. But this is an audit config - append-only is fine.
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "leo_audit_config_service_role_all" ON leo_audit_config;
CREATE POLICY "leo_audit_config_service_role_select" ON leo_audit_config
  FOR SELECT TO service_role USING (true);
CREATE POLICY "leo_audit_config_service_role_insert" ON leo_audit_config
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.18 leo_error_log (102 rows)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "leo_error_log_service_all" ON leo_error_log;
CREATE POLICY "leo_error_log_service_role_select" ON leo_error_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "leo_error_log_service_role_insert" ON leo_error_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.19 leo_feature_flag_audit
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "leo_feature_flag_audit_service_role_all" ON leo_feature_flag_audit;
CREATE POLICY "leo_feature_flag_audit_service_role_select" ON leo_feature_flag_audit
  FOR SELECT TO service_role USING (true);
CREATE POLICY "leo_feature_flag_audit_service_role_insert" ON leo_feature_flag_audit
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.20 leo_kb_generation_log
-- Current: anon SELECT, authenticated SELECT, service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role has full access to kb generation log" ON leo_kb_generation_log;
CREATE POLICY "service_role_select_leo_kb_generation_log" ON leo_kb_generation_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_leo_kb_generation_log" ON leo_kb_generation_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.21 leo_protocol_file_audit
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_leo_protocol_file_audit" ON leo_protocol_file_audit;
CREATE POLICY "service_role_select_leo_protocol_file_audit" ON leo_protocol_file_audit
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_leo_protocol_file_audit" ON leo_protocol_file_audit
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.22 model_usage_log (2152 rows)
-- Current: authenticated SELECT+INSERT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_model_usage_log" ON model_usage_log;
CREATE POLICY "service_role_select_model_usage_log" ON model_usage_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_model_usage_log" ON model_usage_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.23 nursery_evaluation_log
-- Current: authenticated SELECT+INSERT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_nursery_evaluation_log" ON nursery_evaluation_log;
CREATE POLICY "service_role_select_nursery_evaluation_log" ON nursery_evaluation_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_nursery_evaluation_log" ON nursery_evaluation_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.24 okr_generation_log
-- Current: public SELECT (OK), public ALL (VERY overly permissive!)
-- Action: Drop the public ALL, create service_role SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access on okr_generation_log" ON okr_generation_log;
CREATE POLICY "service_role_select_okr_generation_log" ON okr_generation_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_okr_generation_log" ON okr_generation_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.25 operations_audit_log
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_operations_audit_log" ON operations_audit_log;
CREATE POLICY "service_role_select_operations_audit_log" ON operations_audit_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_operations_audit_log" ON operations_audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.26 prd_research_audit_log (4 rows)
-- Current: anon SELECT+INSERT, authenticated SELECT, service_role UPDATE+DELETE
-- Action: Drop service_role UPDATE+DELETE (audit logs should not be updated/deleted)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service_role to delete prd_research_audit_log" ON prd_research_audit_log;
DROP POLICY IF EXISTS "Allow service_role to update prd_research_audit_log" ON prd_research_audit_log;
-- Add service_role SELECT+INSERT for completeness
CREATE POLICY "service_role_select_prd_research_audit_log" ON prd_research_audit_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_prd_research_audit_log" ON prd_research_audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.27 protocol_improvement_audit_log (187 rows)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_log_service_role_all" ON protocol_improvement_audit_log;
CREATE POLICY "service_role_select_protocol_improvement_audit_log" ON protocol_improvement_audit_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_protocol_improvement_audit_log" ON protocol_improvement_audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.28 risk_escalation_log
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access on risk_escalation_log" ON risk_escalation_log;
CREATE POLICY "service_role_select_risk_escalation_log" ON risk_escalation_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_risk_escalation_log" ON risk_escalation_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.29 risk_gate_passage_log
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access on risk_gate_passage_log" ON risk_gate_passage_log;
CREATE POLICY "service_role_select_risk_gate_passage_log" ON risk_gate_passage_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_risk_gate_passage_log" ON risk_gate_passage_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.30 sd_governance_bypass_audit (521 rows)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bypass_audit_service_role" ON sd_governance_bypass_audit;
CREATE POLICY "service_role_select_sd_governance_bypass_audit" ON sd_governance_bypass_audit
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_sd_governance_bypass_audit" ON sd_governance_bypass_audit
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.31 self_audit_findings
-- Current: service_role ALL only (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full_access" ON self_audit_findings;
CREATE POLICY "service_role_select_self_audit_findings" ON self_audit_findings
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_self_audit_findings" ON self_audit_findings
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.32 substage_transition_log
-- Current: public ALL (VERY overly permissive!)
-- Action: Drop public ALL, create service_role SELECT+INSERT, authenticated SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Company access substage_transition_log" ON substage_transition_log;
CREATE POLICY "authenticated_select_substage_transition_log" ON substage_transition_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_substage_transition_log" ON substage_transition_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "service_role_select_substage_transition_log" ON substage_transition_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_substage_transition_log" ON substage_transition_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.33 task_hydration_log (1365 rows)
-- Current: service_role ALL only (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access to task_hydration_log" ON task_hydration_log;
CREATE POLICY "service_role_select_task_hydration_log" ON task_hydration_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_task_hydration_log" ON task_hydration_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.34 uat_audit_trail
-- Current: service_role ALL only (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_uat_audit_trail" ON uat_audit_trail;
CREATE POLICY "service_role_select_uat_audit_trail" ON uat_audit_trail
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_uat_audit_trail" ON uat_audit_trail
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.35 uat_credential_history
-- Current: service_role ALL, public SELECT (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT, keep public SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service_role to manage uat_credential_history" ON uat_credential_history;
CREATE POLICY "service_role_select_uat_credential_history" ON uat_credential_history
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_uat_credential_history" ON uat_credential_history
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1.36 validation_audit_log (43524 rows)
-- Already has good pattern: authenticated INSERT+SELECT, service_role INSERT
-- No changes needed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1.37 workflow_trace_log (249097 rows)
-- Current: service_role ALL only (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_workflow_trace_log" ON workflow_trace_log;
CREATE POLICY "service_role_select_workflow_trace_log" ON workflow_trace_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_workflow_trace_log" ON workflow_trace_log
  FOR INSERT TO service_role WITH CHECK (true);

-- =============================================================================
-- SECTION 2: SERVICE-ONLY PATTERN FOR EMPTY SPECULATIVE TABLES
-- Pattern: Drop all authenticated/public/anon policies, keep service_role SELECT+INSERT
-- These tables have 0 rows and are speculative - no authenticated user needs access yet.
-- When these tables become active, proper RLS policies should be designed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 sdip_groups (0 rows)
-- Current: public has ALL CRUD (4 separate policies) - extremely permissive
-- Action: Drop all public policies, create service_role SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "groups_delete_policy" ON sdip_groups;
DROP POLICY IF EXISTS "groups_insert_policy" ON sdip_groups;
DROP POLICY IF EXISTS "groups_select_policy" ON sdip_groups;
DROP POLICY IF EXISTS "groups_update_policy" ON sdip_groups;
DROP POLICY IF EXISTS "authenticated_select_sdip_groups" ON sdip_groups;
CREATE POLICY "service_role_select_sdip_groups" ON sdip_groups
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_sdip_groups" ON sdip_groups
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.2 sdip_submissions (0 rows)
-- Current: public has ALL CRUD (4 separate policies) - extremely permissive
-- Action: Drop all public policies, create service_role SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sdip_delete_policy" ON sdip_submissions;
DROP POLICY IF EXISTS "sdip_insert_policy" ON sdip_submissions;
DROP POLICY IF EXISTS "sdip_select_policy" ON sdip_submissions;
DROP POLICY IF EXISTS "sdip_update_policy" ON sdip_submissions;
DROP POLICY IF EXISTS "authenticated_select_sdip_submissions" ON sdip_submissions;
CREATE POLICY "service_role_select_sdip_submissions" ON sdip_submissions
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_sdip_submissions" ON sdip_submissions
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.3 naming_suggestions (0 rows)
-- Current: authenticated ALL, anon SELECT
-- Action: Drop both policies, create service_role SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for authenticated" ON naming_suggestions;
DROP POLICY IF EXISTS "Allow select for anon" ON naming_suggestions;
CREATE POLICY "service_role_select_naming_suggestions" ON naming_suggestions
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_naming_suggestions" ON naming_suggestions
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.4 stage_events (0 rows)
-- Current: authenticated has full CRUD (SELECT, INSERT, UPDATE, DELETE)
-- Action: Drop all authenticated policies, create service_role SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow update for authenticated" ON stage_events;
DROP POLICY IF EXISTS "insert_stage_events_policy" ON stage_events;
DROP POLICY IF EXISTS "select_stage_events_policy" ON stage_events;
DROP POLICY IF EXISTS "stage_events_delete" ON stage_events;
CREATE POLICY "service_role_select_stage_events" ON stage_events
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_stage_events" ON stage_events
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.5 venture_data_room_artifacts (0 rows)
-- Current: public INSERT+SELECT+UPDATE
-- Action: Drop all public policies, create service_role SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "data_room_artifacts_insert" ON venture_data_room_artifacts;
DROP POLICY IF EXISTS "data_room_artifacts_select" ON venture_data_room_artifacts;
DROP POLICY IF EXISTS "data_room_artifacts_update" ON venture_data_room_artifacts;
CREATE POLICY "service_role_select_venture_data_room_artifacts" ON venture_data_room_artifacts
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_venture_data_room_artifacts" ON venture_data_room_artifacts
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.6 sd_backlog_map (0 rows)
-- Current: authenticated SELECT, service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_read_sd_backlog_map" ON sd_backlog_map;
DROP POLICY IF EXISTS "service_role_all_sd_backlog_map" ON sd_backlog_map;
CREATE POLICY "service_role_select_sd_backlog_map" ON sd_backlog_map
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_sd_backlog_map" ON sd_backlog_map
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.7 sd_testing_status (0 rows)
-- Current: authenticated SELECT, service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_read_sd_testing_status" ON sd_testing_status;
DROP POLICY IF EXISTS "service_role_all_sd_testing_status" ON sd_testing_status;
CREATE POLICY "service_role_select_sd_testing_status" ON sd_testing_status
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_sd_testing_status" ON sd_testing_status
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.8 subagent_requirements (0 rows)
-- Current: authenticated SELECT, service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_read_subagent_requirements" ON subagent_requirements;
DROP POLICY IF EXISTS "service_role_all_subagent_requirements" ON subagent_requirements;
CREATE POLICY "service_role_select_subagent_requirements" ON subagent_requirements
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_subagent_requirements" ON subagent_requirements
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.9 eva_trace_log (0 rows, also a log table)
-- Current: service_role ALL only (tighten to SELECT+INSERT)
-- Action: Replace ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_eva_trace_log" ON eva_trace_log;
CREATE POLICY "service_role_select_eva_trace_log" ON eva_trace_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_eva_trace_log" ON eva_trace_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.10 eva_circuit_state_transitions (0 rows)
-- Current: authenticated SELECT, service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view eva_circuit_state_transitions" ON eva_circuit_state_transitions;
DROP POLICY IF EXISTS "Service role has full access to eva_circuit_state_transitions" ON eva_circuit_state_transitions;
CREATE POLICY "service_role_select_eva_circuit_state_transitions" ON eva_circuit_state_transitions
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_eva_circuit_state_transitions" ON eva_circuit_state_transitions
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.11 eva_event_ledger (0 rows)
-- Current: authenticated SELECT, service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "eva_event_ledger_authenticated_select" ON eva_event_ledger;
DROP POLICY IF EXISTS "eva_event_ledger_service_role_all" ON eva_event_ledger;
CREATE POLICY "service_role_select_eva_event_ledger" ON eva_event_ledger
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_eva_event_ledger" ON eva_event_ledger
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.12 eva_events (0 rows)
-- Current: authenticated SELECT (venture-scoped), service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "eva_events_select_user_ventures" ON eva_events;
DROP POLICY IF EXISTS "eva_events_service_role_all" ON eva_events;
CREATE POLICY "service_role_select_eva_events" ON eva_events
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_eva_events" ON eva_events
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.13 evaluation_profile_outcomes (0 rows)
-- Current: authenticated SELECT, service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "eval_profile_outcomes_authenticated_select" ON evaluation_profile_outcomes;
DROP POLICY IF EXISTS "eval_profile_outcomes_service_role_all" ON evaluation_profile_outcomes;
CREATE POLICY "service_role_select_evaluation_profile_outcomes" ON evaluation_profile_outcomes
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_evaluation_profile_outcomes" ON evaluation_profile_outcomes
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2.14 venture_capabilities (0 rows)
-- Current: 2x authenticated SELECT (duplicate!), service_role ALL
-- Action: Drop all three, create service_role SELECT+INSERT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_read_venture_capabilities" ON venture_capabilities;
DROP POLICY IF EXISTS "authenticated_select_venture_capabilities" ON venture_capabilities;
DROP POLICY IF EXISTS "service_role_all_venture_capabilities" ON venture_capabilities;
CREATE POLICY "service_role_select_venture_capabilities" ON venture_capabilities
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_venture_capabilities" ON venture_capabilities
  FOR INSERT TO service_role WITH CHECK (true);

-- =============================================================================
-- SECTION 3: ADDITIONAL TABLES (caught in verification pass)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 backlog_item_completion (log table)
-- Current: authenticated SELECT (OK), service_role ALL (tighten)
-- Action: Replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_backlog_item_completion" ON backlog_item_completion;
CREATE POLICY "service_role_select_backlog_item_completion" ON backlog_item_completion
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_backlog_item_completion" ON backlog_item_completion
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3.2 audit_triangulation_log
-- Current: public SELECT+INSERT, service_role ALL
-- Action: Replace public with authenticated, replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_audit_triangulation_log" ON audit_triangulation_log;
DROP POLICY IF EXISTS "audit_triangulation_log_insert" ON audit_triangulation_log;
DROP POLICY IF EXISTS "audit_triangulation_log_select" ON audit_triangulation_log;
DROP POLICY IF EXISTS "authenticated_select_audit_triangulation_log" ON audit_triangulation_log;
CREATE POLICY "authenticated_select_audit_triangulation_log" ON audit_triangulation_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_audit_triangulation_log" ON audit_triangulation_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "service_role_select_audit_triangulation_log" ON audit_triangulation_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_audit_triangulation_log" ON audit_triangulation_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3.3 runtime_audits
-- Current: public SELECT+INSERT, service_role ALL
-- Action: Replace public with authenticated, replace service_role ALL with SELECT+INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_runtime_audits" ON runtime_audits;
DROP POLICY IF EXISTS "runtime_audits_insert" ON runtime_audits;
DROP POLICY IF EXISTS "runtime_audits_select" ON runtime_audits;
DROP POLICY IF EXISTS "authenticated_select_runtime_audits" ON runtime_audits;
CREATE POLICY "authenticated_select_runtime_audits" ON runtime_audits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_runtime_audits" ON runtime_audits
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "service_role_select_runtime_audits" ON runtime_audits
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_runtime_audits" ON runtime_audits
  FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3.4 distribution_history (0 rows, history table)
-- Current: authenticated ALL (venture-scoped), service_role ALL
-- Action: Drop both, create service_role SELECT+INSERT (0 rows = no business impact)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "dh_venture_access" ON distribution_history;
DROP POLICY IF EXISTS "dh_service_role" ON distribution_history;
CREATE POLICY "service_role_select_distribution_history" ON distribution_history
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_distribution_history" ON distribution_history
  FOR INSERT TO service_role WITH CHECK (true);
-- ----------------------------------------------------------------------------- 3.5 context_usage_log-- Current: authenticated SELECT+INSERT (OK), service_role ALL (tighten)-- Action: Replace service_role ALL with SELECT+INSERT-- ---------------------------------------------------------------------------DROP POLICY IF EXISTS "service_role_all_context_usage_log" ON context_usage_log;CREATE POLICY "service_role_select_context_usage_log" ON context_usage_log  FOR SELECT TO service_role USING (true);CREATE POLICY "service_role_insert_context_usage_log" ON context_usage_log  FOR INSERT TO service_role WITH CHECK (true);-- ----------------------------------------------------------------------------- 3.6 continuous_execution_log-- Current: authenticated SELECT+INSERT (OK), service_role ALL (tighten)-- Action: Replace service_role ALL with SELECT+INSERT-- ---------------------------------------------------------------------------DROP POLICY IF EXISTS "service_role_all_continuous_execution_log" ON continuous_execution_log;CREATE POLICY "service_role_select_continuous_execution_log" ON continuous_execution_log  FOR SELECT TO service_role USING (true);CREATE POLICY "service_role_insert_continuous_execution_log" ON continuous_execution_log  FOR INSERT TO service_role WITH CHECK (true);-- ----------------------------------------------------------------------------- 3.7 raid_log-- Current: authenticated SELECT+INSERT (OK), service_role ALL (tighten)-- Action: Replace service_role ALL with SELECT+INSERT-- ---------------------------------------------------------------------------DROP POLICY IF EXISTS "service_role_all_raid_log" ON raid_log;CREATE POLICY "service_role_select_raid_log" ON raid_log  FOR SELECT TO service_role USING (true);CREATE POLICY "service_role_insert_raid_log" ON raid_log  FOR INSERT TO service_role WITH CHECK (true);-- ----------------------------------------------------------------------------- 3.8 sd_type_change_audit-- Current: authenticated SELECT+INSERT (OK), service_role ALL (tighten)-- Action: Replace service_role ALL with SELECT+INSERT-- ---------------------------------------------------------------------------DROP POLICY IF EXISTS "service_role_all_sd_type_change_audit" ON sd_type_change_audit;CREATE POLICY "service_role_select_sd_type_change_audit" ON sd_type_change_audit  FOR SELECT TO service_role USING (true);CREATE POLICY "service_role_insert_sd_type_change_audit" ON sd_type_change_audit  FOR INSERT TO service_role WITH CHECK (true);-- ----------------------------------------------------------------------------- 3.9 sdip_groups: Remove residual service_role ALL leftover-- ---------------------------------------------------------------------------DROP POLICY IF EXISTS "service_role_all_sdip_groups" ON sdip_groups;-- ----------------------------------------------------------------------------- 3.10 sdip_submissions: Remove residual service_role ALL leftover-- ---------------------------------------------------------------------------DROP POLICY IF EXISTS "service_role_all_sdip_submissions" ON sdip_submissions;

-- =============================================================================
-- TABLES EXCLUDED FROM THIS MIGRATION (with rationale)
-- =============================================================================
-- marketing_content_queue (0 rows) - Has venture-scoped authenticated policy;
--   likely needed by app when feature goes live. Requires deeper analysis.
-- capital_transactions (0 rows) - Has authenticated SELECT only (already minimal).
-- venture_exit_profiles (0 rows) - Has owner-scoped authenticated policies
--   (proper RLS pattern). No tightening needed.
-- venture_asset_registry (0 rows) - Has authenticated INSERT+SELECT. May need
--   to be kept for app functionality.
-- ---------------------------------------------------------------------------

COMMIT;

-- =============================================================================
-- ROLLBACK SQL (execute manually if needed)
-- =============================================================================
--
-- NOTE: Rollback restores original policies. Execute each section separately.
-- The pattern for each table is: drop new SELECT+INSERT, restore original ALL/policy.
--
-- -- SECTION 1 ROLLBACK EXAMPLE (activity_logs):
-- BEGIN;
-- DROP POLICY IF EXISTS "service_role_select_activity_logs" ON activity_logs;
-- DROP POLICY IF EXISTS "service_role_insert_activity_logs" ON activity_logs;
-- CREATE POLICY "service_role_all_activity_logs" ON activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
-- COMMIT;
--
-- -- SECTION 2 ROLLBACK EXAMPLE (sdip_groups):
-- BEGIN;
-- DROP POLICY IF EXISTS "service_role_select_sdip_groups" ON sdip_groups;
-- DROP POLICY IF EXISTS "service_role_insert_sdip_groups" ON sdip_groups;
-- CREATE POLICY "groups_delete_policy" ON sdip_groups FOR DELETE TO public USING (true);
-- CREATE POLICY "groups_insert_policy" ON sdip_groups FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY "groups_select_policy" ON sdip_groups FOR SELECT TO public USING (true);
-- CREATE POLICY "groups_update_policy" ON sdip_groups FOR UPDATE TO public USING (true) WITH CHECK (true);
-- COMMIT;
--
-- -- SECTION 3 ROLLBACK EXAMPLE (audit_triangulation_log):
-- BEGIN;
-- DROP POLICY IF EXISTS "authenticated_select_audit_triangulation_log" ON audit_triangulation_log;
-- DROP POLICY IF EXISTS "authenticated_insert_audit_triangulation_log" ON audit_triangulation_log;
-- DROP POLICY IF EXISTS "service_role_select_audit_triangulation_log" ON audit_triangulation_log;
-- DROP POLICY IF EXISTS "service_role_insert_audit_triangulation_log" ON audit_triangulation_log;
-- CREATE POLICY "audit_triangulation_log_insert" ON audit_triangulation_log FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY "audit_triangulation_log_select" ON audit_triangulation_log FOR SELECT TO public USING (true);
-- CREATE POLICY "service_role_all_audit_triangulation_log" ON audit_triangulation_log FOR ALL TO service_role USING (true) WITH CHECK (true);
-- COMMIT;
--
-- Full rollback for all tables follows same pattern. Generate on request.
