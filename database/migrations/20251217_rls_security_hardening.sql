-- ============================================================================
-- SD-HARDENING-V1-002: RLS Security Hardening (EHG_Engineer repo)
-- ============================================================================
-- Problem: Multiple tables have permissive RLS policies (anon access, USING(true))
-- Solution: Create fn_is_service_role() and harden policies for infrastructure access
--
-- Created: 2025-12-17
-- SD: SD-HARDENING-V1-002
-- ============================================================================

-- ============================================================================
-- STEP 1: Create fn_is_service_role() SECURITY DEFINER function
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_is_service_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $fn$
BEGIN
  RETURN current_setting('role', true) = 'service_role'
      OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role';
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$fn$;

COMMENT ON FUNCTION fn_is_service_role() IS
'SECURITY DEFINER function to identify service_role for RLS policies. Part of SD-HARDENING-V1-002.';

-- ============================================================================
-- STEP 2: Harden user_stories table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_stories') THEN
    -- Remove anon policies
    DROP POLICY IF EXISTS anon_insert_user_stories ON user_stories;
    DROP POLICY IF EXISTS anon_read_user_stories ON user_stories;
    DROP POLICY IF EXISTS "user_stories_service_role_access" ON user_stories;

    -- Create hardened policy
    CREATE POLICY "user_stories_service_role_access" ON user_stories
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened user_stories RLS policies';
  ELSE
    RAISE NOTICE 'Table user_stories not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Harden product_requirements_v2 table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_requirements_v2') THEN
    DROP POLICY IF EXISTS anon_insert_product_requirements_v2 ON product_requirements_v2;
    DROP POLICY IF EXISTS anon_read_product_requirements_v2 ON product_requirements_v2;
    DROP POLICY IF EXISTS "product_requirements_v2_service_role_access" ON product_requirements_v2;

    CREATE POLICY "product_requirements_v2_service_role_access" ON product_requirements_v2
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened product_requirements_v2 RLS policies';
  ELSE
    RAISE NOTICE 'Table product_requirements_v2 not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Harden strategic_directives_v2 table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategic_directives_v2') THEN
    DROP POLICY IF EXISTS anon_read_strategic_directives_v2 ON strategic_directives_v2;
    DROP POLICY IF EXISTS "strategic_directives_v2_service_role_access" ON strategic_directives_v2;

    CREATE POLICY "strategic_directives_v2_service_role_access" ON strategic_directives_v2
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened strategic_directives_v2 RLS policies';
  ELSE
    RAISE NOTICE 'Table strategic_directives_v2 not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Harden governance_audit_log table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'governance_audit_log') THEN
    DROP POLICY IF EXISTS anon_insert_governance_audit_log ON governance_audit_log;
    DROP POLICY IF EXISTS "governance_audit_log_service_role_access" ON governance_audit_log;

    CREATE POLICY "governance_audit_log_service_role_access" ON governance_audit_log
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened governance_audit_log RLS policies';
  ELSE
    RAISE NOTICE 'Table governance_audit_log not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 6: Harden leo_protocol_sections table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leo_protocol_sections') THEN
    DROP POLICY IF EXISTS anon_read_leo_protocol_sections ON leo_protocol_sections;
    DROP POLICY IF EXISTS "leo_protocol_sections_service_role_access" ON leo_protocol_sections;

    CREATE POLICY "leo_protocol_sections_service_role_access" ON leo_protocol_sections
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened leo_protocol_sections RLS policies';
  ELSE
    RAISE NOTICE 'Table leo_protocol_sections not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 7: Harden board_members table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_members') THEN
    DROP POLICY IF EXISTS "board_members_read_policy" ON board_members;
    DROP POLICY IF EXISTS "board_members_write_policy" ON board_members;
    DROP POLICY IF EXISTS "board_members_service_role_access" ON board_members;

    CREATE POLICY "board_members_service_role_access" ON board_members
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened board_members RLS policies';
  ELSE
    RAISE NOTICE 'Table board_members not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 8: Harden board_meetings table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_meetings') THEN
    DROP POLICY IF EXISTS "board_meetings_read_policy" ON board_meetings;
    DROP POLICY IF EXISTS "board_meetings_write_policy" ON board_meetings;
    DROP POLICY IF EXISTS "board_meetings_service_role_access" ON board_meetings;

    CREATE POLICY "board_meetings_service_role_access" ON board_meetings
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened board_meetings RLS policies';
  ELSE
    RAISE NOTICE 'Table board_meetings not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 9: Harden board_meeting_attendance table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_meeting_attendance') THEN
    DROP POLICY IF EXISTS "attendance_read_policy" ON board_meeting_attendance;
    DROP POLICY IF EXISTS "attendance_write_policy" ON board_meeting_attendance;
    DROP POLICY IF EXISTS "board_meeting_attendance_service_role_access" ON board_meeting_attendance;

    CREATE POLICY "board_meeting_attendance_service_role_access" ON board_meeting_attendance
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened board_meeting_attendance RLS policies';
  ELSE
    RAISE NOTICE 'Table board_meeting_attendance not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 10: Harden sd_phase_progress table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sd_phase_progress') THEN
    DROP POLICY IF EXISTS "Service role full access on sd_phase_progress" ON sd_phase_progress;
    DROP POLICY IF EXISTS "Authenticated users can read phase progress" ON sd_phase_progress;
    DROP POLICY IF EXISTS "Authenticated users can modify phase progress" ON sd_phase_progress;
    DROP POLICY IF EXISTS "sd_phase_progress_service_role_access" ON sd_phase_progress;

    CREATE POLICY "sd_phase_progress_service_role_access" ON sd_phase_progress
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened sd_phase_progress RLS policies';
  ELSE
    RAISE NOTICE 'Table sd_phase_progress not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 11: Harden raid_log table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'raid_log') THEN
    DROP POLICY IF EXISTS "raid_log_select_authenticated" ON raid_log;
    DROP POLICY IF EXISTS "raid_log_insert_authenticated" ON raid_log;
    DROP POLICY IF EXISTS "raid_log_update_authenticated" ON raid_log;
    DROP POLICY IF EXISTS "raid_log_service_role_access" ON raid_log;

    CREATE POLICY "raid_log_service_role_access" ON raid_log
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened raid_log RLS policies';
  ELSE
    RAISE NOTICE 'Table raid_log not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 12: Harden codebase_semantic_index table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'codebase_semantic_index') THEN
    DROP POLICY IF EXISTS "Allow authenticated read access to semantic index" ON codebase_semantic_index;
    DROP POLICY IF EXISTS "Allow service role full access to semantic index" ON codebase_semantic_index;
    DROP POLICY IF EXISTS "codebase_semantic_index_service_role_access" ON codebase_semantic_index;

    CREATE POLICY "codebase_semantic_index_service_role_access" ON codebase_semantic_index
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened codebase_semantic_index RLS policies';
  ELSE
    RAISE NOTICE 'Table codebase_semantic_index not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 13: Harden crewai_flow_templates table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crewai_flow_templates') THEN
    DROP POLICY IF EXISTS "templates_read_all" ON crewai_flow_templates;
    DROP POLICY IF EXISTS "templates_create_user" ON crewai_flow_templates;
    DROP POLICY IF EXISTS "crewai_flow_templates_service_role_access" ON crewai_flow_templates;

    CREATE POLICY "crewai_flow_templates_service_role_access" ON crewai_flow_templates
      FOR ALL TO authenticated
      USING (fn_is_service_role())
      WITH CHECK (fn_is_service_role());

    RAISE NOTICE 'Hardened crewai_flow_templates RLS policies';
  ELSE
    RAISE NOTICE 'Table crewai_flow_templates not found - skipping';
  END IF;
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SD-HARDENING-V1-002 Migration Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Created: fn_is_service_role() function';
  RAISE NOTICE 'Hardened RLS policies for LEO infrastructure tables';
  RAISE NOTICE 'Removed anon access from core tables';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- ROLLBACK SECTION
-- ============================================================================
-- To rollback: DROP FUNCTION IF EXISTS fn_is_service_role();
-- Then recreate original policies from migration files
-- ============================================================================
