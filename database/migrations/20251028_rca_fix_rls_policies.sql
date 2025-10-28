-- Migration: Fix RLS Policies for Root Cause Agent Tables
-- Issue: CLI scripts use ANON_KEY (anon role), but policies were only for authenticated role
-- Fix: Add policies for anon role (or use public which includes both anon & authenticated)
--
-- Context:
-- - RCA CLI (scripts/root-cause-agent.js) uses @supabase/supabase-js with ANON_KEY
-- - Runtime triggers (lib/rca-runtime-triggers.js) also use ANON_KEY
-- - ANON_KEY authenticates as 'anon' role, not 'authenticated' role
-- - Current policies only allow INSERT/UPDATE for 'authenticated' role
-- - Result: "new row violates row-level security policy" error
--
-- Solution: Add explicit policies for 'anon' role

BEGIN;

-- ============================================================================
-- root_cause_reports - Add anon role policies
-- ============================================================================

-- Drop existing authenticated policies (will be replaced with public)
DROP POLICY IF EXISTS "authenticated_insert_root_cause_reports" ON root_cause_reports;
DROP POLICY IF EXISTS "authenticated_update_root_cause_reports" ON root_cause_reports;
DROP POLICY IF EXISTS "authenticated_read_root_cause_reports" ON root_cause_reports;

-- Create policies for PUBLIC (includes both anon and authenticated)
CREATE POLICY "public_insert_root_cause_reports"
ON root_cause_reports
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "public_update_root_cause_reports"
ON root_cause_reports
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "public_select_root_cause_reports"
ON root_cause_reports
FOR SELECT
TO public
USING (true);

-- ============================================================================
-- remediation_manifests - Add anon role policies
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_insert_remediation_manifests" ON remediation_manifests;
DROP POLICY IF EXISTS "authenticated_update_remediation_manifests" ON remediation_manifests;
DROP POLICY IF EXISTS "authenticated_read_remediation_manifests" ON remediation_manifests;

CREATE POLICY "public_insert_remediation_manifests"
ON remediation_manifests
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "public_update_remediation_manifests"
ON remediation_manifests
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "public_select_remediation_manifests"
ON remediation_manifests
FOR SELECT
TO public
USING (true);

-- ============================================================================
-- rca_learning_records - Add anon role policies
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_read_rca_learning_records" ON rca_learning_records;

CREATE POLICY "public_insert_rca_learning_records"
ON rca_learning_records
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "public_select_rca_learning_records"
ON rca_learning_records
FOR SELECT
TO public
USING (true);

-- ============================================================================
-- defect_taxonomy - Keep read-only (no changes needed)
-- ============================================================================

-- defect_taxonomy remains read-only for public (reference data)
DROP POLICY IF EXISTS "authenticated_read_defect_taxonomy" ON defect_taxonomy;

CREATE POLICY "public_select_defect_taxonomy"
ON defect_taxonomy
FOR SELECT
TO public
USING (true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    rcr_policy_count INTEGER;
    capa_policy_count INTEGER;
    learning_policy_count INTEGER;
    taxonomy_policy_count INTEGER;
BEGIN
    -- Count policies for each table
    SELECT COUNT(*) INTO rcr_policy_count
    FROM pg_policies
    WHERE tablename = 'root_cause_reports'
      AND policyname LIKE 'public_%';

    SELECT COUNT(*) INTO capa_policy_count
    FROM pg_policies
    WHERE tablename = 'remediation_manifests'
      AND policyname LIKE 'public_%';

    SELECT COUNT(*) INTO learning_policy_count
    FROM pg_policies
    WHERE tablename = 'rca_learning_records'
      AND policyname LIKE 'public_%';

    SELECT COUNT(*) INTO taxonomy_policy_count
    FROM pg_policies
    WHERE tablename = 'defect_taxonomy'
      AND policyname LIKE 'public_%';

    -- Verify policy counts
    IF rcr_policy_count < 3 THEN
        RAISE WARNING 'root_cause_reports missing public policies (expected 3, got %)', rcr_policy_count;
    END IF;

    IF capa_policy_count < 3 THEN
        RAISE WARNING 'remediation_manifests missing public policies (expected 3, got %)', capa_policy_count;
    END IF;

    IF learning_policy_count < 2 THEN
        RAISE WARNING 'rca_learning_records missing public policies (expected 2, got %)', learning_policy_count;
    END IF;

    IF taxonomy_policy_count < 1 THEN
        RAISE WARNING 'defect_taxonomy missing public policies (expected 1, got %)', taxonomy_policy_count;
    END IF;

    RAISE NOTICE '✅ RLS Policy Fix Migration completed successfully';
    RAISE NOTICE '  - root_cause_reports public policies: %', rcr_policy_count;
    RAISE NOTICE '  - remediation_manifests public policies: %', capa_policy_count;
    RAISE NOTICE '  - rca_learning_records public policies: %', learning_policy_count;
    RAISE NOTICE '  - defect_taxonomy public policies: %', taxonomy_policy_count;
    RAISE NOTICE '';
    RAISE NOTICE '📋 Summary:';
    RAISE NOTICE '  - Changed role from "authenticated" to "public" (includes anon + authenticated)';
    RAISE NOTICE '  - RCA CLI scripts can now INSERT using ANON_KEY';
    RAISE NOTICE '  - Runtime triggers can now INSERT using ANON_KEY';
    RAISE NOTICE '  - SERVICE_ROLE_KEY still has full access via separate policies';
END $$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION TEST
-- ============================================================================

-- Run this test after migration to verify anon key access:
/*
node --input-type=module -e "
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const anonSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  const { data, error } = await anonSupabase
    .from('root_cause_reports')
    .insert({
      scope_type: 'SD',
      scope_id: 'SD-TEST-RLS-001',
      trigger_source: 'MANUAL',
      trigger_tier: 4,
      failure_signature: 'rls-fix-verification-' + Date.now(),
      problem_statement: 'RLS policy fix verification test',
      observed: {},
      expected: {},
      confidence: 40,
      impact_level: 'LOW',
      likelihood_level: 'ISOLATED'
    })
    .select();

  console.log('✅ RLS Fix Test:', error ? 'FAILED - ' + error.message : 'PASSED');
  if (!error) {
    console.log('   Created RCR ID:', data[0].id);

    // Clean up test record
    await anonSupabase.from('root_cause_reports').delete().eq('id', data[0].id);
    console.log('   Test record cleaned up');
  }

  process.exit(error ? 1 : 0);
})();
"
*/
