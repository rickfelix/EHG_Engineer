-- =============================================================================
-- Migration: Multi-Venture Isolation
-- SD: SD-LEO-FIX-MULTI-VENTURE-ISOLATION-001
-- Date: 2026-02-21
-- Applied: 2026-02-21 (via scripts/temp/apply-venture-functions.cjs + direct pg client)
-- Description: Adds venture_id FK to control plane tables (strategic_directives_v2,
--   product_requirements_v2, sd_phase_handoffs), creates venture-scoped RLS policies,
--   and adds a venture boundary validation function.
--
-- Pre-requisites:
--   - ventures table exists with id UUID PK
--   - fn_user_has_venture_access(UUID) function already exists
--   - RLS is already enabled on all three target tables
--
-- Rollback:
--   DROP FUNCTION IF EXISTS fn_validate_venture_boundary(VARCHAR);
--   DROP FUNCTION IF EXISTS fn_backfill_venture_ids();
--   DROP POLICY IF EXISTS venture_select_strategic_directives_v2 ON strategic_directives_v2;
--   DROP POLICY IF EXISTS venture_insert_strategic_directives_v2 ON strategic_directives_v2;
--   DROP POLICY IF EXISTS venture_update_strategic_directives_v2 ON strategic_directives_v2;
--   DROP POLICY IF EXISTS venture_select_product_requirements_v2 ON product_requirements_v2;
--   DROP POLICY IF EXISTS venture_insert_product_requirements_v2 ON product_requirements_v2;
--   DROP POLICY IF EXISTS venture_update_product_requirements_v2 ON product_requirements_v2;
--   DROP POLICY IF EXISTS venture_select_sd_phase_handoffs ON sd_phase_handoffs;
--   DROP POLICY IF EXISTS venture_insert_sd_phase_handoffs ON sd_phase_handoffs;
--   DROP POLICY IF EXISTS venture_update_sd_phase_handoffs ON sd_phase_handoffs;
--   DROP INDEX IF EXISTS idx_strategic_directives_v2_venture_id;
--   DROP INDEX IF EXISTS idx_product_requirements_v2_venture_id;
--   DROP INDEX IF EXISTS idx_sd_phase_handoffs_venture_id;
--   ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS venture_id;
--   ALTER TABLE product_requirements_v2 DROP COLUMN IF EXISTS venture_id;
--   ALTER TABLE sd_phase_handoffs DROP COLUMN IF EXISTS venture_id;
--
-- NOTE: This migration uses $function$ dollar-quoting for PL/pgSQL bodies.
--   The run-sql-migration.js splitter does not handle dollar-quoted blocks correctly.
--   If re-applying, use: node scripts/temp/apply-venture-functions.cjs for Phases 4-5,
--   or execute the entire file via psql which handles dollar-quoting natively.
-- =============================================================================

-- =============================================================================
-- PHASE 1: Add venture_id columns (nullable, FK to ventures.id)
-- =============================================================================

-- 1a. strategic_directives_v2
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS venture_id UUID
  REFERENCES ventures(id) ON DELETE SET NULL;

COMMENT ON COLUMN strategic_directives_v2.venture_id IS
  'FK to ventures.id. Scopes this SD to a specific venture for multi-venture isolation. NULL = unscoped (legacy/infrastructure SDs).';

-- 1b. product_requirements_v2
ALTER TABLE product_requirements_v2
  ADD COLUMN IF NOT EXISTS venture_id UUID
  REFERENCES ventures(id) ON DELETE SET NULL;

COMMENT ON COLUMN product_requirements_v2.venture_id IS
  'FK to ventures.id. Scopes this PRD to a specific venture. Should match the parent SD venture_id.';

-- 1c. sd_phase_handoffs
ALTER TABLE sd_phase_handoffs
  ADD COLUMN IF NOT EXISTS venture_id UUID
  REFERENCES ventures(id) ON DELETE SET NULL;

COMMENT ON COLUMN sd_phase_handoffs.venture_id IS
  'FK to ventures.id. Scopes this handoff to a specific venture. Should match the parent SD venture_id.';


-- =============================================================================
-- PHASE 2: Create indexes for venture_id columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_venture_id
  ON strategic_directives_v2(venture_id)
  WHERE venture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_requirements_v2_venture_id
  ON product_requirements_v2(venture_id)
  WHERE venture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_venture_id
  ON sd_phase_handoffs(venture_id)
  WHERE venture_id IS NOT NULL;


-- =============================================================================
-- PHASE 3: Venture-scoped RLS policies
-- =============================================================================
-- These policies complement (not replace) existing policies.
-- They add venture-level filtering for authenticated users.
-- Existing service_role policies already grant full access.
-- Records with NULL venture_id remain visible to all (backward compatible).
--
-- Pattern: Allow access when:
--   (a) venture_id IS NULL (unscoped legacy/infrastructure records), OR
--   (b) fn_user_has_venture_access(venture_id) returns TRUE
-- =============================================================================

-- 3a. strategic_directives_v2

DROP POLICY IF EXISTS venture_select_strategic_directives_v2 ON strategic_directives_v2;
CREATE POLICY venture_select_strategic_directives_v2
  ON strategic_directives_v2
  FOR SELECT
  TO authenticated
  USING (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

DROP POLICY IF EXISTS venture_insert_strategic_directives_v2 ON strategic_directives_v2;
CREATE POLICY venture_insert_strategic_directives_v2
  ON strategic_directives_v2
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

DROP POLICY IF EXISTS venture_update_strategic_directives_v2 ON strategic_directives_v2;
CREATE POLICY venture_update_strategic_directives_v2
  ON strategic_directives_v2
  FOR UPDATE
  TO authenticated
  USING (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  )
  WITH CHECK (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

-- 3b. product_requirements_v2

DROP POLICY IF EXISTS venture_select_product_requirements_v2 ON product_requirements_v2;
CREATE POLICY venture_select_product_requirements_v2
  ON product_requirements_v2
  FOR SELECT
  TO authenticated
  USING (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

DROP POLICY IF EXISTS venture_insert_product_requirements_v2 ON product_requirements_v2;
CREATE POLICY venture_insert_product_requirements_v2
  ON product_requirements_v2
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

DROP POLICY IF EXISTS venture_update_product_requirements_v2 ON product_requirements_v2;
CREATE POLICY venture_update_product_requirements_v2
  ON product_requirements_v2
  FOR UPDATE
  TO authenticated
  USING (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  )
  WITH CHECK (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

-- 3c. sd_phase_handoffs

DROP POLICY IF EXISTS venture_select_sd_phase_handoffs ON sd_phase_handoffs;
CREATE POLICY venture_select_sd_phase_handoffs
  ON sd_phase_handoffs
  FOR SELECT
  TO authenticated
  USING (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

DROP POLICY IF EXISTS venture_insert_sd_phase_handoffs ON sd_phase_handoffs;
CREATE POLICY venture_insert_sd_phase_handoffs
  ON sd_phase_handoffs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );

DROP POLICY IF EXISTS venture_update_sd_phase_handoffs ON sd_phase_handoffs;
CREATE POLICY venture_update_sd_phase_handoffs
  ON sd_phase_handoffs
  FOR UPDATE
  TO authenticated
  USING (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  )
  WITH CHECK (
    venture_id IS NULL
    OR fn_user_has_venture_access(venture_id)
  );


-- =============================================================================
-- PHASE 4: Venture boundary validation function
-- =============================================================================
-- Validates that venture_id is consistent across an SD, its PRDs, and handoffs.
-- Returns a JSONB result with validation status and any mismatches found.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_validate_venture_boundary(p_sd_id VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_sd_venture_id UUID;
  v_mismatches JSONB := '[]'::JSONB;
  v_prd_record RECORD;
  v_handoff_record RECORD;
  v_is_valid BOOLEAN := TRUE;
BEGIN
  -- Get the SD's venture_id
  SELECT venture_id INTO v_sd_venture_id
  FROM strategic_directives_v2
  WHERE id = p_sd_id OR sd_key = p_sd_id;

  -- If SD not found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'SD not found: ' || p_sd_id,
      'sd_venture_id', NULL,
      'mismatches', '[]'::JSONB
    );
  END IF;

  -- If SD has no venture_id, all children should also have no venture_id (or we skip check)
  -- But we still flag mismatches where children have a DIFFERENT venture_id

  -- Check PRDs for venture_id mismatches
  FOR v_prd_record IN
    SELECT id, sd_id, venture_id
    FROM product_requirements_v2
    WHERE sd_id = p_sd_id
      AND venture_id IS DISTINCT FROM v_sd_venture_id
  LOOP
    v_is_valid := FALSE;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'entity_type', 'product_requirements_v2',
      'entity_id', v_prd_record.id,
      'expected_venture_id', v_sd_venture_id,
      'actual_venture_id', v_prd_record.venture_id
    ));
  END LOOP;

  -- Check handoffs for venture_id mismatches
  FOR v_handoff_record IN
    SELECT id, sd_id, venture_id
    FROM sd_phase_handoffs
    WHERE sd_id = p_sd_id
      AND venture_id IS DISTINCT FROM v_sd_venture_id
  LOOP
    v_is_valid := FALSE;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'entity_type', 'sd_phase_handoffs',
      'entity_id', v_handoff_record.id,
      'expected_venture_id', v_sd_venture_id,
      'actual_venture_id', v_handoff_record.venture_id
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'valid', v_is_valid,
    'sd_id', p_sd_id,
    'sd_venture_id', v_sd_venture_id,
    'mismatch_count', jsonb_array_length(v_mismatches),
    'mismatches', v_mismatches
  );
END;
$function$;

COMMENT ON FUNCTION fn_validate_venture_boundary(VARCHAR) IS
  'Validates venture_id consistency across an SD and its child PRDs and handoffs. Returns JSONB with validation results and mismatch details.';


-- =============================================================================
-- PHASE 5: Backfill function for existing records
-- =============================================================================
-- Assigns venture_id to existing SDs, PRDs, and handoffs based on context.
-- Strategy:
--   1. For SDs that reference a venture in their metadata, use that.
--   2. For PRDs and handoffs, inherit venture_id from their parent SD.
--   3. Infrastructure SDs (no venture context) remain NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_backfill_venture_ids()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_sd_count INTEGER := 0;
  v_prd_count INTEGER := 0;
  v_handoff_count INTEGER := 0;
BEGIN
  -- Step 1: Backfill SDs that have venture context in metadata
  -- Look for metadata->>'venture_id' or metadata->'venture'->>'id'
  UPDATE strategic_directives_v2 sd
  SET venture_id = COALESCE(
    (sd.metadata->>'venture_id')::UUID,
    (sd.metadata->'venture'->>'id')::UUID
  )
  WHERE sd.venture_id IS NULL
    AND (
      sd.metadata->>'venture_id' IS NOT NULL
      OR sd.metadata->'venture'->>'id' IS NOT NULL
    );
  GET DIAGNOSTICS v_sd_count = ROW_COUNT;

  -- Step 2: Backfill PRDs - inherit venture_id from their parent SD
  UPDATE product_requirements_v2 prd
  SET venture_id = sd.venture_id
  FROM strategic_directives_v2 sd
  WHERE (prd.sd_id = sd.id OR prd.sd_id = sd.sd_key)
    AND prd.venture_id IS NULL
    AND sd.venture_id IS NOT NULL;
  GET DIAGNOSTICS v_prd_count = ROW_COUNT;

  -- Step 3: Backfill handoffs - inherit venture_id from their parent SD
  UPDATE sd_phase_handoffs h
  SET venture_id = sd.venture_id
  FROM strategic_directives_v2 sd
  WHERE (h.sd_id = sd.id OR h.sd_id = sd.sd_key)
    AND h.venture_id IS NULL
    AND sd.venture_id IS NOT NULL;
  GET DIAGNOSTICS v_handoff_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', TRUE,
    'backfilled', jsonb_build_object(
      'strategic_directives_v2', v_sd_count,
      'product_requirements_v2', v_prd_count,
      'sd_phase_handoffs', v_handoff_count
    ),
    'executed_at', NOW()
  );
END;
$function$;

COMMENT ON FUNCTION fn_backfill_venture_ids() IS
  'Backfills venture_id on existing SDs (from metadata), PRDs, and handoffs (inherited from parent SD). Safe to run multiple times (idempotent).';
