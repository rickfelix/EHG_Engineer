#!/usr/bin/env node
/**
 * Add User Stories for SD-HARDENING-V1-001
 * RLS Security Hardening (ehg repo)
 *
 * Creates user stories for hardening Row Level Security policies to prevent
 * unauthorized access to chairman-only data.
 *
 * Functional Requirements Mapping:
 * - FR-1: Create fn_is_chairman() function → US-001
 * - FR-2: Harden chairman_decisions RLS → US-002
 * - FR-3: Harden venture_decisions RLS → US-003
 * - FR-4: Scope venture_artifacts RLS → US-004
 * - FR-5: Scope venture_stage_work RLS → US-005
 * - FR-6: Create RLS regression tests → US-006
 *
 * Security Context:
 * CRITICAL FINDING: chairman_unified_decisions.sql migration uses USING(true)
 * for authenticated users, exposing sensitive executive decisions to ANY logged-in user.
 *
 * Issues:
 * 1. chairman_decisions: INSERT policy has WITH CHECK (true)
 * 2. venture_artifacts: SELECT/MODIFY policies use USING(true)
 * 3. venture_stage_work: All operations use USING(true)
 *
 * Migration to Fix:
 * - supabase/migrations/20251216000001_chairman_unified_decisions.sql
 *
 * Expected Outcome:
 * - fn_is_chairman() returns true only for chairman (Rick)
 * - chairman_decisions accessible only to chairman
 * - venture_* tables scoped by company/venture ownership
 * - RLS regression test suite prevents future regressions
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-HARDENING-V1-001';
const PRD_ID = 'PRD-SD-HARDENING-V1-001';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
const userStories = [
  {
    story_key: 'SD-HARDENING-V1-001:US-001',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Create fn_is_chairman() database function for RLS policies',
    user_role: 'System',
    user_want: 'A reusable database function that identifies the chairman user for RLS policies',
    user_benefit: 'RLS policies can consistently check chairman access across all chairman-only tables',
    priority: 'critical',
    story_points: 2,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Function creation - Happy path',
        given: 'Migration file is executed',
        when: 'fn_is_chairman() function is created',
        then: 'Function exists in database AND is marked as SECURITY DEFINER AND has proper comment documentation'
      },
      {
        id: 'AC-001-2',
        scenario: 'Chairman user identification - Rick',
        given: 'User is authenticated as chairman (Rick, email from config)',
        when: 'fn_is_chairman() is called',
        then: 'Returns TRUE'
      },
      {
        id: 'AC-001-3',
        scenario: 'Non-chairman user identification',
        given: 'User is authenticated as regular user (not Rick)',
        when: 'fn_is_chairman() is called',
        then: 'Returns FALSE'
      },
      {
        id: 'AC-001-4',
        scenario: 'Anonymous user handling',
        given: 'User is not authenticated (anonymous)',
        when: 'fn_is_chairman() is called',
        then: 'Returns FALSE'
      },
      {
        id: 'AC-001-5',
        scenario: 'Service role handling',
        given: 'Query executed with service role key',
        when: 'fn_is_chairman() is called',
        then: 'Returns TRUE (service role bypasses RLS for admin operations)'
      }
    ],
    definition_of_done: [
      'Migration file created: supabase/migrations/YYYYMMDD_create_fn_is_chairman.sql',
      'fn_is_chairman() function created with SECURITY DEFINER',
      'Function checks auth.uid() against chairman email/user_id',
      'Function returns boolean (TRUE for chairman, FALSE otherwise)',
      'Migration applied to local database',
      'Function tested with chairman and non-chairman users',
      'Documentation added to function via COMMENT ON FUNCTION'
    ],
    technical_notes: 'Use SECURITY DEFINER to ensure function runs with elevated privileges. Check auth.uid() or auth.email() against known chairman identifier. Consider using environment variable or config table for chairman email.',
    implementation_approach: 'Create migration file. Define function with SECURITY DEFINER. Query auth.jwt() or auth.uid() to get current user. Compare against chairman identifier (email or user_id). Return boolean result.',
    implementation_context: 'This function is the foundation for all chairman-only RLS policies. Must be performant (called frequently). Must be secure (cannot be spoofed). Critical for security hardening.',
    architecture_references: [
      'supabase/migrations/20251216000001_chairman_unified_decisions.sql - Original migration to fix',
      'database/schema/engineer/tables/chairman_decisions.md - Chairman decisions schema',
      'docs/reference/database-agent-patterns.md - RLS patterns'
    ],
    example_code_patterns: {
      migration_sql: `-- Migration: Create fn_is_chairman() function
-- Purpose: Identify chairman user for RLS policies
-- Security: SECURITY DEFINER to access auth schema

CREATE OR REPLACE FUNCTION fn_is_chairman()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_email TEXT;
  chairman_email TEXT := 'rick@example.com'; -- TODO: Replace with actual chairman email
BEGIN
  -- Get current user's email from auth
  SELECT email INTO current_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Return TRUE if current user is chairman
  RETURN current_email = chairman_email;
EXCEPTION
  WHEN OTHERS THEN
    -- If any error (unauthenticated, etc), return FALSE
    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION fn_is_chairman() IS
  'Returns TRUE if the current user is the chairman (Rick), FALSE otherwise. Used by RLS policies to restrict chairman-only data.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION fn_is_chairman() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_is_chairman() TO service_role;`,
      test_query: `-- Test fn_is_chairman() function
-- Run as chairman user:
SELECT fn_is_chairman(); -- Should return TRUE

-- Run as regular user:
SELECT fn_is_chairman(); -- Should return FALSE

-- Test in RLS policy context:
SELECT *
FROM chairman_decisions
WHERE fn_is_chairman(); -- Should return rows only for chairman`
    },
    testing_scenarios: [
      { scenario: 'Function returns TRUE for chairman user', type: 'integration', priority: 'P0' },
      { scenario: 'Function returns FALSE for non-chairman user', type: 'integration', priority: 'P0' },
      { scenario: 'Function returns FALSE for anonymous user', type: 'integration', priority: 'P1' },
      { scenario: 'Function performance (<10ms)', type: 'performance', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/rls/US-001-fn-is-chairman.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V1-001:US-002',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Harden chairman_decisions RLS policies using fn_is_chairman()',
    user_role: 'Chairman',
    user_want: 'Only I can view and create decisions in chairman_decisions table',
    user_benefit: 'My sensitive executive decisions are protected from unauthorized access',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'SELECT policy - Chairman access',
        given: 'Chairman is authenticated AND chairman_decisions has rows',
        when: 'Chairman queries SELECT * FROM chairman_decisions',
        then: 'All rows returned successfully'
      },
      {
        id: 'AC-002-2',
        scenario: 'SELECT policy - Regular user blocked',
        given: 'Regular user is authenticated AND chairman_decisions has rows',
        when: 'User queries SELECT * FROM chairman_decisions',
        then: 'Zero rows returned (RLS blocks access) AND no error shown'
      },
      {
        id: 'AC-002-3',
        scenario: 'INSERT policy - Chairman can create',
        given: 'Chairman is authenticated',
        when: 'Chairman inserts new decision',
        then: 'Decision created successfully'
      },
      {
        id: 'AC-002-4',
        scenario: 'INSERT policy - Regular user blocked',
        given: 'Regular user is authenticated',
        when: 'User attempts to insert decision',
        then: 'INSERT fails with RLS policy violation error'
      },
      {
        id: 'AC-002-5',
        scenario: 'UPDATE policy - Chairman can modify',
        given: 'Chairman is authenticated AND decision exists',
        when: 'Chairman updates decision',
        then: 'Decision updated successfully'
      },
      {
        id: 'AC-002-6',
        scenario: 'DELETE policy - Chairman can delete',
        given: 'Chairman is authenticated AND decision exists',
        when: 'Chairman deletes decision',
        then: 'Decision deleted successfully'
      }
    ],
    definition_of_done: [
      'Migration file created: supabase/migrations/YYYYMMDD_harden_chairman_decisions_rls.sql',
      'All RLS policies updated to use fn_is_chairman()',
      'USING clause: fn_is_chairman() for SELECT/UPDATE/DELETE',
      'WITH CHECK clause: fn_is_chairman() for INSERT/UPDATE',
      'Old USING(true) policies dropped',
      'Migration applied to local database',
      'RLS policies tested with both chairman and regular users',
      'Documentation updated with new RLS approach'
    ],
    technical_notes: 'Replace all USING(true) with USING(fn_is_chairman()). Apply to SELECT, INSERT, UPDATE, DELETE policies. Ensure WITH CHECK also uses fn_is_chairman() to prevent privilege escalation.',
    implementation_approach: 'Create migration file. Drop existing chairman_decisions RLS policies. Create new policies using fn_is_chairman(). Test with multiple user contexts. Verify no data leakage.',
    implementation_context: 'This fixes the CRITICAL security vulnerability where any authenticated user could access chairman decisions. Must maintain backward compatibility for legitimate chairman operations.',
    architecture_references: [
      'supabase/migrations/20251216000001_chairman_unified_decisions.sql - Original vulnerable migration',
      'database/schema/engineer/tables/chairman_decisions.md - Chairman decisions schema',
      'US-001 - fn_is_chairman() function dependency'
    ],
    example_code_patterns: {
      migration_sql: `-- Migration: Harden chairman_decisions RLS policies
-- Fixes: CRITICAL vulnerability allowing any authenticated user access
-- Approach: Replace USING(true) with fn_is_chairman()

-- Drop existing policies (created by chairman_unified_decisions.sql)
DROP POLICY IF EXISTS "chairman_decisions_select_policy" ON chairman_decisions;
DROP POLICY IF EXISTS "chairman_decisions_insert_policy" ON chairman_decisions;
DROP POLICY IF EXISTS "chairman_decisions_update_policy" ON chairman_decisions;
DROP POLICY IF EXISTS "chairman_decisions_delete_policy" ON chairman_decisions;

-- Create hardened policies using fn_is_chairman()
CREATE POLICY "chairman_decisions_select_policy"
  ON chairman_decisions
  FOR SELECT
  USING (fn_is_chairman());

CREATE POLICY "chairman_decisions_insert_policy"
  ON chairman_decisions
  FOR INSERT
  WITH CHECK (fn_is_chairman());

CREATE POLICY "chairman_decisions_update_policy"
  ON chairman_decisions
  FOR UPDATE
  USING (fn_is_chairman())
  WITH CHECK (fn_is_chairman());

CREATE POLICY "chairman_decisions_delete_policy"
  ON chairman_decisions
  FOR DELETE
  USING (fn_is_chairman());

-- Ensure RLS is enabled
ALTER TABLE chairman_decisions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE chairman_decisions IS
  'Chairman-only decisions. RLS enforced via fn_is_chairman() to prevent unauthorized access.';`,
      test_query: `-- Test chairman_decisions RLS hardening
-- Run as chairman:
SELECT COUNT(*) FROM chairman_decisions; -- Should return actual count

-- Run as regular user:
SELECT COUNT(*) FROM chairman_decisions; -- Should return 0

-- Test INSERT as regular user (should fail):
INSERT INTO chairman_decisions (decision_type, title, description)
VALUES ('test', 'Test Decision', 'Should fail');
-- Expected: ERROR: new row violates row-level security policy`
    },
    testing_scenarios: [
      { scenario: 'Chairman can SELECT all decisions', type: 'e2e', priority: 'P0' },
      { scenario: 'Regular user gets zero rows on SELECT', type: 'e2e', priority: 'P0' },
      { scenario: 'Regular user INSERT blocked by RLS', type: 'e2e', priority: 'P0' },
      { scenario: 'Chairman can INSERT/UPDATE/DELETE', type: 'e2e', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/rls/US-002-chairman-decisions-rls.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V1-001:US-003',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Harden venture_decisions RLS policies with venture ownership check',
    user_role: 'User',
    user_want: 'Only see venture decisions for ventures I own or am assigned to',
    user_benefit: 'My venture decisions are private and not visible to other users',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'SELECT policy - Owner access',
        given: 'User owns venture V1 with decisions',
        when: 'User queries SELECT * FROM venture_decisions',
        then: 'Returns only decisions for V1 AND does not return other ventures\' decisions'
      },
      {
        id: 'AC-003-2',
        scenario: 'SELECT policy - Chairman access',
        given: 'Chairman is authenticated AND venture_decisions has rows for all ventures',
        when: 'Chairman queries SELECT * FROM venture_decisions',
        then: 'Returns all venture decisions (chairman sees everything)'
      },
      {
        id: 'AC-003-3',
        scenario: 'INSERT policy - Owner can create',
        given: 'User owns venture V1',
        when: 'User inserts decision for V1',
        then: 'Decision created successfully'
      },
      {
        id: 'AC-003-4',
        scenario: 'INSERT policy - Cannot create for others venture',
        given: 'User does not own venture V2',
        when: 'User attempts to insert decision for V2',
        then: 'INSERT fails with RLS policy violation'
      },
      {
        id: 'AC-003-5',
        scenario: 'UPDATE policy - Owner can modify own',
        given: 'User owns venture V1 with decision D1',
        when: 'User updates D1',
        then: 'Decision updated successfully'
      },
      {
        id: 'AC-003-6',
        scenario: 'DELETE policy - Owner can delete own',
        given: 'User owns venture V1 with decision D1',
        when: 'User deletes D1',
        then: 'Decision deleted successfully'
      }
    ],
    definition_of_done: [
      'Migration file created: supabase/migrations/YYYYMMDD_harden_venture_decisions_rls.sql',
      'RLS policies check venture ownership via ventures table',
      'SELECT policy: (venture_id IN user_ventures) OR fn_is_chairman()',
      'INSERT/UPDATE/DELETE policies enforce ownership',
      'Old USING(true) policies dropped',
      'Migration applied to local database',
      'RLS tested with multiple users and ventures',
      'Documentation updated'
    ],
    technical_notes: 'Check venture ownership by joining to ventures table or using subquery. Allow chairman override via fn_is_chairman(). Consider performance with large venture counts.',
    implementation_approach: 'Create migration. Drop existing policies. Create new policies with ownership check: venture_id IN (SELECT id FROM ventures WHERE user_id = auth.uid()). Add OR fn_is_chairman() for chairman access.',
    implementation_context: 'Venture decisions should be scoped by venture ownership, not globally accessible. Chairman needs visibility for governance. Must prevent cross-venture data leakage.',
    architecture_references: [
      'database/schema/engineer/tables/venture_decisions.md - Venture decisions schema',
      'database/schema/engineer/tables/ventures.md - Ventures table for ownership',
      'US-001 - fn_is_chairman() function dependency'
    ],
    example_code_patterns: {
      migration_sql: `-- Migration: Harden venture_decisions RLS policies
-- Approach: Scope by venture ownership + chairman override

DROP POLICY IF EXISTS "venture_decisions_select_policy" ON venture_decisions;
DROP POLICY IF EXISTS "venture_decisions_insert_policy" ON venture_decisions;
DROP POLICY IF EXISTS "venture_decisions_update_policy" ON venture_decisions;
DROP POLICY IF EXISTS "venture_decisions_delete_policy" ON venture_decisions;

-- SELECT: Users see their ventures + chairman sees all
CREATE POLICY "venture_decisions_select_policy"
  ON venture_decisions
  FOR SELECT
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures
      WHERE user_id = auth.uid()
      OR company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

-- INSERT: Users can only create for their ventures
CREATE POLICY "venture_decisions_insert_policy"
  ON venture_decisions
  FOR INSERT
  WITH CHECK (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update their ventures
CREATE POLICY "venture_decisions_update_policy"
  ON venture_decisions
  FOR UPDATE
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete their ventures
CREATE POLICY "venture_decisions_delete_policy"
  ON venture_decisions
  FOR DELETE
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

ALTER TABLE venture_decisions ENABLE ROW LEVEL SECURITY;`,
      test_query: `-- Test venture_decisions RLS scoping
-- Run as user1 who owns venture V1:
SELECT COUNT(*) FROM venture_decisions; -- Should return count for V1 only

-- Run as user2 who owns venture V2:
SELECT COUNT(*) FROM venture_decisions; -- Should return count for V2 only

-- Run as chairman:
SELECT COUNT(*) FROM venture_decisions; -- Should return all decisions`
    },
    testing_scenarios: [
      { scenario: 'User sees only their venture decisions', type: 'e2e', priority: 'P0' },
      { scenario: 'Chairman sees all venture decisions', type: 'e2e', priority: 'P0' },
      { scenario: 'User cannot INSERT for other ventures', type: 'e2e', priority: 'P0' },
      { scenario: 'User can UPDATE/DELETE own venture decisions', type: 'e2e', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/rls/US-003-venture-decisions-rls.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V1-001:US-004',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Scope venture_artifacts RLS policies by venture ownership',
    user_role: 'User',
    user_want: 'Only access artifacts (PRDs, schemas, docs) for my ventures',
    user_benefit: 'My venture documentation is private and secure',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'SELECT policy - Owner access',
        given: 'User owns venture V1 with artifacts',
        when: 'User queries SELECT * FROM venture_artifacts',
        then: 'Returns only artifacts for V1'
      },
      {
        id: 'AC-004-2',
        scenario: 'SELECT policy - Chairman access',
        given: 'Chairman is authenticated',
        when: 'Chairman queries SELECT * FROM venture_artifacts',
        then: 'Returns all artifacts for all ventures'
      },
      {
        id: 'AC-004-3',
        scenario: 'INSERT policy - Owner can create',
        given: 'User owns venture V1',
        when: 'User creates artifact for V1',
        then: 'Artifact created successfully'
      },
      {
        id: 'AC-004-4',
        scenario: 'INSERT policy - Blocked for other ventures',
        given: 'User does not own venture V2',
        when: 'User attempts to create artifact for V2',
        then: 'INSERT fails with RLS violation'
      },
      {
        id: 'AC-004-5',
        scenario: 'UPDATE/DELETE policies - Owner only',
        given: 'User owns venture V1 with artifact A1',
        when: 'User updates or deletes A1',
        then: 'Operation succeeds'
      }
    ],
    definition_of_done: [
      'Migration file created: supabase/migrations/YYYYMMDD_scope_venture_artifacts_rls.sql',
      'All USING(true) policies replaced with venture ownership checks',
      'Policies check: venture_id IN user_ventures OR fn_is_chairman()',
      'RLS enabled on venture_artifacts table',
      'Migration applied and tested',
      'Documentation updated'
    ],
    technical_notes: 'Similar pattern to venture_decisions (US-003). Join to ventures table for ownership. Chairman override via fn_is_chairman(). Consider artifact_type filtering if needed.',
    implementation_approach: 'Create migration. Drop USING(true) policies. Create new policies with ownership check. Test with multiple users. Verify artifacts are scoped correctly.',
    implementation_context: 'Venture artifacts contain sensitive PRD and schema information. Must prevent cross-venture access while allowing chairman visibility for governance.',
    architecture_references: [
      'supabase/migrations/20251216000001_chairman_unified_decisions.sql - Original vulnerable policies',
      'database/schema/engineer/tables/venture_artifacts.md - Artifacts schema',
      'US-003 - Similar RLS pattern for venture_decisions'
    ],
    example_code_patterns: {
      migration_sql: `-- Migration: Scope venture_artifacts RLS by ownership
DROP POLICY IF EXISTS "venture_artifacts_select_policy" ON venture_artifacts;
DROP POLICY IF EXISTS "venture_artifacts_insert_policy" ON venture_artifacts;
DROP POLICY IF EXISTS "venture_artifacts_update_policy" ON venture_artifacts;
DROP POLICY IF EXISTS "venture_artifacts_delete_policy" ON venture_artifacts;

-- SELECT: Users see their ventures + chairman sees all
CREATE POLICY "venture_artifacts_select_policy"
  ON venture_artifacts
  FOR SELECT
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- INSERT: Users create for their ventures only
CREATE POLICY "venture_artifacts_insert_policy"
  ON venture_artifacts
  FOR INSERT
  WITH CHECK (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users modify their ventures only
CREATE POLICY "venture_artifacts_update_policy"
  ON venture_artifacts
  FOR UPDATE
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- DELETE: Users delete their ventures only
CREATE POLICY "venture_artifacts_delete_policy"
  ON venture_artifacts
  FOR DELETE
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

ALTER TABLE venture_artifacts ENABLE ROW LEVEL SECURITY;`,
      test_query: `-- Test venture_artifacts RLS scoping
-- Run as user who owns V1:
SELECT artifact_type, COUNT(*)
FROM venture_artifacts
GROUP BY artifact_type;
-- Should return counts only for V1 artifacts

-- Verify chairman access:
-- Run as chairman:
SELECT COUNT(*) FROM venture_artifacts;
-- Should return all artifacts across all ventures`
    },
    testing_scenarios: [
      { scenario: 'User sees only their venture artifacts', type: 'e2e', priority: 'P0' },
      { scenario: 'Chairman sees all venture artifacts', type: 'e2e', priority: 'P0' },
      { scenario: 'User cannot access other ventures artifacts', type: 'e2e', priority: 'P0' }
    ],
    e2e_test_path: 'tests/e2e/rls/US-004-venture-artifacts-rls.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V1-001:US-005',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Scope venture_stage_work RLS policies by venture ownership',
    user_role: 'User',
    user_want: 'Only access stage work (LEAD, PLAN, EXEC tasks) for my ventures',
    user_benefit: 'My venture workflow and task data is private',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'SELECT policy - Owner access',
        given: 'User owns venture V1 with stage work records',
        when: 'User queries SELECT * FROM venture_stage_work',
        then: 'Returns only stage work for V1'
      },
      {
        id: 'AC-005-2',
        scenario: 'SELECT policy - Chairman access',
        given: 'Chairman is authenticated',
        when: 'Chairman queries SELECT * FROM venture_stage_work',
        then: 'Returns all stage work for all ventures'
      },
      {
        id: 'AC-005-3',
        scenario: 'INSERT policy - Owner can create',
        given: 'User owns venture V1',
        when: 'User creates stage work record for V1',
        then: 'Record created successfully'
      },
      {
        id: 'AC-005-4',
        scenario: 'INSERT policy - Blocked for other ventures',
        given: 'User does not own venture V2',
        when: 'User attempts to create stage work for V2',
        then: 'INSERT fails with RLS violation'
      },
      {
        id: 'AC-005-5',
        scenario: 'UPDATE/DELETE policies - Owner only',
        given: 'User owns venture V1 with stage work W1',
        when: 'User updates or deletes W1',
        then: 'Operation succeeds'
      }
    ],
    definition_of_done: [
      'Migration file created: supabase/migrations/YYYYMMDD_scope_venture_stage_work_rls.sql',
      'All USING(true) policies replaced with venture ownership checks',
      'Policies check: venture_id IN user_ventures OR fn_is_chairman()',
      'RLS enabled on venture_stage_work table',
      'Migration applied and tested',
      'Documentation updated'
    ],
    technical_notes: 'Same pattern as US-003 and US-004. Scope by venture ownership. Allow chairman override. Ensure performance with indexes on venture_id.',
    implementation_approach: 'Create migration. Drop USING(true) policies. Create new policies with ownership check. Test with multiple users and stages (LEAD, PLAN, EXEC).',
    implementation_context: 'Venture stage work tracks LEO protocol execution. Contains workflow state and task assignments. Must be scoped by venture to prevent cross-venture visibility.',
    architecture_references: [
      'supabase/migrations/20251216000001_chairman_unified_decisions.sql - Original vulnerable policies',
      'database/schema/engineer/tables/venture_stage_work.md - Stage work schema',
      'docs/02_api/leo-protocol.md - LEO workflow stages'
    ],
    example_code_patterns: {
      migration_sql: `-- Migration: Scope venture_stage_work RLS by ownership
DROP POLICY IF EXISTS "venture_stage_work_select_policy" ON venture_stage_work;
DROP POLICY IF EXISTS "venture_stage_work_insert_policy" ON venture_stage_work;
DROP POLICY IF EXISTS "venture_stage_work_update_policy" ON venture_stage_work;
DROP POLICY IF EXISTS "venture_stage_work_delete_policy" ON venture_stage_work;

-- SELECT: Users see their ventures + chairman sees all
CREATE POLICY "venture_stage_work_select_policy"
  ON venture_stage_work
  FOR SELECT
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- INSERT: Users create for their ventures only
CREATE POLICY "venture_stage_work_insert_policy"
  ON venture_stage_work
  FOR INSERT
  WITH CHECK (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users modify their ventures only
CREATE POLICY "venture_stage_work_update_policy"
  ON venture_stage_work
  FOR UPDATE
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

-- DELETE: Users delete their ventures only
CREATE POLICY "venture_stage_work_delete_policy"
  ON venture_stage_work
  FOR DELETE
  USING (
    fn_is_chairman() OR
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

ALTER TABLE venture_stage_work ENABLE ROW LEVEL SECURITY;`,
      test_query: `-- Test venture_stage_work RLS scoping
-- Run as user who owns V1:
SELECT stage, status, COUNT(*)
FROM venture_stage_work
WHERE venture_id IN (SELECT id FROM ventures WHERE user_id = auth.uid())
GROUP BY stage, status;
-- Should return counts only for V1

-- Verify no cross-venture access:
SELECT COUNT(*) FROM venture_stage_work;
-- Should return only V1 stage work count, not all ventures`
    },
    testing_scenarios: [
      { scenario: 'User sees only their venture stage work', type: 'e2e', priority: 'P0' },
      { scenario: 'Chairman sees all venture stage work', type: 'e2e', priority: 'P0' },
      { scenario: 'User cannot access other ventures stage work', type: 'e2e', priority: 'P0' }
    ],
    e2e_test_path: 'tests/e2e/rls/US-005-venture-stage-work-rls.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V1-001:US-006',
    prd_id: null,
    sd_id: SD_ID,
    title: 'Create comprehensive RLS regression test suite',
    user_role: 'Developer',
    user_want: 'Automated tests that validate RLS policies prevent unauthorized access',
    user_benefit: 'RLS policies are verified and future regressions are caught before production',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Test framework setup',
        given: 'Test suite is created',
        when: 'Tests are executed',
        then: 'Tests run against local Supabase instance AND use test user accounts (chairman, user1, user2)'
      },
      {
        id: 'AC-006-2',
        scenario: 'chairman_decisions RLS tests',
        given: 'Tests for chairman_decisions table',
        when: 'Tests run',
        then: 'Validates chairman SELECT access AND validates regular user blocked AND validates INSERT/UPDATE/DELETE policies'
      },
      {
        id: 'AC-006-3',
        scenario: 'venture_decisions RLS tests',
        given: 'Tests for venture_decisions table',
        when: 'Tests run',
        then: 'Validates owner sees only their decisions AND validates chairman sees all AND validates cross-venture blocking'
      },
      {
        id: 'AC-006-4',
        scenario: 'venture_artifacts RLS tests',
        given: 'Tests for venture_artifacts table',
        when: 'Tests run',
        then: 'Validates owner access scoping AND validates chairman access AND validates artifact creation/modification'
      },
      {
        id: 'AC-006-5',
        scenario: 'venture_stage_work RLS tests',
        given: 'Tests for venture_stage_work table',
        when: 'Tests run',
        then: 'Validates owner access scoping AND validates chairman access AND validates stage work isolation'
      },
      {
        id: 'AC-006-6',
        scenario: 'fn_is_chairman() function tests',
        given: 'Tests for fn_is_chairman()',
        when: 'Tests run',
        then: 'Validates chairman returns TRUE AND validates regular user returns FALSE AND validates anonymous returns FALSE'
      },
      {
        id: 'AC-006-7',
        scenario: 'Test data cleanup',
        given: 'Tests complete',
        when: 'Teardown runs',
        then: 'All test data removed AND test users cleaned up AND database state reset'
      }
    ],
    definition_of_done: [
      'Test suite created: tests/e2e/rls/rls-security-regression.spec.ts',
      'Test utilities for user context switching (chairman, user1, user2)',
      'Test data factories for ventures, decisions, artifacts, stage_work',
      'Tests for all 5 tables: chairman_decisions, venture_decisions, venture_artifacts, venture_stage_work, fn_is_chairman()',
      'Tests cover: SELECT, INSERT, UPDATE, DELETE for each table',
      'Tests validate both positive (allowed) and negative (blocked) cases',
      'CI integration: Tests run on every PR',
      'Documentation: docs/testing/rls-regression-tests.md'
    ],
    technical_notes: 'Use Playwright or Jest with Supabase JS client. Create test users with different roles. Use service role to setup test data. Switch auth context for RLS validation. Assert row counts and error messages.',
    implementation_approach: 'Create test file structure. Build test utilities (createTestUser, createTestVenture, switchAuthContext). Write test cases for each table. Validate RLS enforcement. Add CI workflow. Document test patterns.',
    implementation_context: 'RLS regression tests are critical for preventing future security vulnerabilities. Must catch any accidental USING(true) policies. Should run automatically on every code change.',
    architecture_references: [
      'tests/e2e/ - E2E test directory structure',
      'docs/reference/qa-director-guide.md - Testing patterns',
      'US-001 through US-005 - RLS policies to test'
    ],
    example_code_patterns: {
      test_suite_structure: `// tests/e2e/rls/rls-security-regression.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test user contexts
let chairmanClient: SupabaseClient;
let user1Client: SupabaseClient;
let user2Client: SupabaseClient;
let serviceClient: SupabaseClient;

test.describe('RLS Security Regression Tests', () => {
  test.beforeAll(async () => {
    // Setup test users and clients
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create test users (chairman, user1, user2)
    // Setup test ventures and data
  });

  test.describe('chairman_decisions RLS', () => {
    test('chairman can SELECT all decisions', async () => {
      const { data, error } = await chairmanClient
        .from('chairman_decisions')
        .select('*');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThan(0);
    });

    test('regular user gets zero rows on SELECT', async () => {
      const { data, error } = await user1Client
        .from('chairman_decisions')
        .select('*');

      expect(error).toBeNull();
      expect(data.length).toBe(0); // RLS blocks access
    });

    test('regular user INSERT blocked', async () => {
      const { data, error } = await user1Client
        .from('chairman_decisions')
        .insert({
          decision_type: 'test',
          title: 'Unauthorized Decision',
          description: 'Should fail'
        });

      expect(error).not.toBeNull();
      expect(error.message).toContain('row-level security policy');
    });
  });

  test.describe('venture_decisions RLS', () => {
    let venture1Id: string;
    let venture2Id: string;

    test.beforeAll(async () => {
      // Create test ventures owned by user1 and user2
      const { data: v1 } = await serviceClient
        .from('ventures')
        .insert({ name: 'User1 Venture', user_id: user1Id })
        .select()
        .single();
      venture1Id = v1.id;

      const { data: v2 } = await serviceClient
        .from('ventures')
        .insert({ name: 'User2 Venture', user_id: user2Id })
        .select()
        .single();
      venture2Id = v2.id;

      // Create decisions for each venture
      await serviceClient.from('venture_decisions').insert([
        { venture_id: venture1Id, title: 'Decision for V1' },
        { venture_id: venture2Id, title: 'Decision for V2' }
      ]);
    });

    test('user1 sees only their venture decisions', async () => {
      const { data } = await user1Client
        .from('venture_decisions')
        .select('*');

      expect(data.length).toBe(1);
      expect(data[0].venture_id).toBe(venture1Id);
    });

    test('user1 cannot see user2 decisions', async () => {
      const { data } = await user1Client
        .from('venture_decisions')
        .select('*')
        .eq('venture_id', venture2Id);

      expect(data.length).toBe(0); // RLS blocks
    });

    test('chairman sees all venture decisions', async () => {
      const { data } = await chairmanClient
        .from('venture_decisions')
        .select('*');

      expect(data.length).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('fn_is_chairman() function', () => {
    test('returns TRUE for chairman', async () => {
      const { data } = await chairmanClient
        .rpc('fn_is_chairman');

      expect(data).toBe(true);
    });

    test('returns FALSE for regular user', async () => {
      const { data } = await user1Client
        .rpc('fn_is_chairman');

      expect(data).toBe(false);
    });
  });

  test.afterAll(async () => {
    // Cleanup test data
    await serviceClient.from('venture_decisions').delete().neq('id', '');
    await serviceClient.from('ventures').delete().neq('id', '');
    // Delete test users
  });
});`,
      ci_workflow: `# .github/workflows/rls-tests.yml
name: RLS Security Tests

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'database/schema/**'
      - 'tests/e2e/rls/**'

jobs:
  rls-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Start Supabase
        run: npx supabase start

      - name: Run RLS regression tests
        run: npm run test:rls
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: rls-test-results
          path: test-results/`
    },
    testing_scenarios: [
      { scenario: 'All RLS policies validated for chairman_decisions', type: 'e2e', priority: 'P0' },
      { scenario: 'All RLS policies validated for venture tables', type: 'e2e', priority: 'P0' },
      { scenario: 'Cross-venture access blocked', type: 'e2e', priority: 'P0' },
      { scenario: 'fn_is_chairman() behavior validated', type: 'integration', priority: 'P0' },
      { scenario: 'Tests run successfully in CI', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/rls/US-006-rls-regression-suite.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log(`📚 Adding ${userStories.length} user stories for ${SD_ID} to database...\n`);

  try {
    // Verify SD exists (support both UUID and legacy_id)
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, sd_key, title')
      .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID},sd_key.eq.${SD_ID}`)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${SD_ID} not found in database`);
      console.log('   Error:', sdError?.message);
      console.log('   Create SD first before adding user stories');
      process.exit(1);
    }

    // Use the UUID for foreign key references
    const sdUuid = sdData.id;

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   UUID: ${sdUuid}`);
    console.log(`   Legacy ID: ${sdData.legacy_id || 'N/A'}\n`);

    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    for (const story of userStories) {
      try {
        // Check if story already exists
        const { data: existing } = await supabase
          .from('user_stories')
          .select('story_key')
          .eq('story_key', story.story_key)
          .single();

        if (existing) {
          console.log(`⚠️  ${story.story_key} already exists, skipping...`);
          skipCount++;
          continue;
        }

        // Use UUID for sd_id foreign key
        const storyWithUuid = {
          ...story,
          sd_id: sdUuid  // Replace string SD_ID with actual UUID
        };

        const { data, error } = await supabase
          .from('user_stories')
          .insert(storyWithUuid)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error adding ${story.story_key}:`, error.message);
          console.error(`   Code: ${error.code}, Details: ${error.details}`);
          errorCount++;
        } else {
          console.log(`✅ Added ${story.story_key}: ${story.title}`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Exception adding ${story.story_key}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Success: ${successCount}/${userStories.length}`);
    console.log(`   Skipped: ${skipCount}/${userStories.length}`);
    console.log(`   Errors: ${errorCount}/${userStories.length}`);

    if (errorCount === 0 && successCount > 0) {
      console.log('\n✨ All user stories added successfully for SD-HARDENING-V1-001!');
      console.log('\n📋 Next Steps:');
      console.log(`   1. Review stories: SELECT * FROM user_stories WHERE sd_id = '${sdUuid}'`);
      console.log('   2. Validate INVEST criteria: npm run stories:validate');
      console.log(`   3. Create PRD: npm run prd:create ${SD_ID}`);
      console.log('   4. Begin EXEC implementation');
      console.log('\n📐 Implementation Order:');
      console.log('   Phase 1 (Foundation): US-001 (fn_is_chairman)');
      console.log('   Phase 2 (Chairman): US-002 (chairman_decisions RLS)');
      console.log('   Phase 3 (Ventures): US-003, US-004, US-005 (venture tables RLS)');
      console.log('   Phase 4 (Validation): US-006 (RLS regression tests)');
      console.log('\n🔒 Security Priority: CRITICAL - Fixes unauthorized access to chairman data');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUserStories()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { userStories, addUserStories };
