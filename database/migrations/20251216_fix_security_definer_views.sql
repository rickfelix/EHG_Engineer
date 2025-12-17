-- Migration: Fix Security Definer Views
-- Date: 2025-12-16
-- Purpose: Address Supabase linter security errors:
--   1. auth_users_exposed: sdip_recently_completed exposes auth.users to anon
--   2. security_definer_view: 70+ views use SECURITY DEFINER bypassing RLS
--
-- Solution:
--   - Recreate sdip_recently_completed without auth.users join
--   - Set security_invoker = on for all affected views (PostgreSQL 15+)

-- ============================================
-- PART 1: FIX auth_users_exposed
-- The sdip_recently_completed view joins auth.users exposing user emails
-- ============================================

-- Drop and recreate the view without auth.users join
DROP VIEW IF EXISTS sdip_recently_completed;

CREATE VIEW sdip_recently_completed AS
SELECT
  s.id,
  s.submission_title,
  s.chairman_input,
  s.client_summary,
  s.resulting_sd_id,
  s.completed_at,
  s.created_by
  -- Removed: u.email as user_email (exposed auth.users)
  -- If email is needed, use a SECURITY DEFINER function with proper access control
FROM sdip_submissions s
WHERE s.validation_complete = TRUE
  AND s.completed_at IS NOT NULL
ORDER BY s.completed_at DESC
LIMIT 100;

-- Ensure RLS is respected
ALTER VIEW sdip_recently_completed SET (security_invoker = on);

-- Re-grant permissions (to authenticated only, not anon)
REVOKE ALL ON sdip_recently_completed FROM anon;
GRANT SELECT ON sdip_recently_completed TO authenticated;

COMMENT ON VIEW sdip_recently_completed IS 'Recently completed submissions (security fixed: removed auth.users exposure)';

-- ============================================
-- PART 2: FIX security_definer_view errors
-- Set security_invoker = on for all affected views
-- This ensures views respect RLS policies of the querying user
-- ============================================

-- List of views to fix (from Supabase linter output)
DO $$
DECLARE
  view_list TEXT[] := ARRAY[
    'v_sd_next_candidates',
    'v_failing_criteria_analysis',
    'v_protocol_improvements_analysis',
    'v_exec_implementation_summary',
    'v_story_test_coverage',
    'v_gate_rule_integrity',
    'v_active_sessions',
    'v_insight_patterns',
    'v_sub_agent_execution_history',
    'v_ai_quality_cost_tracking',
    'sd_children',
    'v_story_verification_status',
    'v_subagent_compliance',
    'recent_submissions',
    'v_recent_ai_assessments',
    'v_backlog_completion_status',
    'v_sd_keys',
    'v_schema_critical_issues',
    'v_business_evaluation_history',
    'v_latest_test_evidence',
    'v_retrospective_trends',
    'v_plan_validation_summary',
    'sdip_pending_validations',
    'v_ehg_backlog',
    'v_rca_comprehensive_analytics',
    'ui_validation_summary',
    'v_sd_release_gate',
    'learning_progress_summary',
    'reasoning_analytics',
    'v_active_documentation_violations',
    'v_ai_quality_threshold_analysis',
    'v_pending_retro_notifications',
    'v_pending_improvements',
    'v_uat_run_stats',
    'v_pending_action_items',
    'legacy_handoff_executions_view',
    'rollback_eligible_actions',
    'v_criterion_performance',
    'v_parallel_track_status',
    'v_sub_agent_executions_unified',
    'v_prd_acceptance',
    'venture_token_summary',
    'active_leo_protocol_view',
    'v_rca_pattern_recurrence',
    'v_untested_sds',
    'ehg_capabilities',
    'active_github_operations',
    'v_schema_validation_status',
    'v_prd_sd_payload',
    'v_sd_overlap_matrix',
    'v_sd_parallel_opportunities',
    'v_handoff_chain',
    'v_problematic_handoffs',
    'v_ehg_engineer_backlog',
    'pattern_subagent_summary',
    'v_recent_improvement_audit',
    'v_rca_analytics',
    'handoff_readiness_dashboard',
    'pattern_statistics',
    'prd_reasoning_analytics',
    'v_improvement_effectiveness',
    'v_documentation_health_summary',
    'v_cross_sd_utilization_matrix',
    'opportunity_pipeline',
    'sdip_validation_progress',
    'v_agent_documentation_compliance',
    'venture_token_by_phase',
    'v_ai_quality_summary',
    'v_ai_quality_tuning_recommendations',
    'v_sd_execution_status',
    'strategic_directives_backlog',
    'sd_family_tree',
    'v_contexts_missing_sub_agents',
    'sdip_gate_completion_rates',
    'v_intelligence_dashboard',
    'v_lead_evaluation_summary',
    'v_story_e2e_compliance',
    'v_sd_e2e_readiness',
    'v_sds_needing_business_evaluation',
    'v_sd_test_readiness'
  ];
  v TEXT;
BEGIN
  FOREACH v IN ARRAY view_list
  LOOP
    -- Check if view exists before altering
    IF EXISTS (
      SELECT 1 FROM pg_views
      WHERE schemaname = 'public' AND viewname = v
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v);
      RAISE NOTICE 'Fixed security_invoker for view: %', v;
    ELSE
      RAISE NOTICE 'View does not exist (skipping): %', v;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- PART 3: Verify fixes
-- ============================================

-- Create a verification function to check all public views
CREATE OR REPLACE FUNCTION verify_view_security_settings()
RETURNS TABLE (
  view_name TEXT,
  security_invoker BOOLEAN,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.viewname::TEXT,
    COALESCE((
      SELECT c.reloptions @> ARRAY['security_invoker=on']
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v.viewname
    ), false) as security_invoker,
    CASE
      WHEN COALESCE((
        SELECT c.reloptions @> ARRAY['security_invoker=on']
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = v.viewname
      ), false) THEN 'OK'
      ELSE 'NEEDS FIX'
    END as status
  FROM pg_views v
  WHERE v.schemaname = 'public'
  ORDER BY v.viewname;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION verify_view_security_settings() IS 'Verify all public views have security_invoker enabled';

-- ============================================
-- NOTES FOR FUTURE MAINTENANCE
-- ============================================
-- When creating new views, ALWAYS use:
--   CREATE VIEW my_view AS ... ;
--   ALTER VIEW my_view SET (security_invoker = on);
--
-- Or create views with the option inline (PostgreSQL 15+):
--   CREATE VIEW my_view WITH (security_invoker = on) AS ... ;
--
-- NEVER join auth.users directly in public views
-- Instead, use SECURITY DEFINER functions with proper access control
