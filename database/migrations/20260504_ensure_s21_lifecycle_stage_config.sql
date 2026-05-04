-- =============================================================================
-- Migration: Ensure lifecycle_stage_config row for stage 21 has canonical
--            required_artifacts populated and work_type='artifact_only'
-- SD: SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001 (FR-3 thin wiring)
-- Date: 2026-05-04
--
-- Purpose:
--   The fn_advance_venture_stage function shipped by S22 reads
--   lifecycle_stage_config.required_artifacts to decide whether S21→S22 advance
--   is permitted. This migration is DEFENSIVE — it ensures stage 21's config row
--   has the correct canonical required_artifacts list and work_type. Per PLAN-DATABASE
--   verification, this row may already be correct; the UPSERT is idempotent and safe
--   to re-run.
--
-- Idempotent: INSERT ... ON CONFLICT (stage_number) DO UPDATE.
--
-- Rollback (manual):
--   Restore prior required_artifacts list from
--   `database/migrations/20260421_redesign_s18_s26_lifecycle_stage_config.sql`.
-- =============================================================================

BEGIN;

INSERT INTO lifecycle_stage_config (
  stage_number,
  stage_name,
  work_type,
  required_artifacts
) VALUES (
  21,
  'Visual Assets',
  'artifact_only',
  '["visual_device_screenshots", "visual_social_graphics"]'::jsonb
)
ON CONFLICT (stage_number) DO UPDATE SET
  work_type = 'artifact_only',
  required_artifacts =
    CASE
      WHEN lifecycle_stage_config.required_artifacts @> '["visual_device_screenshots"]'::jsonb
        AND lifecycle_stage_config.required_artifacts @> '["visual_social_graphics"]'::jsonb
      THEN lifecycle_stage_config.required_artifacts
      ELSE '["visual_device_screenshots", "visual_social_graphics"]'::jsonb
    END,
  updated_at = NOW();

-- Verification.
DO $$
DECLARE
  v_required jsonb;
  v_work_type text;
BEGIN
  SELECT required_artifacts, work_type INTO v_required, v_work_type
  FROM lifecycle_stage_config WHERE stage_number = 21;

  IF v_required IS NULL THEN
    RAISE EXCEPTION 'S21 LIFECYCLE CONFIG FAIL: no row for stage_number=21 after upsert';
  END IF;

  IF v_work_type IS DISTINCT FROM 'artifact_only' THEN
    RAISE EXCEPTION 'S21 LIFECYCLE CONFIG FAIL: work_type=% (expected artifact_only)', v_work_type;
  END IF;

  IF NOT (v_required @> '["visual_device_screenshots"]'::jsonb) THEN
    RAISE EXCEPTION 'S21 LIFECYCLE CONFIG FAIL: required_artifacts missing visual_device_screenshots. Got: %', v_required::text;
  END IF;

  IF NOT (v_required @> '["visual_social_graphics"]'::jsonb) THEN
    RAISE EXCEPTION 'S21 LIFECYCLE CONFIG FAIL: required_artifacts missing visual_social_graphics. Got: %', v_required::text;
  END IF;

  RAISE NOTICE 'S21 LIFECYCLE CONFIG OK: work_type=artifact_only, required_artifacts=%', v_required::text;
END $$;

COMMIT;
