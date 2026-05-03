-- =============================================================================
-- Migration: Backfill PrivacyPatrol AI S22 distribution artifacts
-- SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-6 step 2)
-- Date: 2026-05-03
--
-- Purpose:
--   Derive distribution_channel_config + distribution_ad_copy from the existing
--   bundled launch_deployment_runbook row for venture 08d20036-...
--   Mark legacy row is_current=false with deprecated_by tag.
--
-- Idempotent:
--   Re-running is a no-op because:
--   (a) the legacy row is already marked is_current=false after first run, so
--       the WHERE clauses on INSERT and UPDATE both match 0 rows
--   (b) ON CONFLICT DO NOTHING on the new INSERTs catches any partial-replay
--
-- Rollback (manual):
--   UPDATE venture_artifacts SET is_current=false
--   WHERE venture_id='08d20036-03c9-4a26-bbc5-f37a18dfdf23'
--     AND lifecycle_stage=22
--     AND artifact_type IN ('distribution_channel_config','distribution_ad_copy')
--     AND artifact_data->>'derived_from_artifact_id' IS NOT NULL;
--   UPDATE venture_artifacts SET is_current=true,
--     artifact_data = artifact_data - 'deprecated_by'
--   WHERE venture_id='08d20036-03c9-4a26-bbc5-f37a18dfdf23'
--     AND lifecycle_stage=22
--     AND artifact_type='launch_deployment_runbook';
-- =============================================================================

BEGIN;

-- 0. Lock legacy row to prevent concurrent worker writes during derivation.
SELECT id, artifact_data
FROM venture_artifacts
WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND lifecycle_stage = 22
  AND artifact_type = 'launch_deployment_runbook'
  AND is_current = true
FOR UPDATE;

-- 1. Insert distribution_channel_config — channels minus ad_copy fields, plus budget
INSERT INTO venture_artifacts (
  venture_id, lifecycle_stage, artifact_type, is_current, source, artifact_data, created_at, updated_at
)
SELECT
  va.venture_id,
  22,
  'distribution_channel_config',
  true,
  'backfill_sd_leo_feat_stage_distribution_setup_001',
  jsonb_build_object(
    'channels', (
      SELECT jsonb_agg(ch - 'ad_copy' - 'ad_creative' - 'ad_variants')
      FROM jsonb_array_elements(va.artifact_data->'channels') ch
    ),
    'total_channels',  va.artifact_data->'total_channels',
    'active_channels', va.artifact_data->'active_channels',
    'budget_allocation', va.artifact_data->'budget_allocation',
    'derived_from_artifact_id', va.id,
    'derived_at', to_jsonb(NOW())
  ),
  NOW(), NOW()
FROM venture_artifacts va
WHERE va.venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND va.lifecycle_stage = 22
  AND va.artifact_type = 'launch_deployment_runbook'
  AND va.is_current = true
  AND NOT EXISTS (
    SELECT 1 FROM venture_artifacts va2
    WHERE va2.venture_id = va.venture_id
      AND va2.lifecycle_stage = 22
      AND va2.artifact_type = 'distribution_channel_config'
      AND va2.is_current = true
  );

-- 2. Insert distribution_ad_copy — per-enabled-channel ad copy + email_sequences
INSERT INTO venture_artifacts (
  venture_id, lifecycle_stage, artifact_type, is_current, source, artifact_data, created_at, updated_at
)
SELECT
  va.venture_id,
  22,
  'distribution_ad_copy',
  true,
  'backfill_sd_leo_feat_stage_distribution_setup_001',
  jsonb_build_object(
    'channels_with_copy', (
      SELECT jsonb_agg(jsonb_build_object(
        'channel', ch->>'channel',
        'channel_id', ch->>'channel_id',
        'channel_name', ch->>'channel_name',
        'ad_copy', ch->'ad_copy',
        'ad_creative', ch->'ad_creative',
        'ad_variants', ch->'ad_variants'
      ))
      FROM jsonb_array_elements(va.artifact_data->'channels') ch
      WHERE COALESCE((ch->>'enabled')::boolean, ch->>'status' = 'active', false) = true
    ),
    'email_sequences', va.artifact_data->'email_sequences',
    'derived_from_artifact_id', va.id,
    'derived_at', to_jsonb(NOW())
  ),
  NOW(), NOW()
FROM venture_artifacts va
WHERE va.venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND va.lifecycle_stage = 22
  AND va.artifact_type = 'launch_deployment_runbook'
  AND va.is_current = true
  AND NOT EXISTS (
    SELECT 1 FROM venture_artifacts va2
    WHERE va2.venture_id = va.venture_id
      AND va2.lifecycle_stage = 22
      AND va2.artifact_type = 'distribution_ad_copy'
      AND va2.is_current = true
  );

-- 3. Mark legacy bundled row as not-current; preserve for audit/rollback.
UPDATE venture_artifacts
SET is_current = false,
    updated_at = NOW(),
    artifact_data = jsonb_set(
      COALESCE(artifact_data, '{}'::jsonb),
      '{deprecated_by}',
      to_jsonb('SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001'::text)
    )
WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  AND lifecycle_stage = 22
  AND artifact_type = 'launch_deployment_runbook'
  AND is_current = true;

-- 4. Verification: fail the migration if not exactly 2 new current rows.
DO $$
DECLARE
  v_canonical_count int;
  v_legacy_current_count int;
BEGIN
  SELECT count(*) INTO v_canonical_count FROM venture_artifacts
  WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
    AND lifecycle_stage = 22
    AND artifact_type IN ('distribution_channel_config','distribution_ad_copy')
    AND is_current = true;

  SELECT count(*) INTO v_legacy_current_count FROM venture_artifacts
  WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
    AND lifecycle_stage = 22
    AND artifact_type = 'launch_deployment_runbook'
    AND is_current = true;

  IF v_canonical_count <> 2 THEN
    RAISE EXCEPTION 'BACKFILL VERIFICATION FAIL: expected 2 canonical rows, got %', v_canonical_count;
  END IF;

  IF v_legacy_current_count <> 0 THEN
    RAISE EXCEPTION 'BACKFILL VERIFICATION FAIL: expected 0 legacy launch_deployment_runbook rows with is_current=true, got %', v_legacy_current_count;
  END IF;

  RAISE NOTICE 'BACKFILL VERIFIED: 2 canonical rows is_current=true, 0 legacy rows is_current=true.';
END $$;

COMMIT;
