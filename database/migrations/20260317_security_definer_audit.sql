-- =============================================================================
-- SECURITY DEFINER AUDIT MIGRATION
-- SD: SD-LEO-FIX-DATABASE-SECURITY-DEFINER-001
-- Date: 2026-03-17
-- Author: Database Security Agent
--
-- AUDIT SUMMARY:
--   Total SECURITY DEFINER functions found: 137
--   Functions missing search_path: 102 (VULNERABILITY)
--   Functions converted to SECURITY INVOKER: 47
--   Functions retained as SECURITY DEFINER with hardening: 90
--   Critical vulnerability fixed (exec_sql): 1
--
-- CLASSIFICATION CRITERIA:
--   KEEP DEFINER: RLS policy helpers, trigger functions needing RLS bypass,
--                 cross-schema validators, admin RPCs, auth-dependent functions
--   CONVERT TO INVOKER: Pure read functions, calculation utilities,
--                       validation helpers that don't need elevated privileges
--
-- ROLLBACK: See bottom of file for rollback SQL
-- =============================================================================

BEGIN;

-- =============================================================================
-- PHASE 1: CRITICAL SECURITY FIX - exec_sql
-- This function accepts ARBITRARY SQL with SECURITY DEFINER and NO validation.
-- This is an SQL injection vector of the highest severity.
-- =============================================================================

COMMENT ON FUNCTION public.exec_sql(sql_text text) IS
  'DEPRECATED: SECURITY HAZARD - Was SECURITY DEFINER with arbitrary SQL execution. '
  'Replaced with SECURITY INVOKER version that only allows SELECT/WITH queries. '
  'Migration: 20260317_security_definer_audit.sql';

CREATE OR REPLACE FUNCTION public.exec_sql(sql_text text)
 RETURNS TABLE(result jsonb)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  results JSONB := '[]'::jsonb;
  v_normalized TEXT;
BEGIN
  -- Normalize and validate: only allow SELECT statements
  v_normalized := btrim(upper(sql_text));

  IF v_normalized NOT LIKE 'SELECT%' AND v_normalized NOT LIKE 'WITH%' THEN
    RAISE EXCEPTION 'exec_sql only allows SELECT/WITH queries. Use specific RPC functions for mutations.'
      USING ERRCODE = '42501';
  END IF;

  -- Block dangerous patterns even in SELECT
  IF v_normalized LIKE '%INSERT%INTO%'
     OR v_normalized LIKE '%UPDATE %SET%'
     OR v_normalized LIKE '%DELETE%FROM%'
     OR v_normalized LIKE '%DROP %'
     OR v_normalized LIKE '%ALTER %'
     OR v_normalized LIKE '%TRUNCATE%'
     OR v_normalized LIKE '%CREATE %'
     OR v_normalized LIKE '%GRANT %'
     OR v_normalized LIKE '%REVOKE %' THEN
    RAISE EXCEPTION 'exec_sql detected potentially dangerous SQL keywords. Use specific RPC functions for mutations.'
      USING ERRCODE = '42501';
  END IF;

  FOR rec IN EXECUTE sql_text LOOP
    results := results || to_jsonb(rec);
  END LOOP;

  RETURN QUERY SELECT results;
END;
$function$;

-- =============================================================================
-- PHASE 2: CONVERT PURE READ FUNCTIONS TO SECURITY INVOKER
-- These functions only SELECT data and don't need elevated privileges.
-- =============================================================================

-- 2a. Read-only risk/validation/check functions
ALTER FUNCTION public.assess_sd_type_change_risk(p_sd_id character varying, p_from_type character varying, p_to_type character varying) SECURITY INVOKER;
ALTER FUNCTION public.check_experiment_convergence(p_experiment_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.check_human_verification_gate(p_sd_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.check_stage13_1_to_2_criteria(p_venture_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.check_stage13_2_to_3_criteria(p_venture_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.compare_baseline_versions(p_baseline_id_from uuid, p_baseline_id_to uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_check_risk_escalation_triggers(p_risk_form_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_evaluate_risk_recalibration_gate(p_venture_id uuid, p_gate_number integer) SECURITY INVOKER;
ALTER FUNCTION public.fn_validate_crew_kickoff(p_flow_id uuid, p_venture_id uuid, p_prd_id uuid, p_sd_id character varying) SECURITY INVOKER;

-- 2b. Read-only getter functions
ALTER FUNCTION public.get_chairman_settings(p_company_id uuid, p_venture_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_conversation_messages(p_conversation_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_daily_briefing() SECURITY INVOKER;
ALTER FUNCTION public.get_department_agents(p_department_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_discovery_strategy_scores() SECURITY INVOKER;
ALTER FUNCTION public.get_effective_capabilities(p_agent_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_eva_conversations(p_user_id uuid, p_limit integer, p_offset integer) SECURITY INVOKER;
ALTER FUNCTION public.get_leo_global_defaults() SECURITY INVOKER;
ALTER FUNCTION public.get_oiv_contracts_for_sd_type(p_sd_type text) SECURITY INVOKER;
ALTER FUNCTION public.get_oiv_run_summary(p_run_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_okr_metrics() SECURITY INVOKER;
ALTER FUNCTION public.get_portfolio_summary() SECURITY INVOKER;
ALTER FUNCTION public.get_recent_errors(p_limit integer, p_severity text, p_status text) SECURITY INVOKER;
ALTER FUNCTION public.get_table_schema(table_name text) SECURITY INVOKER;
ALTER FUNCTION public.get_venture_stage_summary(p_venture_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_venture_token_balance(p_venture_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_voice_usage_stats(p_user_id uuid, p_period interval) SECURITY INVOKER;
ALTER FUNCTION public.get_content_queue_summary(p_venture_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_gate_decision_status(p_venture_id uuid, p_stage integer) SECURITY INVOKER;

-- 2c. Pure computation / boolean functions
ALTER FUNCTION public.is_type_upgrade(p_from_type character varying, p_to_type character varying) SECURITY INVOKER;
ALTER FUNCTION public.is_valid_automation_bypass(p_governance_metadata jsonb, p_trigger_name character varying) SECURITY INVOKER;
ALTER FUNCTION public.generate_utm_params(p_venture_id uuid, p_channel_id uuid, p_campaign character varying) SECURITY INVOKER;

-- 2d. Vector search (caller needs SELECT on agent_memory)
ALTER FUNCTION public.match_agent_memory(p_query_embedding vector, p_venture_id uuid, p_agent_id uuid, p_memory_type character varying, p_match_threshold double precision, p_match_count integer) SECURITY INVOKER;

-- 2e. Read-only debug/progress functions
ALTER FUNCTION public.debug_sd_progress(sd_id_param text) SECURITY INVOKER;
ALTER FUNCTION public.check_progress_requirements(sd_id_param text) SECURITY INVOKER;
ALTER FUNCTION public.is_orchestrator_sd(sd_id_param text) SECURITY INVOKER;
ALTER FUNCTION public.orchestrator_children_complete(sd_id_param text) SECURITY INVOKER;
ALTER FUNCTION public.retry_orchestrator_auto_complete(sd_id_param character varying) SECURITY INVOKER;

-- 2f. Read-only validation functions
ALTER FUNCTION public.validate_financial_consistency(p_venture_id uuid, p_stage_number integer, p_proposed_data jsonb) SECURITY INVOKER;
ALTER FUNCTION public.validate_sd_workflow_template(p_template_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.verify_deliverables_before_handoff() SECURITY INVOKER;

-- 2g. Trigger functions that only read, not write
ALTER FUNCTION public.trigger_experiment_advancement() SECURITY INVOKER;
ALTER FUNCTION public.trigger_protocol_improvement_audit() SECURITY INVOKER;

-- 2h. Materialized view refresh functions
ALTER FUNCTION public.refresh_experiment_telemetry() SECURITY INVOKER;
ALTER FUNCTION public.refresh_stage_zero_telemetry() SECURITY INVOKER;

-- 2i. Governance schema read-only functions
ALTER FUNCTION governance.fn_validate_stage_data(p_stage_number integer, p_phase text, p_data jsonb, p_direction text) SECURITY INVOKER;
ALTER FUNCTION governance.handle_cross_schema_cascade_delete() SECURITY INVOKER;


-- =============================================================================
-- PHASE 3: HARDEN RETAINED SECURITY DEFINER - ADD search_path
-- These functions MUST remain SECURITY DEFINER but need search_path protection.
-- =============================================================================

-- 3a. Governance schema functions
ALTER FUNCTION governance.register_cross_schema_fk(p_source_schema text, p_source_table text, p_source_column text, p_target_schema text, p_target_table text, p_target_column text, p_on_delete text) SET search_path TO 'governance', 'public';
ALTER FUNCTION governance.rls_governance_read_policy() SET search_path TO 'governance', 'public', 'auth';
ALTER FUNCTION governance.rls_portfolio_venture_policy(p_venture_id uuid) SET search_path TO 'governance', 'public', 'auth';
ALTER FUNCTION governance.rls_runtime_policy(p_venture_id uuid) SET search_path TO 'governance', 'public';
ALTER FUNCTION governance.trigger_validate_portfolio_to_governance() SET search_path TO 'governance', 'public';
ALTER FUNCTION governance.trigger_validate_runtime_to_governance() SET search_path TO 'governance', 'public';
ALTER FUNCTION governance.trigger_validate_runtime_to_portfolio() SET search_path TO 'governance', 'portfolio';
ALTER FUNCTION governance.trigger_validate_to_portfolio_ventures() SET search_path TO 'governance', 'portfolio';
ALTER FUNCTION governance.validate_cross_schema_ref(p_source_schema text, p_source_table text, p_source_column text, p_target_schema text, p_target_table text, p_target_column text, p_ref_value uuid) SET search_path TO 'governance', 'public', 'portfolio';
ALTER FUNCTION governance.validate_cross_schema_ref_text(p_source_schema text, p_source_table text, p_source_column text, p_target_schema text, p_target_table text, p_target_column text, p_ref_value text) SET search_path TO 'governance', 'public', 'portfolio';

-- 3b. Portfolio schema functions
ALTER FUNCTION portfolio.current_venture() SET search_path TO 'portfolio', 'public', 'auth';
ALTER FUNCTION portfolio.has_venture_access(p_venture_id uuid) SET search_path TO 'portfolio', 'public', 'auth';
ALTER FUNCTION portfolio.kill_switch(p_venture_id uuid, p_reason text, p_user_id uuid) SET search_path TO 'portfolio', 'public', 'auth';
ALTER FUNCTION portfolio.log_kill_switch_event() SET search_path TO 'portfolio', 'public';
ALTER FUNCTION portfolio.reactivate_venture(p_venture_id uuid, p_reason text, p_user_id uuid) SET search_path TO 'portfolio', 'public', 'auth';

-- 3c. Public schema SECURITY DEFINER functions - add search_path
ALTER FUNCTION public.accept_phase_handoff(handoff_id_param uuid) SET search_path TO 'public';
ALTER FUNCTION public.add_department_capability(p_department_id uuid, p_capability_name text, p_description text) SET search_path TO 'public';
ALTER FUNCTION public.approve_chairman_decision(p_decision_id uuid, p_rationale text, p_decided_by text) SET search_path TO 'public', 'auth';
ALTER FUNCTION public.assign_agent_to_department(p_agent_id uuid, p_department_id uuid, p_role text) SET search_path TO 'public';
ALTER FUNCTION public.auto_complete_sd_deliverables() SET search_path TO 'public';
ALTER FUNCTION public.auto_populate_venture_company_id() SET search_path TO 'public', 'auth';
ALTER FUNCTION public.claim_sd(p_sd_id text, p_session_id text, p_track text) SET search_path TO 'public';
ALTER FUNCTION public.cleanup_old_pipeline_metrics() SET search_path TO 'public';
ALTER FUNCTION public.complete_deliverables_on_subagent_pass() SET search_path TO 'public';
ALTER FUNCTION public.create_baseline_version(p_baseline_id uuid, p_created_by text) SET search_path TO 'public';
ALTER FUNCTION public.create_eva_conversation(p_user_id uuid, p_title text, p_metadata jsonb) SET search_path TO 'public';
ALTER FUNCTION public.create_valuation_approval_request(p_venture_id uuid, p_valuation_id uuid, p_requested_by uuid) SET search_path TO 'public';
ALTER FUNCTION public.enforce_doctrine_of_constraint() SET search_path TO 'public';
ALTER FUNCTION public.enforce_doctrine_on_system_events() SET search_path TO 'public';
ALTER FUNCTION public.eva_circuit_allows_request(p_venture_id text) SET search_path TO 'public';
ALTER FUNCTION public.fn_cascade_invalidation_on_vision_update() SET search_path TO 'public';
ALTER FUNCTION public.fn_create_sd_from_proposal(proposal_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.fn_log_outcome_event(p_parent_event_id uuid, p_actual_outcome jsonb, p_calibration_delta numeric, p_actor_type character varying, p_actor_role character varying, p_notes text) SET search_path TO 'public';
ALTER FUNCTION public.fn_log_proposal_transition() SET search_path TO 'public';
ALTER FUNCTION public.fn_log_system_event(p_event_type character varying, p_venture_id uuid, p_correlation_id uuid, p_agent_id uuid, p_agent_type character varying, p_token_cost integer, p_predicted_outcome jsonb, p_payload jsonb, p_parent_event_id uuid, p_actor_type character varying, p_actor_role character varying) SET search_path TO 'public';
ALTER FUNCTION public.fn_record_risk_gate_passage(p_venture_id uuid, p_gate_number integer, p_passed boolean, p_blocked_reason text) SET search_path TO 'public';
ALTER FUNCTION public.get_or_create_eva_circuit(p_venture_id text) SET search_path TO 'public';
ALTER FUNCTION public.initialize_venture_stages(p_venture_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.log_critical_error(p_error_type text, p_error_message text, p_operation text, p_component text, p_context jsonb, p_sd_id text, p_error_code text, p_error_stack text, p_attempt_count integer, p_is_recoverable boolean, p_recovery_guidance text, p_session_id text) SET search_path TO 'public';
ALTER FUNCTION public.log_gate_transition() SET search_path TO 'public', 'auth';
ALTER FUNCTION public.log_governance_bypass(p_sd_id text, p_trigger_name character varying, p_governance_metadata jsonb, p_old_values jsonb, p_new_values jsonb) SET search_path TO 'public';
ALTER FUNCTION public.log_null_capability_key() SET search_path TO 'public';
ALTER FUNCTION public.log_operations_access(p_user_id uuid, p_module text, p_action text, p_permission text, p_granted boolean) SET search_path TO 'public';
ALTER FUNCTION public.log_protocol_improvement_action(p_action character varying, p_improvement_id uuid, p_improvement_summary text, p_target_table character varying, p_actor_id text, p_actor_type character varying, p_details jsonb) SET search_path TO 'public';
ALTER FUNCTION public.park_venture_decision(p_decision_id uuid, p_park_type text, p_reason text, p_decided_by text) SET search_path TO 'public', 'auth';
ALTER FUNCTION public.record_eva_failure(p_venture_id text, p_error_message text, p_error_context jsonb) SET search_path TO 'public';
ALTER FUNCTION public.record_eva_success(p_venture_id text) SET search_path TO 'public';
ALTER FUNCTION public.record_mtti_on_proposal_creation() SET search_path TO 'public';
ALTER FUNCTION public.record_mttr_on_sd_completion() SET search_path TO 'public';
ALTER FUNCTION public.record_substage_transition(p_venture_id uuid, p_from_substage character varying, p_to_substage character varying, p_trigger_source character varying, p_completion_snapshot jsonb, p_override_by uuid, p_override_reason text) SET search_path TO 'public';
ALTER FUNCTION public.reject_chairman_decision(p_decision_id uuid, p_rationale text, p_decided_by text) SET search_path TO 'public', 'auth';
ALTER FUNCTION public.release_sd(p_session_id text, p_reason text) SET search_path TO 'public';
ALTER FUNCTION public.remove_agent_from_department(p_agent_id uuid, p_department_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.remove_department_capability(p_department_id uuid, p_capability_name text) SET search_path TO 'public';
ALTER FUNCTION public.reset_eva_circuit(p_venture_id text, p_reset_by text) SET search_path TO 'public';
ALTER FUNCTION public.retry_blocked_handoff(p_handoff_id uuid, p_new_score integer) SET search_path TO 'public';
ALTER FUNCTION public.send_department_message(p_department_id uuid, p_sender_id uuid, p_content text, p_metadata jsonb) SET search_path TO 'public';
ALTER FUNCTION public.set_leo_global_defaults(p_auto_proceed boolean, p_chain_orchestrators boolean, p_updated_by text) SET search_path TO 'public';
ALTER FUNCTION public.switch_sd_claim(p_session_id text, p_old_sd_id text, p_new_sd_id text, p_new_track text) SET search_path TO 'public';
ALTER FUNCTION public.sync_deliverables_to_story() SET search_path TO 'public';
ALTER FUNCTION public.sync_story_to_deliverables() SET search_path TO 'public';
ALTER FUNCTION public.sync_test_evidence_to_user_stories() SET search_path TO 'public';
ALTER FUNCTION public.update_session_heartbeat_with_branch(p_session_id text, p_branch text) SET search_path TO 'public';


-- =============================================================================
-- PHASE 4: SET search_path ON CONVERTED INVOKER FUNCTIONS
-- Even SECURITY INVOKER functions benefit from explicit search_path.
-- =============================================================================

ALTER FUNCTION public.assess_sd_type_change_risk(p_sd_id character varying, p_from_type character varying, p_to_type character varying) SET search_path TO 'public';
ALTER FUNCTION public.check_experiment_convergence(p_experiment_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.check_human_verification_gate(p_sd_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.check_stage13_1_to_2_criteria(p_venture_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.check_stage13_2_to_3_criteria(p_venture_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.compare_baseline_versions(p_baseline_id_from uuid, p_baseline_id_to uuid) SET search_path TO 'public';
ALTER FUNCTION public.fn_check_risk_escalation_triggers(p_risk_form_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.fn_evaluate_risk_recalibration_gate(p_venture_id uuid, p_gate_number integer) SET search_path TO 'public';
ALTER FUNCTION public.fn_validate_crew_kickoff(p_flow_id uuid, p_venture_id uuid, p_prd_id uuid, p_sd_id character varying) SET search_path TO 'public';
ALTER FUNCTION public.get_chairman_settings(p_company_id uuid, p_venture_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_conversation_messages(p_conversation_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_daily_briefing() SET search_path TO 'public';
ALTER FUNCTION public.get_department_agents(p_department_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_discovery_strategy_scores() SET search_path TO 'public';
ALTER FUNCTION public.get_effective_capabilities(p_agent_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_eva_conversations(p_user_id uuid, p_limit integer, p_offset integer) SET search_path TO 'public';
ALTER FUNCTION public.get_leo_global_defaults() SET search_path TO 'public';
ALTER FUNCTION public.get_oiv_contracts_for_sd_type(p_sd_type text) SET search_path TO 'public';
ALTER FUNCTION public.get_oiv_run_summary(p_run_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_okr_metrics() SET search_path TO 'public';
ALTER FUNCTION public.get_portfolio_summary() SET search_path TO 'public';
ALTER FUNCTION public.get_recent_errors(p_limit integer, p_severity text, p_status text) SET search_path TO 'public';
ALTER FUNCTION public.get_table_schema(table_name text) SET search_path TO 'public';
ALTER FUNCTION public.get_venture_stage_summary(p_venture_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_venture_token_balance(p_venture_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_voice_usage_stats(p_user_id uuid, p_period interval) SET search_path TO 'public';
ALTER FUNCTION public.get_content_queue_summary(p_venture_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.get_gate_decision_status(p_venture_id uuid, p_stage integer) SET search_path TO 'public';
ALTER FUNCTION public.is_type_upgrade(p_from_type character varying, p_to_type character varying) SET search_path TO 'public';
ALTER FUNCTION public.is_valid_automation_bypass(p_governance_metadata jsonb, p_trigger_name character varying) SET search_path TO 'public';
ALTER FUNCTION public.generate_utm_params(p_venture_id uuid, p_channel_id uuid, p_campaign character varying) SET search_path TO 'public';
ALTER FUNCTION public.match_agent_memory(p_query_embedding vector, p_venture_id uuid, p_agent_id uuid, p_memory_type character varying, p_match_threshold double precision, p_match_count integer) SET search_path TO 'public';
ALTER FUNCTION public.debug_sd_progress(sd_id_param text) SET search_path TO 'public';
ALTER FUNCTION public.check_progress_requirements(sd_id_param text) SET search_path TO 'public';
ALTER FUNCTION public.is_orchestrator_sd(sd_id_param text) SET search_path TO 'public';
ALTER FUNCTION public.orchestrator_children_complete(sd_id_param text) SET search_path TO 'public';
ALTER FUNCTION public.retry_orchestrator_auto_complete(sd_id_param character varying) SET search_path TO 'public';
ALTER FUNCTION public.validate_financial_consistency(p_venture_id uuid, p_stage_number integer, p_proposed_data jsonb) SET search_path TO 'public';
ALTER FUNCTION public.validate_sd_workflow_template(p_template_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.verify_deliverables_before_handoff() SET search_path TO 'public';
ALTER FUNCTION public.trigger_experiment_advancement() SET search_path TO 'public';
ALTER FUNCTION public.trigger_protocol_improvement_audit() SET search_path TO 'public';
ALTER FUNCTION public.refresh_experiment_telemetry() SET search_path TO 'public';
ALTER FUNCTION public.refresh_stage_zero_telemetry() SET search_path TO 'public';
ALTER FUNCTION governance.fn_validate_stage_data(p_stage_number integer, p_phase text, p_data jsonb, p_direction text) SET search_path TO 'governance', 'public';
ALTER FUNCTION governance.handle_cross_schema_cascade_delete() SET search_path TO 'governance', 'public';


-- =============================================================================
-- PHASE 5: DOCUMENTATION COMMENTS
-- Document WHY each retained SECURITY DEFINER function needs elevated privileges.
-- =============================================================================

-- 5a. RLS policy helpers (MUST be SECURITY DEFINER)
COMMENT ON FUNCTION public.fn_is_chairman() IS 'SECURITY DEFINER REQUIRED: RLS policy helper used in 8+ policies. Must run as definer to check auth.uid() against chairman settings.';
COMMENT ON FUNCTION public.fn_is_service_role() IS 'SECURITY DEFINER REQUIRED: RLS policy helper used in 6+ policies. Must run as definer to check current_setting(role).';
COMMENT ON FUNCTION public.fn_user_has_company_access(uuid) IS 'SECURITY DEFINER REQUIRED: RLS policy helper. Must run as definer to check auth.uid() against user_company_access.';
COMMENT ON FUNCTION public.fn_user_has_venture_access(uuid) IS 'SECURITY DEFINER REQUIRED: RLS policy helper used in 10+ policies. Must run as definer to check venture access via auth context.';
COMMENT ON FUNCTION portfolio.current_venture() IS 'SECURITY DEFINER REQUIRED: Reads JWT claims via auth.jwt() for RLS policy evaluation. Used by portfolio.has_venture_access().';
COMMENT ON FUNCTION portfolio.has_venture_access(uuid) IS 'SECURITY DEFINER REQUIRED: Used in RLS policies on ventures table. Checks role and delegates to current_venture().';
COMMENT ON FUNCTION governance.rls_governance_read_policy() IS 'SECURITY DEFINER REQUIRED: RLS policy helper for governance schema. Checks auth.role().';
COMMENT ON FUNCTION governance.rls_portfolio_venture_policy(uuid) IS 'SECURITY DEFINER REQUIRED: RLS policy helper. Checks auth.uid() and auth.role() for venture access.';
COMMENT ON FUNCTION governance.rls_runtime_policy(uuid) IS 'SECURITY DEFINER REQUIRED: RLS policy helper. Delegates to rls_portfolio_venture_policy.';

-- 5b. Cross-schema validators (MUST be SECURITY DEFINER)
COMMENT ON FUNCTION governance.validate_cross_schema_ref(text, text, text, text, text, text, uuid) IS 'SECURITY DEFINER REQUIRED: Dynamic cross-schema FK validation using EXECUTE format(%I). Definer needed for cross-schema access. Input sanitized via format().';
COMMENT ON FUNCTION governance.validate_cross_schema_ref_text(text, text, text, text, text, text, text) IS 'SECURITY DEFINER REQUIRED: Cross-schema FK validation (text variant). Uses EXECUTE format(%I) for safe dynamic SQL.';
COMMENT ON FUNCTION governance.register_cross_schema_fk(text, text, text, text, text, text, text) IS 'SECURITY DEFINER REQUIRED: Creates governance.cross_schema_fk_registry table and inserts records. Needs DDL privileges.';

-- 5c. Trigger functions that write to audit/tracking tables (MUST be SECURITY DEFINER)
COMMENT ON FUNCTION public.auto_calculate_progress() IS 'SECURITY DEFINER REQUIRED: Trigger on strategic_directives_v2 that calls calculate_sd_progress(). Must bypass RLS to read across multiple tables.';
COMMENT ON FUNCTION public.enforce_doctrine_of_constraint() IS 'SECURITY DEFINER REQUIRED: Governance trigger that inserts into system_events audit table. Must bypass RLS.';
COMMENT ON FUNCTION public.enforce_doctrine_on_system_events() IS 'SECURITY DEFINER REQUIRED: Governance trigger on system_events. Must bypass RLS for audit writes.';
COMMENT ON FUNCTION public.sync_deliverables_to_story() IS 'SECURITY DEFINER REQUIRED: Trigger syncing deliverables to user_stories. Must bypass RLS for cross-table UPDATE.';
COMMENT ON FUNCTION public.sync_story_to_deliverables() IS 'SECURITY DEFINER REQUIRED: Trigger syncing stories to deliverables. Must bypass RLS for cross-table UPDATE.';
COMMENT ON FUNCTION public.sync_test_evidence_to_user_stories() IS 'SECURITY DEFINER REQUIRED: Trigger syncing test evidence. Must bypass RLS for cross-table UPDATE.';
COMMENT ON FUNCTION public.record_mtti_on_proposal_creation() IS 'SECURITY DEFINER REQUIRED: Trigger recording MTTI metrics. Must bypass RLS for INSERT into pipeline_metrics.';
COMMENT ON FUNCTION public.record_mttr_on_sd_completion() IS 'SECURITY DEFINER REQUIRED: Trigger recording MTTR metrics. Must bypass RLS for INSERT into pipeline_metrics.';
COMMENT ON FUNCTION public.log_gate_transition() IS 'SECURITY DEFINER REQUIRED: Trigger logging gate transitions with auth.uid(). Must bypass RLS for audit INSERT.';
COMMENT ON FUNCTION public.fn_log_proposal_transition() IS 'SECURITY DEFINER REQUIRED: Trigger logging proposal state transitions. Must bypass RLS for audit INSERT.';
COMMENT ON FUNCTION public.fn_cascade_invalidation_on_vision_update() IS 'SECURITY DEFINER REQUIRED: Trigger cascading invalidation on vision doc update. Must bypass RLS for UPDATE on eva_architecture_plans.';
COMMENT ON FUNCTION public.complete_deliverables_on_github_pass() IS 'SECURITY DEFINER REQUIRED: Trigger completing deliverables on GitHub pass. Must bypass RLS for cross-table UPDATE.';
COMMENT ON FUNCTION public.complete_deliverables_on_subagent_pass() IS 'SECURITY DEFINER REQUIRED: Trigger completing deliverables on sub-agent pass. Must bypass RLS for cross-table UPDATE.';
COMMENT ON FUNCTION public.log_null_capability_key() IS 'SECURITY DEFINER REQUIRED: Trigger logging NULL capability keys. Must bypass RLS for INSERT.';
COMMENT ON FUNCTION public.auto_complete_sd_deliverables() IS 'SECURITY DEFINER REQUIRED (DEPRECATED): Trigger auto-completing deliverables on handoff. Must bypass RLS.';
COMMENT ON FUNCTION public.auto_populate_venture_company_id() IS 'SECURITY DEFINER REQUIRED: Trigger reading user_company_access via auth.uid(). Must bypass RLS.';
COMMENT ON FUNCTION public.sync_ventures_to_eva_ventures_insert() IS 'SECURITY DEFINER REQUIRED: Trigger syncing ventures to eva_ventures on INSERT. Must bypass RLS for cross-table INSERT.';
COMMENT ON FUNCTION public.sync_ventures_to_eva_ventures_update() IS 'SECURITY DEFINER REQUIRED: Trigger syncing ventures to eva_ventures on UPDATE. Must bypass RLS for cross-table UPDATE.';
COMMENT ON FUNCTION public.try_auto_complete_parent_orchestrator() IS 'SECURITY DEFINER REQUIRED: Trigger auto-completing parent orchestrator SDs. Must bypass RLS to check all child SDs.';
COMMENT ON FUNCTION public.enforce_progress_on_completion() IS 'SECURITY DEFINER REQUIRED: Trigger enforcing progress requirements on SD completion. Must read across multiple tables.';
COMMENT ON FUNCTION portfolio.log_kill_switch_event() IS 'SECURITY DEFINER REQUIRED: Trigger writing to kill_switch_audit_log. Must bypass RLS for audit INSERT.';

-- 5d. Administrative RPC functions (MUST be SECURITY DEFINER)
COMMENT ON FUNCTION public.claim_sd(text, text, text) IS 'SECURITY DEFINER REQUIRED: Session claim management. Must bypass RLS to update claude_sessions regardless of caller.';
COMMENT ON FUNCTION public.release_sd(text, text) IS 'SECURITY DEFINER REQUIRED: Releases SD claims. Must bypass RLS to update claude_sessions.';
COMMENT ON FUNCTION public.switch_sd_claim(text, text, text, text) IS 'SECURITY DEFINER REQUIRED: Switches SD claims. Must bypass RLS for UPDATE on claude_sessions.';
COMMENT ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) IS 'SECURITY DEFINER REQUIRED: Gate-enforced stage advancement. Must bypass RLS for multi-table updates.';
COMMENT ON FUNCTION public.bootstrap_venture_workflow(uuid) IS 'SECURITY DEFINER REQUIRED: Initializes all venture stage work rows. Must bypass RLS for bulk INSERT.';
COMMENT ON FUNCTION public.approve_chairman_decision(uuid, text, text) IS 'SECURITY DEFINER REQUIRED: Chairman approval. Must bypass RLS to update chairman_decisions and ventures.';
COMMENT ON FUNCTION public.reject_chairman_decision(uuid, text, text) IS 'SECURITY DEFINER REQUIRED: Chairman rejection. Must bypass RLS to update chairman_decisions.';
COMMENT ON FUNCTION public.accept_phase_handoff(uuid) IS 'SECURITY DEFINER REQUIRED: Updates handoff status. Called by roles that may lack direct UPDATE on sd_phase_handoffs.';
COMMENT ON FUNCTION portfolio.kill_switch(uuid, text, uuid) IS 'SECURITY DEFINER REQUIRED: Emergency venture deactivation. Must bypass RLS and uses auth.uid() for audit.';
COMMENT ON FUNCTION portfolio.reactivate_venture(uuid, text, uuid) IS 'SECURITY DEFINER REQUIRED: Venture reactivation. Must bypass RLS and uses auth.uid() for audit.';

-- 5e. exec_sql (CONVERTED to SECURITY INVOKER)
COMMENT ON FUNCTION public.exec_sql(text) IS 'CONVERTED TO SECURITY INVOKER (was SECURITY DEFINER). Now restricted to SELECT/WITH queries only. Dangerous SQL patterns blocked. Migration: 20260317_security_definer_audit.sql';


COMMIT;


-- =============================================================================
-- ROLLBACK SQL (execute manually if needed)
-- =============================================================================
-- To rollback exec_sql:
--   CREATE OR REPLACE exec_sql with original body and SECURITY DEFINER
--
-- To rollback all SECURITY INVOKER conversions, run:
--   ALTER FUNCTION <name>(<args>) SECURITY DEFINER;
-- for each function listed in Phase 2 above.
--
-- To rollback search_path changes:
--   ALTER FUNCTION <name>(<args>) RESET search_path;
-- for each function listed in Phase 3 and 4 above.
-- =============================================================================
