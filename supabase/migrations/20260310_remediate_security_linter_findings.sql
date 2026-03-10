-- ============================================================================
-- Migration: Remediate Supabase Security Linter Findings (Round 3)
-- SD: SD-LEO-FIX-REMEDIATE-SUPABASE-SECURITY-001
-- Date: 2026-03-10
-- ============================================================================
-- Purpose: Address 16 remaining security linter findings across 5 categories:
--   PART 1 (P0): Protect eva_interactions - HIGH SEVERITY (session_id exposure)
--   PART 2 (P1): Fix defective app_rankings policy (missing TO service_role)
--   PART 3 (P3): Enable RLS on leo_protocol_state, evidence_gate_mapping,
--                skill_assessment_scores
--   PART 4 (P2): Convert 10 views to SECURITY_INVOKER
--   PART 5:      Frontend dependency - authenticated SELECT on underlying tables
--
-- All changes are idempotent (safe to re-run).
-- Prior remediation rounds:
--   20260211_fix_security_definer_views_and_rls.sql (70 views, 11 tables)
--   20260222_remediate_security_definer_views_and_rls.sql (11 views, agent_skills)
--   20260302_rls_chairman_tables.sql (5 chairman tables)
-- ============================================================================


-- ============================================================================
-- PART 1: P0 - PROTECT eva_interactions (HIGH SEVERITY)
-- session_id field exposed via PostgREST without RLS protection.
-- ============================================================================

-- Enable RLS
ALTER TABLE public.eva_interactions ENABLE ROW LEVEL SECURITY;

-- Revoke direct access from public-facing roles
REVOKE ALL ON public.eva_interactions FROM anon;
REVOKE ALL ON public.eva_interactions FROM authenticated;

-- Create service_role-only policy (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'eva_interactions'
    AND policyname = 'service_role_full_access_eva_interactions'
  ) THEN
    CREATE POLICY service_role_full_access_eva_interactions
      ON public.eva_interactions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'PART 1: Created service_role policy on eva_interactions';
  ELSE
    RAISE NOTICE 'PART 1: Policy already exists on eva_interactions (skipped)';
  END IF;
END $$;


-- ============================================================================
-- PART 2: P1 - FIX DEFECTIVE app_rankings POLICY
-- Existing policy "Service role full access on app_rankings" is missing
-- the TO service_role clause, making it apply to all roles.
-- ============================================================================

-- Drop the defective policy
DROP POLICY IF EXISTS "Service role full access on app_rankings" ON app_rankings;

-- Ensure RLS is enabled
ALTER TABLE public.app_rankings ENABLE ROW LEVEL SECURITY;

-- Revoke direct access from public-facing roles
REVOKE ALL ON public.app_rankings FROM anon;
REVOKE ALL ON public.app_rankings FROM authenticated;

-- Create corrected policy with explicit TO service_role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_rankings'
    AND policyname = 'service_role_full_access_app_rankings'
  ) THEN
    CREATE POLICY service_role_full_access_app_rankings
      ON public.app_rankings
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'PART 2: Created corrected service_role policy on app_rankings';
  ELSE
    RAISE NOTICE 'PART 2: Corrected policy already exists on app_rankings (skipped)';
  END IF;
END $$;


-- ============================================================================
-- PART 3: P3 - ENABLE RLS ON REMAINING TABLES
-- Tables: leo_protocol_state, evidence_gate_mapping, skill_assessment_scores
-- Pattern: Enable RLS + REVOKE + service_role-only policy
-- ============================================================================

-- 3a. leo_protocol_state
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leo_protocol_state') THEN
    ALTER TABLE public.leo_protocol_state ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.leo_protocol_state FROM anon, authenticated;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'leo_protocol_state'
      AND policyname = 'service_role_full_access_leo_protocol_state'
    ) THEN
      CREATE POLICY service_role_full_access_leo_protocol_state
        ON public.leo_protocol_state
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
      RAISE NOTICE 'PART 3a: Enabled RLS + policy on leo_protocol_state';
    ELSE
      RAISE NOTICE 'PART 3a: Policy already exists on leo_protocol_state (skipped)';
    END IF;
  ELSE
    RAISE NOTICE 'PART 3a: Table leo_protocol_state does not exist (skipped)';
  END IF;
END $$;

-- 3b. evidence_gate_mapping
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'evidence_gate_mapping') THEN
    ALTER TABLE public.evidence_gate_mapping ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.evidence_gate_mapping FROM anon, authenticated;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'evidence_gate_mapping'
      AND policyname = 'service_role_full_access_evidence_gate_mapping'
    ) THEN
      CREATE POLICY service_role_full_access_evidence_gate_mapping
        ON public.evidence_gate_mapping
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
      RAISE NOTICE 'PART 3b: Enabled RLS + policy on evidence_gate_mapping';
    ELSE
      RAISE NOTICE 'PART 3b: Policy already exists on evidence_gate_mapping (skipped)';
    END IF;
  ELSE
    RAISE NOTICE 'PART 3b: Table evidence_gate_mapping does not exist (skipped)';
  END IF;
END $$;

-- 3c. skill_assessment_scores
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'skill_assessment_scores') THEN
    ALTER TABLE public.skill_assessment_scores ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.skill_assessment_scores FROM anon, authenticated;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'skill_assessment_scores'
      AND policyname = 'service_role_full_access_skill_assessment_scores'
    ) THEN
      CREATE POLICY service_role_full_access_skill_assessment_scores
        ON public.skill_assessment_scores
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
      RAISE NOTICE 'PART 3c: Enabled RLS + policy on skill_assessment_scores';
    ELSE
      RAISE NOTICE 'PART 3c: Policy already exists on skill_assessment_scores (skipped)';
    END IF;
  ELSE
    RAISE NOTICE 'PART 3c: Table skill_assessment_scores does not exist (skipped)';
  END IF;
END $$;


-- ============================================================================
-- PART 4: P2 - CONVERT 10 VIEWS TO SECURITY_INVOKER
-- Views currently use SECURITY DEFINER (bypass RLS). Switch to SECURITY
-- INVOKER so queries respect the calling user's RLS policies.
-- Uses proven DO block array iteration pattern (from 20260211 migration).
-- ============================================================================

DO $$
DECLARE
  view_list TEXT[] := ARRAY[
    'v_capability_ledger',
    'v_skill_health',
    'v_unified_capabilities',
    'v_archived_ventures',
    'v_active_sessions',
    'v_active_ventures',
    'v_orphan_visions',
    'v_feedback_with_sensemaking',
    'v_chairman_pending_decisions',
    'v_scanner_capabilities'
  ];
  v TEXT;
  fixed_count INT := 0;
  skipped_count INT := 0;
BEGIN
  FOREACH v IN ARRAY view_list
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_views
      WHERE schemaname = 'public' AND viewname = v
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v);
      RAISE NOTICE 'PART 4: Set security_invoker=on for view: %', v;
      fixed_count := fixed_count + 1;
    ELSE
      RAISE NOTICE 'PART 4: View % does not exist (skipped)', v;
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'PART 4 COMPLETE: % views fixed, % skipped', fixed_count, skipped_count;
END $$;


-- ============================================================================
-- PART 5: FRONTEND DEPENDENCY - AUTHENTICATED SELECT ON UNDERLYING TABLES
-- v_unified_capabilities and v_chairman_pending_decisions are used by the
-- frontend (authenticated role). After converting to SECURITY_INVOKER, the
-- authenticated user needs SELECT access on the underlying tables.
-- ============================================================================

-- 5a. Underlying tables for v_unified_capabilities
--     venture_capabilities, agent_skills, agent_registry, sd_capabilities

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venture_capabilities') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'venture_capabilities'
      AND policyname = 'authenticated_read_venture_capabilities'
    ) THEN
      CREATE POLICY authenticated_read_venture_capabilities
        ON public.venture_capabilities
        FOR SELECT
        TO authenticated
        USING (true);
      RAISE NOTICE 'PART 5a: Created authenticated SELECT on venture_capabilities';
    ELSE
      RAISE NOTICE 'PART 5a: authenticated SELECT already exists on venture_capabilities';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_skills') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'agent_skills'
      AND policyname = 'authenticated_read_agent_skills'
    ) THEN
      CREATE POLICY authenticated_read_agent_skills
        ON public.agent_skills
        FOR SELECT
        TO authenticated
        USING (true);
      RAISE NOTICE 'PART 5a: Created authenticated SELECT on agent_skills';
    ELSE
      RAISE NOTICE 'PART 5a: authenticated SELECT already exists on agent_skills';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_registry') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'agent_registry'
      AND policyname = 'authenticated_read_agent_registry'
    ) THEN
      CREATE POLICY authenticated_read_agent_registry
        ON public.agent_registry
        FOR SELECT
        TO authenticated
        USING (true);
      RAISE NOTICE 'PART 5a: Created authenticated SELECT on agent_registry';
    ELSE
      RAISE NOTICE 'PART 5a: authenticated SELECT already exists on agent_registry';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sd_capabilities') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'sd_capabilities'
      AND policyname = 'authenticated_read_sd_capabilities'
    ) THEN
      CREATE POLICY authenticated_read_sd_capabilities
        ON public.sd_capabilities
        FOR SELECT
        TO authenticated
        USING (true);
      RAISE NOTICE 'PART 5a: Created authenticated SELECT on sd_capabilities';
    ELSE
      RAISE NOTICE 'PART 5a: authenticated SELECT already exists on sd_capabilities';
    END IF;
  END IF;
END $$;

-- 5b. Underlying tables for v_chairman_pending_decisions
--     chairman_decisions, ventures, lifecycle_stage_config, venture_stage_decisions

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chairman_decisions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'chairman_decisions'
      AND policyname = 'authenticated_read_chairman_decisions'
    ) THEN
      -- Check for existing equivalent policy names from prior migrations
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'chairman_decisions'
        AND policyname = 'chairman_decisions_select_policy'
      ) THEN
        CREATE POLICY authenticated_read_chairman_decisions
          ON public.chairman_decisions
          FOR SELECT
          TO authenticated
          USING (true);
        RAISE NOTICE 'PART 5b: Created authenticated SELECT on chairman_decisions';
      ELSE
        RAISE NOTICE 'PART 5b: Equivalent SELECT policy already exists on chairman_decisions (chairman_decisions_select_policy)';
      END IF;
    ELSE
      RAISE NOTICE 'PART 5b: authenticated SELECT already exists on chairman_decisions';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ventures') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'ventures'
      AND policyname = 'authenticated_read_ventures'
    ) THEN
      -- Check for equivalent policies from prior migrations
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'ventures'
        AND policyname IN ('authenticated_read_ventures', 'Allow authenticated users to read ventures')
      ) THEN
        CREATE POLICY authenticated_read_ventures
          ON public.ventures
          FOR SELECT
          TO authenticated
          USING (true);
        RAISE NOTICE 'PART 5b: Created authenticated SELECT on ventures';
      ELSE
        RAISE NOTICE 'PART 5b: Equivalent SELECT policy already exists on ventures';
      END IF;
    ELSE
      RAISE NOTICE 'PART 5b: authenticated SELECT already exists on ventures';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lifecycle_stage_config') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'lifecycle_stage_config'
      AND policyname = 'authenticated_read_lifecycle_stage_config'
    ) THEN
      CREATE POLICY authenticated_read_lifecycle_stage_config
        ON public.lifecycle_stage_config
        FOR SELECT
        TO authenticated
        USING (true);
      RAISE NOTICE 'PART 5b: Created authenticated SELECT on lifecycle_stage_config';
    ELSE
      RAISE NOTICE 'PART 5b: authenticated SELECT already exists on lifecycle_stage_config';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venture_stage_decisions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'venture_stage_decisions'
      AND policyname = 'authenticated_read_venture_stage_decisions'
    ) THEN
      CREATE POLICY authenticated_read_venture_stage_decisions
        ON public.venture_stage_decisions
        FOR SELECT
        TO authenticated
        USING (true);
      RAISE NOTICE 'PART 5b: Created authenticated SELECT on venture_stage_decisions';
    ELSE
      RAISE NOTICE 'PART 5b: authenticated SELECT already exists on venture_stage_decisions';
    END IF;
  END IF;
END $$;


-- ============================================================================
-- VERIFICATION QUERIES (run manually to confirm)
-- ============================================================================

-- Verify PART 1 + 2 + 3: RLS enabled on all target tables
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'eva_interactions', 'app_rankings',
--     'leo_protocol_state', 'evidence_gate_mapping', 'skill_assessment_scores'
--   )
-- ORDER BY tablename;

-- Verify PART 1 + 2 + 3: Service role policies exist
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--     'eva_interactions', 'app_rankings',
--     'leo_protocol_state', 'evidence_gate_mapping', 'skill_assessment_scores'
--   )
-- ORDER BY tablename, policyname;

-- Verify PART 4: Views have security_invoker=on
-- SELECT c.relname AS view_name, c.reloptions
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'v'
--   AND c.relname IN (
--     'v_capability_ledger', 'v_skill_health', 'v_unified_capabilities',
--     'v_archived_ventures', 'v_active_sessions', 'v_active_ventures',
--     'v_orphan_visions', 'v_feedback_with_sensemaking',
--     'v_chairman_pending_decisions', 'v_scanner_capabilities'
--   )
-- ORDER BY c.relname;

-- Verify PART 5: Authenticated SELECT policies on underlying tables
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--     'venture_capabilities', 'agent_skills', 'agent_registry', 'sd_capabilities',
--     'chairman_decisions', 'ventures', 'lifecycle_stage_config', 'venture_stage_decisions'
--   )
--   AND cmd = 'SELECT'
-- ORDER BY tablename, policyname;

-- Verify no grants remain for anon/authenticated on service-only tables
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public'
--   AND table_name IN ('eva_interactions', 'app_rankings',
--     'leo_protocol_state', 'evidence_gate_mapping', 'skill_assessment_scores')
--   AND grantee IN ('anon', 'authenticated')
-- ORDER BY table_name, grantee;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- PART 1 rollback:
--   ALTER TABLE public.eva_interactions DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS service_role_full_access_eva_interactions ON eva_interactions;
--   GRANT ALL ON public.eva_interactions TO anon, authenticated;
--
-- PART 2 rollback:
--   DROP POLICY IF EXISTS service_role_full_access_app_rankings ON app_rankings;
--   CREATE POLICY "Service role full access on app_rankings" ON app_rankings
--     FOR ALL USING (true) WITH CHECK (true);  -- original defective form
--   GRANT ALL ON public.app_rankings TO anon, authenticated;
--
-- PART 3 rollback:
--   ALTER TABLE public.leo_protocol_state DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS service_role_full_access_leo_protocol_state ON leo_protocol_state;
--   ALTER TABLE public.evidence_gate_mapping DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS service_role_full_access_evidence_gate_mapping ON evidence_gate_mapping;
--   ALTER TABLE public.skill_assessment_scores DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS service_role_full_access_skill_assessment_scores ON skill_assessment_scores;
--
-- PART 4 rollback:
--   ALTER VIEW public.v_capability_ledger SET (security_invoker = off);
--   ALTER VIEW public.v_skill_health SET (security_invoker = off);
--   ALTER VIEW public.v_unified_capabilities SET (security_invoker = off);
--   ALTER VIEW public.v_archived_ventures SET (security_invoker = off);
--   ALTER VIEW public.v_active_sessions SET (security_invoker = off);
--   ALTER VIEW public.v_active_ventures SET (security_invoker = off);
--   ALTER VIEW public.v_orphan_visions SET (security_invoker = off);
--   ALTER VIEW public.v_feedback_with_sensemaking SET (security_invoker = off);
--   ALTER VIEW public.v_chairman_pending_decisions SET (security_invoker = off);
--   ALTER VIEW public.v_scanner_capabilities SET (security_invoker = off);
--
-- PART 5 rollback:
--   DROP POLICY IF EXISTS authenticated_read_venture_capabilities ON venture_capabilities;
--   DROP POLICY IF EXISTS authenticated_read_agent_skills ON agent_skills;
--   DROP POLICY IF EXISTS authenticated_read_agent_registry ON agent_registry;
--   DROP POLICY IF EXISTS authenticated_read_sd_capabilities ON sd_capabilities;
--   DROP POLICY IF EXISTS authenticated_read_chairman_decisions ON chairman_decisions;
--   DROP POLICY IF EXISTS authenticated_read_ventures ON ventures;
--   DROP POLICY IF EXISTS authenticated_read_lifecycle_stage_config ON lifecycle_stage_config;
--   DROP POLICY IF EXISTS authenticated_read_venture_stage_decisions ON venture_stage_decisions;
-- ============================================================================
