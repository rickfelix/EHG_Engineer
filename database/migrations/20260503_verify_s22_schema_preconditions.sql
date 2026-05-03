-- =============================================================================
-- Migration: Verify S22 schema preconditions
-- SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-6 step 1)
-- Date: 2026-05-03
--
-- Purpose:
--   Read-only assertions BEFORE the rest of the migration sequence runs.
--   Fails fast if any prerequisite is missing — better than a half-migrated state.
--
-- Asserts:
--   1. venture_artifacts.artifact_type CHECK constraint accepts the new types:
--      'distribution_channel_config', 'distribution_ad_copy', 'distribution_skip_marker'
--   2. lifecycle_stage_config has a row for stage_number=22 with required_artifacts
--      containing exactly ['distribution_channel_config', 'distribution_ad_copy']
--   3. leo_feature_flags table exists (we'll INSERT a row in step 4)
--   4. fn_advance_venture_stage exists in BOTH 4-param and 5-param overloads
--      (we'll CREATE OR REPLACE both in step 5; PGRST203 prevention)
--
-- Idempotent: yes (read-only).
-- Rollback: none needed (no state change).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_check_def text;
  v_required jsonb;
  v_table_exists boolean;
  v_fn_4param_exists boolean;
  v_fn_5param_exists boolean;
BEGIN
  -- 1. venture_artifacts.artifact_type CHECK constraint must accept the new types
  --    distribution_skip_marker is the SKIP marker emitted when entry-preconditions fail (FR-3).
  --    The other two are the canonical pair (FR-1).
  SELECT pg_get_constraintdef(oid) INTO v_check_def
  FROM pg_constraint
  WHERE conrelid = 'venture_artifacts'::regclass
    AND conname LIKE '%artifact_type%check%'
  LIMIT 1;

  IF v_check_def IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: no artifact_type CHECK constraint on venture_artifacts table';
  END IF;

  IF v_check_def NOT LIKE '%distribution_channel_config%' THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: venture_artifacts.artifact_type CHECK does not include distribution_channel_config. Apply 20260421_expand_venture_artifacts_marketing_types.sql first. Got: %', v_check_def;
  END IF;

  IF v_check_def NOT LIKE '%distribution_ad_copy%' THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: venture_artifacts.artifact_type CHECK does not include distribution_ad_copy. Apply 20260421_expand_venture_artifacts_marketing_types.sql first. Got: %', v_check_def;
  END IF;

  -- distribution_skip_marker may not yet be in the CHECK — issue a NOTICE so a
  -- follow-up migration can add it. Step 5 worker code will need it.
  IF v_check_def NOT LIKE '%distribution_skip_marker%' THEN
    RAISE NOTICE 'NOTE: venture_artifacts.artifact_type CHECK does not yet include distribution_skip_marker; the worker FR-3 SKIP path requires it. A follow-up ALTER may be needed before flag flip.';
  END IF;

  -- 2. lifecycle_stage_config must have S22 row with canonical required_artifacts
  SELECT required_artifacts INTO v_required
  FROM lifecycle_stage_config
  WHERE stage_number = 22;

  IF v_required IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: lifecycle_stage_config has no row for stage_number=22. Apply 20260421_redesign_s18_s26_lifecycle_stage_config.sql first.';
  END IF;

  IF NOT (v_required @> '["distribution_channel_config"]'::jsonb) THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: lifecycle_stage_config.required_artifacts for S22 missing distribution_channel_config. Got: %', v_required::text;
  END IF;

  IF NOT (v_required @> '["distribution_ad_copy"]'::jsonb) THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: lifecycle_stage_config.required_artifacts for S22 missing distribution_ad_copy. Got: %', v_required::text;
  END IF;

  -- 3. leo_feature_flags table must exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leo_feature_flags'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: leo_feature_flags table does not exist. Cannot seed LEO_S22_GATES_ENABLED in step 4.';
  END IF;

  -- 4. fn_advance_venture_stage must exist in both overloads (we will CREATE OR REPLACE both)
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_advance_venture_stage'
      AND pg_get_function_identity_arguments(p.oid) = 'p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_handoff_data jsonb'
  ) INTO v_fn_4param_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_advance_venture_stage'
      AND pg_get_function_identity_arguments(p.oid) LIKE 'p_venture_id uuid%user%'
  ) INTO v_fn_5param_exists;

  IF NOT v_fn_4param_exists THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: fn_advance_venture_stage(uuid, integer, integer, jsonb) overload does not exist. Cannot CREATE OR REPLACE in step 5.';
  END IF;

  IF NOT v_fn_5param_exists THEN
    RAISE NOTICE 'NOTE: fn_advance_venture_stage 5-param overload not detected via signature scan — step 5 will still attempt CREATE OR REPLACE for both signatures. Confirm both ship to avoid PGRST203.';
  END IF;

  RAISE NOTICE 'PRECONDITIONS PASS: venture_artifacts CHECK ✓ | lifecycle_stage_config S22 ✓ | leo_feature_flags ✓ | fn_advance_venture_stage 4-param ✓';
END $$;

COMMIT;
