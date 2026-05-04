-- =============================================================================
-- Migration: Backfill PrivacyPatrol AI S21 visual artifacts
-- SD: SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001 (FR-6)
-- Date: 2026-05-04
--
-- Purpose:
--   Derive visual_device_screenshots + visual_social_graphics from the existing
--   bundled launch_test_plan row for venture 08d20036-03c9-4a26-bbc5-f37a18dfdf23
--   (PrivacyPatrol AI). Mark legacy row is_current=false with deprecated_by tag.
--
--   PrivacyPatrol AI's S21 launch_test_plan row was emitted on 2026-05-03 with
--   wrong artifact_type and incomplete data. This backfill maps:
--     launch_test_plan.device_screenshots[] → visual_device_screenshots
--     launch_test_plan.social_graphics[]    → visual_social_graphics
--     launch_test_plan.video_storyboard[]   → visual_social_graphics.video_storyboard
--                                              (storyboard not yet a separate canonical type)
--
-- Idempotent:
--   (a) Legacy row marked is_current=false after first run; WHERE clauses no-match on rerun
--   (b) NOT EXISTS guards on the new INSERTs catch any partial-replay
--
-- Rollback (manual):
--   UPDATE venture_artifacts SET is_current=false
--   WHERE venture_id='08d20036-03c9-4a26-bbc5-f37a18dfdf23'
--     AND lifecycle_stage=21
--     AND artifact_type IN ('visual_device_screenshots','visual_social_graphics')
--     AND artifact_data->>'derived_from_artifact_id' IS NOT NULL;
--   UPDATE venture_artifacts SET is_current=true,
--     artifact_data = artifact_data - 'deprecated_by'
--   WHERE venture_id='08d20036-03c9-4a26-bbc5-f37a18dfdf23'
--     AND lifecycle_stage=21
--     AND artifact_type='launch_test_plan';
-- =============================================================================

BEGIN;

-- 0. Lock legacy row to prevent concurrent worker writes during derivation.
SELECT id, artifact_data
FROM venture_artifacts
WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND lifecycle_stage = 21
  AND artifact_type = 'launch_test_plan'
  AND is_current = true
FOR UPDATE;

-- 1. Insert visual_device_screenshots — derived from launch_test_plan.device_screenshots[]
INSERT INTO venture_artifacts (
  venture_id, lifecycle_stage, artifact_type, is_current, source, artifact_data, created_at, updated_at
)
SELECT
  va.venture_id,
  21,
  'visual_device_screenshots',
  true,
  'backfill_sd_leo_feat_stage_visual_assets_001',
  jsonb_build_object(
    'device_screenshots', COALESCE(va.artifact_data->'device_screenshots', '[]'::jsonb),
    'total_screenshots', jsonb_array_length(COALESCE(va.artifact_data->'device_screenshots', '[]'::jsonb)),
    'devices_covered', (
      SELECT jsonb_agg(DISTINCT s->>'device')
      FROM jsonb_array_elements(COALESCE(va.artifact_data->'device_screenshots', '[]'::jsonb)) s
      WHERE s->>'device' IS NOT NULL
    ),
    'file_urls', '[]'::jsonb,  -- FR-2 will populate after Playwright integration
    'rendering_status', 'specs_only',
    'derived_from_artifact_id', va.id,
    'derived_at', to_jsonb(NOW())
  ),
  NOW(), NOW()
FROM venture_artifacts va
WHERE va.venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND va.lifecycle_stage = 21
  AND va.artifact_type = 'launch_test_plan'
  AND va.is_current = true
  AND NOT EXISTS (
    SELECT 1 FROM venture_artifacts va2
    WHERE va2.venture_id = va.venture_id
      AND va2.lifecycle_stage = 21
      AND va2.artifact_type = 'visual_device_screenshots'
      AND va2.is_current = true
  );

-- 2. Insert visual_social_graphics — derived from launch_test_plan.social_graphics[]
--    + video_storyboard nested under metadata (no separate canonical type yet)
INSERT INTO venture_artifacts (
  venture_id, lifecycle_stage, artifact_type, is_current, source, artifact_data, created_at, updated_at
)
SELECT
  va.venture_id,
  21,
  'visual_social_graphics',
  true,
  'backfill_sd_leo_feat_stage_visual_assets_001',
  jsonb_build_object(
    'social_graphics', COALESCE(va.artifact_data->'social_graphics', '[]'::jsonb),
    'total_socials', jsonb_array_length(COALESCE(va.artifact_data->'social_graphics', '[]'::jsonb)),
    'platforms_covered', (
      SELECT jsonb_agg(DISTINCT s->>'platform')
      FROM jsonb_array_elements(COALESCE(va.artifact_data->'social_graphics', '[]'::jsonb)) s
      WHERE s->>'platform' IS NOT NULL
    ),
    'file_urls', '[]'::jsonb,  -- FR-2 will populate
    'rendering_status', 'specs_only',
    'video_storyboard', COALESCE(va.artifact_data->'video_storyboard', '[]'::jsonb),
    'derived_from_artifact_id', va.id,
    'derived_at', to_jsonb(NOW())
  ),
  NOW(), NOW()
FROM venture_artifacts va
WHERE va.venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND va.lifecycle_stage = 21
  AND va.artifact_type = 'launch_test_plan'
  AND va.is_current = true
  AND NOT EXISTS (
    SELECT 1 FROM venture_artifacts va2
    WHERE va2.venture_id = va.venture_id
      AND va2.lifecycle_stage = 21
      AND va2.artifact_type = 'visual_social_graphics'
      AND va2.is_current = true
  );

-- 3. Mark legacy bundled launch_test_plan row as not-current; preserve for audit/rollback.
UPDATE venture_artifacts
SET is_current = false,
    updated_at = NOW(),
    artifact_data = jsonb_set(
      COALESCE(artifact_data, '{}'::jsonb),
      '{deprecated_by}',
      to_jsonb('SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001'::text)
    )
WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND lifecycle_stage = 21
  AND artifact_type = 'launch_test_plan'
  AND is_current = true;

-- 4. Verification: fail the migration if backfill produces wrong counts.
DO $$
DECLARE
  v_canonical_count int;
  v_legacy_current_count int;
BEGIN
  SELECT count(*) INTO v_canonical_count FROM venture_artifacts
  WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
    AND lifecycle_stage = 21
    AND artifact_type IN ('visual_device_screenshots','visual_social_graphics')
    AND is_current = true;

  SELECT count(*) INTO v_legacy_current_count FROM venture_artifacts
  WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
    AND lifecycle_stage = 21
    AND artifact_type = 'launch_test_plan'
    AND is_current = true;

  IF v_canonical_count <> 2 THEN
    RAISE EXCEPTION 'S21 BACKFILL FAIL: expected 2 canonical rows for venture 08d20036-..., got %', v_canonical_count;
  END IF;

  IF v_legacy_current_count <> 0 THEN
    RAISE EXCEPTION 'S21 BACKFILL FAIL: expected 0 legacy launch_test_plan rows with is_current=true, got %', v_legacy_current_count;
  END IF;

  RAISE NOTICE 'S21 BACKFILL VERIFIED: 2 canonical rows is_current=true, 0 legacy rows is_current=true.';
END $$;

COMMIT;
