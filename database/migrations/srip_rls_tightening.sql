-- =============================================================================
-- Migration: srip_rls_tightening.sql
-- Purpose: Tighten RLS on SRIP tables from USING(true) to venture-scoped
-- SD: SD-LEO-INFRA-WIRE-STAGE-BRAND-001
-- Date: 2026-03-16
--
-- Replaces permissive USING(true) policies on 4 SRIP tables with
-- venture-scoped policies: authenticated users can only access data
-- for ventures they created. Service role retains full access.
--
-- Tables affected:
--   - srip_site_dna
--   - srip_brand_interviews
--   - srip_synthesis_prompts
--   - srip_quality_checks
--
-- Rollback:
--   Re-run the original 20260314_srip_artifact_tables.sql RLS section
-- =============================================================================

-- ============================================================
-- 1. srip_site_dna — drop permissive, add venture-scoped
-- ============================================================

DROP POLICY IF EXISTS srip_site_dna_select_policy ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_insert_policy ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_update_policy ON srip_site_dna;
DROP POLICY IF EXISTS srip_site_dna_delete_policy ON srip_site_dna;

CREATE POLICY srip_site_dna_select_owner ON srip_site_dna
  FOR SELECT TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_site_dna_insert_owner ON srip_site_dna
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_site_dna_update_owner ON srip_site_dna
  FOR UPDATE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_site_dna_delete_owner ON srip_site_dna
  FOR DELETE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_site_dna_service_all ON srip_site_dna
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================================
-- 2. srip_brand_interviews — drop permissive, add venture-scoped
-- ============================================================

DROP POLICY IF EXISTS srip_brand_interviews_select_policy ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_insert_policy ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_update_policy ON srip_brand_interviews;
DROP POLICY IF EXISTS srip_brand_interviews_delete_policy ON srip_brand_interviews;

CREATE POLICY srip_brand_interviews_select_owner ON srip_brand_interviews
  FOR SELECT TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_brand_interviews_insert_owner ON srip_brand_interviews
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_brand_interviews_update_owner ON srip_brand_interviews
  FOR UPDATE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_brand_interviews_delete_owner ON srip_brand_interviews
  FOR DELETE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_brand_interviews_service_all ON srip_brand_interviews
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================================
-- 3. srip_synthesis_prompts — drop permissive, add venture-scoped
-- ============================================================

DROP POLICY IF EXISTS srip_synthesis_prompts_select_policy ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_insert_policy ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_update_policy ON srip_synthesis_prompts;
DROP POLICY IF EXISTS srip_synthesis_prompts_delete_policy ON srip_synthesis_prompts;

CREATE POLICY srip_synthesis_prompts_select_owner ON srip_synthesis_prompts
  FOR SELECT TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_synthesis_prompts_insert_owner ON srip_synthesis_prompts
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_synthesis_prompts_update_owner ON srip_synthesis_prompts
  FOR UPDATE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_synthesis_prompts_delete_owner ON srip_synthesis_prompts
  FOR DELETE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_synthesis_prompts_service_all ON srip_synthesis_prompts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================================
-- 4. srip_quality_checks — drop permissive, add venture-scoped
-- ============================================================

DROP POLICY IF EXISTS srip_quality_checks_select_policy ON srip_quality_checks;
DROP POLICY IF EXISTS srip_quality_checks_insert_policy ON srip_quality_checks;
DROP POLICY IF EXISTS srip_quality_checks_update_policy ON srip_quality_checks;
DROP POLICY IF EXISTS srip_quality_checks_delete_policy ON srip_quality_checks;

CREATE POLICY srip_quality_checks_select_owner ON srip_quality_checks
  FOR SELECT TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_quality_checks_insert_owner ON srip_quality_checks
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_quality_checks_update_owner ON srip_quality_checks
  FOR UPDATE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_quality_checks_delete_owner ON srip_quality_checks
  FOR DELETE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY srip_quality_checks_service_all ON srip_quality_checks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
