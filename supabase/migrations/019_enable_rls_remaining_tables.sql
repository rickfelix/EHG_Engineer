-- Migration: Enable RLS on remaining application tables
-- Generated: 2025-10-26
-- Purpose: Add Row Level Security policies to 59 remaining tables
--
-- This migration uses safe table existence checks before enabling RLS
-- to handle cases where tables may not exist in all environments.

-- Function to safely enable RLS and create policies if table exists
CREATE OR REPLACE FUNCTION enable_rls_if_exists(table_name text)
RETURNS text AS $$
DECLARE
  table_exists boolean;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = table_name
  ) INTO table_exists;

  IF NOT table_exists THEN
    RETURN 'SKIPPED: Table ' || table_name || ' does not exist';
  END IF;

  -- Enable RLS
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);

  -- Create service_role policy (full access)
  EXECUTE format('
    CREATE POLICY "service_role_all_%I"
    ON %I
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
  ', table_name, table_name);

  -- Create authenticated policy (read-only)
  EXECUTE format('
    CREATE POLICY "authenticated_read_%I"
    ON %I
    FOR SELECT
    TO authenticated
    USING (true)
  ', table_name, table_name);

  RETURN 'SUCCESS: RLS enabled on ' || table_name;
END;
$$ LANGUAGE plpgsql;

-- Apply RLS to all remaining tables
SELECT enable_rls_if_exists('leo_handoff_executions');
SELECT enable_rls_if_exists('leo_handoff_rejections');
SELECT enable_rls_if_exists('leo_handoff_templates');
SELECT enable_rls_if_exists('leo_handoff_validations');
SELECT enable_rls_if_exists('leo_interfaces');
SELECT enable_rls_if_exists('leo_mandatory_validations');
SELECT enable_rls_if_exists('leo_nfr_requirements');
SELECT enable_rls_if_exists('leo_protocol_changes');
SELECT enable_rls_if_exists('leo_protocol_file_audit');
SELECT enable_rls_if_exists('leo_protocol_references');
SELECT enable_rls_if_exists('leo_reasoning_sessions');
SELECT enable_rls_if_exists('leo_reasoning_triggers');
SELECT enable_rls_if_exists('leo_risk_spikes');
SELECT enable_rls_if_exists('leo_sub_agent_handoffs');
SELECT enable_rls_if_exists('leo_sub_agent_triggers');
SELECT enable_rls_if_exists('leo_sub_agents');
SELECT enable_rls_if_exists('leo_subagent_handoffs');
SELECT enable_rls_if_exists('leo_test_plans');
SELECT enable_rls_if_exists('leo_validation_rules');
SELECT enable_rls_if_exists('leo_workflow_phases');
SELECT enable_rls_if_exists('operations_audit_log');
SELECT enable_rls_if_exists('plan_conflict_rules');
SELECT enable_rls_if_exists('plan_subagent_queries');
SELECT enable_rls_if_exists('plan_verification_results');
SELECT enable_rls_if_exists('prd_ui_mappings');
SELECT enable_rls_if_exists('prds_backup_20251016');
SELECT enable_rls_if_exists('proposal_approvals');
SELECT enable_rls_if_exists('proposal_notifications');
SELECT enable_rls_if_exists('proposal_state_transitions');
SELECT enable_rls_if_exists('retro_notifications');
SELECT enable_rls_if_exists('retrospective_action_items');
SELECT enable_rls_if_exists('retrospective_insights');
SELECT enable_rls_if_exists('retrospective_learning_links');
SELECT enable_rls_if_exists('retrospective_templates');
SELECT enable_rls_if_exists('retrospective_triggers');
SELECT enable_rls_if_exists('retrospectives');
SELECT enable_rls_if_exists('risk_assessments');
SELECT enable_rls_if_exists('schema_expectations');
SELECT enable_rls_if_exists('sd_backlog_map');
SELECT enable_rls_if_exists('sd_business_evaluations');
SELECT enable_rls_if_exists('sd_dependency_graph');
SELECT enable_rls_if_exists('sd_execution_timeline');
SELECT enable_rls_if_exists('sd_overlap_analysis');
SELECT enable_rls_if_exists('sd_scope_deliverables');
SELECT enable_rls_if_exists('sd_state_transitions');
SELECT enable_rls_if_exists('sd_testing_status');
SELECT enable_rls_if_exists('sdip_ai_analysis');
SELECT enable_rls_if_exists('sub_agent_execution_batches');
SELECT enable_rls_if_exists('sub_agent_executions');
SELECT enable_rls_if_exists('sub_agent_gate_requirements');
SELECT enable_rls_if_exists('subagent_activations');
SELECT enable_rls_if_exists('subagent_requirements');
SELECT enable_rls_if_exists('submission_groups');
SELECT enable_rls_if_exists('submission_screenshots');
SELECT enable_rls_if_exists('submission_steps');
SELECT enable_rls_if_exists('test_coverage_policies');
SELECT enable_rls_if_exists('test_plans');
SELECT enable_rls_if_exists('ui_validation_checkpoints');
SELECT enable_rls_if_exists('ui_validation_results');

-- Clean up helper function
DROP FUNCTION IF EXISTS enable_rls_if_exists(text);

-- Migration complete
-- This migration safely enables RLS on all existing tables
-- Skips tables that don't exist without error
-- Standard policy set: service_role (full access), authenticated (read-only)
