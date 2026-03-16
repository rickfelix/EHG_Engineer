-- =============================================================================
-- Migration: srip_rls_policies.sql
-- Purpose: Replace owner-subquery RLS with JWT venture_id claim-based policies
-- SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
-- Date: 2026-03-15
--
-- Replaces the existing `_owner` policies (which use a subquery against the
-- ventures table) with `_venture` policies that match venture_id directly
-- against the authenticated user's JWT app_metadata.venture_id claim.
--
-- This is more performant (no subquery) and supports multi-tenant access
-- where venture_id is set in the JWT at login time.
--
-- Tables affected:
--   - srip_site_dna
--   - srip_brand_interviews
--   - srip_synthesis_prompts
--
-- Rollback:
--   Re-run srip_rls_tightening.sql to restore owner-subquery policies
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. srip_site_dna — replace owner-subquery with JWT claim
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS srip_site_dna_select_owner ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_insert_owner ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_update_owner ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_delete_owner ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_service_all ON srip_site_dna;

-- Also drop old _policy variants (if any remnants)
DROP POLICY IF EXISTS srip_site_dna_select_policy ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_insert_policy ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_update_policy ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_delete_policy ON srip_site_dna;

-- RLS already enabled, ensure it stays on
ALTER TABLE srip_site_dna ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "srip_site_dna_service_role" ON srip_site_dna
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Venture-scoped access via JWT claim
CREATE POLICY "srip_site_dna_venture_select" ON srip_site_dna
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "srip_site_dna_venture_insert" ON srip_site_dna
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "srip_site_dna_venture_update" ON srip_site_dna
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 2. srip_brand_interviews — replace owner-subquery with JWT claim
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS srip_brand_interviews_select_owner ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_insert_owner ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_update_owner ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_delete_owner ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_service_all ON srip_brand_interviews;

-- Also drop old _policy variants
DROP POLICY IF EXISTS srip_brand_interviews_select_policy ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_insert_policy ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_update_policy ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_delete_policy ON srip_brand_interviews;

-- RLS already enabled, ensure it stays on
ALTER TABLE srip_brand_interviews ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "srip_brand_interviews_service_role" ON srip_brand_interviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Venture-scoped access via JWT claim
CREATE POLICY "srip_brand_interviews_venture_select" ON srip_brand_interviews
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "srip_brand_interviews_venture_insert" ON srip_brand_interviews
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "srip_brand_interviews_venture_update" ON srip_brand_interviews
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 3. srip_synthesis_prompts — replace owner-subquery with JWT claim
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS srip_synthesis_prompts_select_owner ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_insert_owner ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_update_owner ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_delete_owner ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_service_all ON srip_synthesis_prompts;

-- Also drop old _policy variants
DROP POLICY IF EXISTS srip_synthesis_prompts_select_policy ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_insert_policy ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_update_policy ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_delete_policy ON srip_synthesis_prompts;

-- RLS already enabled, ensure it stays on
ALTER TABLE srip_synthesis_prompts ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "srip_synthesis_prompts_service_role" ON srip_synthesis_prompts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Venture-scoped access via JWT claim
CREATE POLICY "srip_synthesis_prompts_venture_select" ON srip_synthesis_prompts
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "srip_synthesis_prompts_venture_insert" ON srip_synthesis_prompts
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "srip_synthesis_prompts_venture_update" ON srip_synthesis_prompts
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

COMMIT;
