-- =============================================================================
-- Migration: Tag legacy past-S22 ventures with s22_legacy_skipped=true
-- SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-6 step 3)
-- Date: 2026-05-03
--
-- Purpose:
--   Ventures that have already advanced past S22 cannot be retroactively forced
--   to satisfy the new FR-2 advance-blocker. Mark them as legacy-skipped so that
--   fn_advance_venture_stage bypasses the artifact gate for them at any stage
--   transition involving S22 inputs.
--
--   PrivacyPatrol AI is excluded — it gets the proper backfill in step 2.
--
-- Idempotent:
--   WHERE clause excludes already-tagged rows; re-running matches 0 rows.
--
-- Rollback (manual):
--   UPDATE ventures
--   SET metadata = metadata - 's22_legacy_skipped' - 's22_legacy_skipped_at'
--                            - 's22_legacy_skipped_by_sd' - 's22_legacy_skipped_reason'
--   WHERE (metadata->>'s22_legacy_skipped_by_sd') = 'SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001';
-- =============================================================================

BEGIN;

-- Audit query — captured for the SD's PR description.
-- Returns rows that WILL be tagged (excluding PrivacyPatrol AI + already-tagged).
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM ventures
  WHERE current_lifecycle_stage > 22
    AND COALESCE((metadata->>'s22_legacy_skipped')::boolean, false) = false
    AND id <> '08d20036-03c9-4a26-bbc5-f37a18dfdf23';
  RAISE NOTICE 'About to tag % venture(s) past S22 with s22_legacy_skipped=true', v_count;
END $$;

-- Migration step
UPDATE ventures
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      's22_legacy_skipped', true,
      's22_legacy_skipped_at', to_jsonb(NOW()),
      's22_legacy_skipped_by_sd', 'SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001',
      's22_legacy_skipped_reason', 'Advanced past S22 before distribution_channel_config/distribution_ad_copy gates were enforced'
    ),
    updated_at = NOW()
WHERE current_lifecycle_stage > 22
  AND COALESCE((metadata->>'s22_legacy_skipped')::boolean, false) = false
  AND id <> '08d20036-03c9-4a26-bbc5-f37a18dfdf23';

-- Verification — re-running should produce 0 untagged candidates.
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM ventures
  WHERE current_lifecycle_stage > 22
    AND COALESCE((metadata->>'s22_legacy_skipped')::boolean, false) = false
    AND id <> '08d20036-03c9-4a26-bbc5-f37a18dfdf23';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'TAGGING VERIFICATION FAIL: % venture(s) past S22 remain untagged after migration', v_remaining;
  END IF;

  RAISE NOTICE 'TAGGING VERIFIED: 0 untagged ventures past S22 (excluding PrivacyPatrol AI).';
END $$;

COMMIT;
