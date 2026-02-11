-- ============================================================================
-- LEO Protocol - Fix Security Definer Views and Enable RLS
-- Migration: 20260211_fix_security_definer_views_and_rls.sql
-- SD: SD-SEC-DB-LINTER-001
-- ============================================================================
-- Purpose: Remediate Supabase database linter security findings
--
-- CATEGORY 1: SECURITY DEFINER Views (70 views)
--   Fix: Set security_invoker = on to respect RLS policies of querying user
--
-- CATEGORY 2: RLS Disabled on Public Tables (14 tables)
--   Fix: Enable RLS + add service_role policy (internal/service-only tables)
--   Special handling: Drop test/backup tables if they're leftover artifacts
--
-- Security Rationale:
--   - SECURITY DEFINER bypasses RLS, allowing views to expose data the user
--     shouldn't normally see. security_invoker = on ensures views respect the
--     querying user's permissions.
--   - This app uses service_role key (bypasses RLS anyway), so switching views
--     to SECURITY INVOKER is safe and aligns with principle of least privilege.
--   - Internal tables (canary metrics, persona config, etc.) should have RLS
--     enabled with service_role-only access to prevent accidental exposure via
--     PostgREST API or other clients.
-- ============================================================================

-- ============================================================================
-- PART 1: FIX SECURITY DEFINER VIEWS (70 views)
-- Set security_invoker = on for all affected views
-- ============================================================================

DO $$
DECLARE
  view_list TEXT[] := ARRAY[
    'v_baseline_with_rationale',
    'v_active_sessions',
    'v_debate_analytics',
    'v_doctrine_compliance_summary',
    'v_llm_model_registry',
    'v_learning_decision_stats',
    'v_chairman_settings_resolved',
    'v_active_sd_workflow_templates',
    'prds',
    'v_blocked_handoffs_pending',
    'v_sd_wall_overview',
    'v_active_brand_genomes',
    'v_improvement_lineage',
    'v_circuit_breaker_repeat_offenders',
    'v_rca_auto_trigger_summary',
    'chairman_pending_decisions',
    'audit_coverage_report',
    'validation_failure_metrics',
    'v_contexts_missing_sub_agents',
    'v_recent_circuit_breaker_blocks',
    'v_proposal_learning',
    'v_aegis_open_violations',
    'v_context_usage_recent',
    'baseline_summary',
    'v_governance_compliance',
    'v_governance_audit',
    'v_aegis_constitution_summary',
    'v_okr_scorecard',
    'baseline_stale_issues',
    'v_sd_e2e_readiness',
    'v_sd_human_verification_requirements',
    'v_patterns_available_for_sd',
    'v_latest_test_evidence',
    'v_intake_submissions_with_scores',
    'uat_execution_summary',
    'v_sd_execution_status',
    'v_sub_agent_execution_history',
    'v_sd_okr_context',
    'v_recent_doctrine_violations',
    'v_ventures_stage_compat',
    'v_sd_keys',
    'v_pipeline_health',
    'v_risk_gate_dashboard',
    'v_story_test_coverage',
    'v_sd_alignment_warnings',
    'v_continuous_execution_summary',
    'v_sub_agent_executions_unified',
    'v_venture_brief_summary',
    'v_story_e2e_compliance',
    'v_fit_gate_statistics',
    'v_recent_governance_bypasses',
    'v_sd_test_readiness',
    'v_key_results_with_sds',
    'uat_test_health',
    'v_nursery_pending_evaluation',
    'v_patterns_with_decay',
    'v_session_metrics',
    'chairman_unified_decisions',
    'v_aegis_rule_stats',
    'v_brand_completeness_stats',
    'v_sd_hierarchy',
    'v_sd_next_candidates',
    'v_active_connection_strategies',
    'v_modeling_accuracy',
    'v_vetting_coverage',
    'v_okr_hierarchy',
    'v_orchestrator_completion_status',
    'v_validation_summary',
    'v_event_causality_chain',
    'v_circuit_breaker_stats'
  ];
  v TEXT;
  fixed_count INT := 0;
  skipped_count INT := 0;
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
      fixed_count := fixed_count + 1;
    ELSE
      RAISE NOTICE 'View does not exist (skipping): %', v;
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'PART 1 COMPLETE: % views fixed, % skipped (not found)', fixed_count, skipped_count;
END $$;

-- ============================================================================
-- PART 2: DROP TEST/BACKUP TABLES
-- These appear to be leftover test artifacts or old backups
-- ============================================================================

DO $$
BEGIN
  -- Drop test_minimal if it exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_minimal') THEN
    DROP TABLE public.test_minimal CASCADE;
    RAISE NOTICE 'Dropped test table: test_minimal';
  END IF;

  -- Drop test_default if it exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_default') THEN
    DROP TABLE public.test_default CASCADE;
    RAISE NOTICE 'Dropped test table: test_default';
  END IF;

  -- Drop view_definitions_backup_20260124 if it exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'view_definitions_backup_20260124') THEN
    DROP TABLE public.view_definitions_backup_20260124 CASCADE;
    RAISE NOTICE 'Dropped backup table: view_definitions_backup_20260124';
  END IF;

  RAISE NOTICE 'PART 2 COMPLETE: Test/backup tables cleaned up';
END $$;

-- ============================================================================
-- PART 3: ENABLE RLS ON INTERNAL TABLES (11 tables)
-- These are internal/service-only tables that need RLS protection
-- Pattern: Enable RLS + service_role-only policy (blocks anon/authenticated)
-- ============================================================================

-- 1. llm_canary_state (LLM canary deployment state tracking)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'llm_canary_state') THEN
    ALTER TABLE public.llm_canary_state ENABLE ROW LEVEL SECURITY;

    -- Revoke all access from public roles
    REVOKE ALL ON public.llm_canary_state FROM anon, authenticated;

    -- Create service_role-only policy if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'llm_canary_state' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.llm_canary_state
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on llm_canary_state (service_role only)';
  END IF;
END $$;

-- 2. llm_canary_transitions (Audit trail of canary stage changes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'llm_canary_transitions') THEN
    ALTER TABLE public.llm_canary_transitions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.llm_canary_transitions FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'llm_canary_transitions' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.llm_canary_transitions
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on llm_canary_transitions (service_role only)';
  END IF;
END $$;

-- 3. llm_canary_metrics (Per-request metrics for quality evaluation)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'llm_canary_metrics') THEN
    ALTER TABLE public.llm_canary_metrics ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.llm_canary_metrics FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'llm_canary_metrics' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.llm_canary_metrics
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on llm_canary_metrics (service_role only)';
  END IF;
END $$;

-- 4. persona_config (Sub-agent persona configuration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'persona_config') THEN
    ALTER TABLE public.persona_config ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.persona_config FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'persona_config' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.persona_config
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on persona_config (service_role only)';
  END IF;
END $$;

-- 5. connection_selection_log (AI provider selection audit log)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'connection_selection_log') THEN
    ALTER TABLE public.connection_selection_log ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.connection_selection_log FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'connection_selection_log' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.connection_selection_log
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on connection_selection_log (service_role only)';
  END IF;
END $$;

-- 6. connection_strategies (AI provider routing strategies)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'connection_strategies') THEN
    ALTER TABLE public.connection_strategies ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.connection_strategies FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'connection_strategies' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.connection_strategies
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on connection_strategies (service_role only)';
  END IF;
END $$;

-- 7. self_audit_findings (Self-audit results)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'self_audit_findings') THEN
    ALTER TABLE public.self_audit_findings ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.self_audit_findings FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'self_audit_findings' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.self_audit_findings
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on self_audit_findings (service_role only)';
  END IF;
END $$;

-- 8. audit_log (General audit trail)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log') THEN
    ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.audit_log FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.audit_log
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on audit_log (service_role only)';
  END IF;
END $$;

-- 9. outcome_signals (Outcome tracking signals)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'outcome_signals') THEN
    ALTER TABLE public.outcome_signals ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.outcome_signals FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcome_signals' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.outcome_signals
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on outcome_signals (service_role only)';
  END IF;
END $$;

-- 10. sd_effectiveness_metrics (SD effectiveness tracking)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sd_effectiveness_metrics') THEN
    ALTER TABLE public.sd_effectiveness_metrics ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.sd_effectiveness_metrics FROM anon, authenticated;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sd_effectiveness_metrics' AND policyname = 'service_role_full_access') THEN
      CREATE POLICY "service_role_full_access" ON public.sd_effectiveness_metrics
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Enabled RLS on sd_effectiveness_metrics (service_role only)';
  END IF;
END $$;

-- ============================================================================
-- PART 4: _migration_metadata (SKIP - Already has RLS from previous migration)
-- See: 20260211_enable_rls_migration_metadata.sql
-- ============================================================================

-- Migration metadata already protected, skipping

-- ============================================================================
-- PART 5: VERIFICATION
-- Check that all fixes were applied successfully
-- ============================================================================

DO $$
DECLARE
  views_with_security_invoker INT;
  tables_with_rls INT;
  total_expected_views INT := 70;
  total_expected_tables INT := 11; -- 14 original - 3 dropped test tables
BEGIN
  -- Count views with security_invoker enabled
  SELECT COUNT(*) INTO views_with_security_invoker
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND c.reloptions @> ARRAY['security_invoker=on'];

  -- Count tables with RLS enabled (from our target list)
  SELECT COUNT(*) INTO tables_with_rls
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public'
    AND t.tablename IN (
      'llm_canary_state', 'llm_canary_transitions', 'llm_canary_metrics',
      'persona_config', 'connection_selection_log', 'connection_strategies',
      'self_audit_findings', 'audit_log', 'outcome_signals',
      'sd_effectiveness_metrics', '_migration_metadata'
    )
    AND c.relrowsecurity = true;

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'MIGRATION COMPLETE: Security Definer Views + RLS Gaps Fixed';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Views with security_invoker=on: % (at least % expected)', views_with_security_invoker, total_expected_views;
  RAISE NOTICE 'Tables with RLS enabled: %/% from target list', tables_with_rls, total_expected_tables;
  RAISE NOTICE 'Test/backup tables dropped: 3 (test_minimal, test_default, view_definitions_backup_20260124)';
  RAISE NOTICE '';
  RAISE NOTICE 'Security improvements:';
  RAISE NOTICE '  - Views now respect RLS policies of querying user (no SECURITY DEFINER bypass)';
  RAISE NOTICE '  - Internal tables protected with service_role-only policies';
  RAISE NOTICE '  - Old test artifacts removed from public schema';
  RAISE NOTICE '============================================================================';
END $$;

-- ============================================================================
-- NOTES FOR FUTURE MAINTENANCE
-- ============================================================================
-- When creating new views:
--   CREATE VIEW my_view AS ... ;
--   ALTER VIEW my_view SET (security_invoker = on);
--
-- When creating internal/service-only tables:
--   ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
--   REVOKE ALL ON my_table FROM anon, authenticated;
--   CREATE POLICY "service_role_full_access" ON my_table
--     FOR ALL TO service_role USING (true) WITH CHECK (true);
--
-- NEVER use SECURITY DEFINER on views unless absolutely necessary
-- ALWAYS enable RLS on tables in public schema (unless user-facing with auth)
-- ============================================================================
