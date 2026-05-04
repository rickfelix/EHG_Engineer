-- =============================================================================
-- Migration: Seed LEO_S21_REQUIRED_ARTIFACTS_GATE feature flag (default OFF)
-- SD: SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001 (FR-3 thin wiring)
-- Date: 2026-05-04
--
-- Purpose:
--   When OFF (default): worker dual-emits (canonical pair + legacy launch_test_plan).
--                       fn_advance_venture_stage uses dual-read with legacy fallback.
--   When ON:           worker emits ONLY canonical pair (visual_device_screenshots
--                      + visual_social_graphics). fn_advance_venture_stage requires
--                      canonical artifacts before S21→S22 advance.
--
-- This is THIN WIRING per PLAN-VALIDATION C1 — the gate logic itself is shipped
-- by SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001's fn_advance_venture_stage migration
-- (database/migrations/20260504_fn_advance_venture_stage_canonical_artifact_source.sql).
-- That function reads lifecycle_stage_config.required_artifacts directly when canonical
-- entries are populated. S21 just needs to seed the opt-in flag and confirm the config.
--
-- The flag is FLIPPED MANUALLY by the EXEC owner ≥1 day after worker code (FR-1) is
-- deployed and dual-emit has produced canonical rows for at least 1 production venture.
-- Per PLAN-VALIDATION C4 cutoff.
--
-- Idempotent: ON CONFLICT (flag_key) DO UPDATE re-applies on re-run.
--
-- Rollback:
--   UPDATE leo_feature_flags
--   SET is_enabled = false, lifecycle_state = 'disabled'
--   WHERE flag_key = 'LEO_S21_REQUIRED_ARTIFACTS_GATE';
-- =============================================================================

BEGIN;

INSERT INTO leo_feature_flags (
  flag_key,
  display_name,
  description,
  is_enabled,
  risk_tier,
  lifecycle_state,
  is_temporary,
  expiry_at,
  owner_type,
  owner_id
) VALUES (
  'LEO_S21_REQUIRED_ARTIFACTS_GATE',
  'S21 Visual Assets Required-Artifacts Gate',
  'When ON: fn_advance_venture_stage requires canonical visual_device_screenshots + visual_social_graphics artifacts before S21→S22 advance. Worker emits ONLY canonical pair. When OFF: dual-read with legacy launch_test_plan fallback; worker dual-emits both canonical + legacy. Thin per-stage wiring leveraging the shared advance-gate mechanism shipped by SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (PR #3510). SD: SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001.',
  false,
  'high',
  'enabled',
  true,
  NOW() + INTERVAL '90 days',
  'sd',
  'SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001'
)
ON CONFLICT (flag_key) DO UPDATE SET
  description = EXCLUDED.description,
  risk_tier = EXCLUDED.risk_tier,
  owner_type = EXCLUDED.owner_type,
  owner_id = EXCLUDED.owner_id,
  updated_at = NOW();

-- Verification.
DO $$
DECLARE
  v_exists boolean;
  v_default_off boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM leo_feature_flags WHERE flag_key = 'LEO_S21_REQUIRED_ARTIFACTS_GATE'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'FEATURE FLAG SEED FAIL: LEO_S21_REQUIRED_ARTIFACTS_GATE row not present after INSERT';
  END IF;

  -- Default must be OFF — accidental ON would block all in-flight ventures at S21.
  SELECT (is_enabled = false) INTO v_default_off
  FROM leo_feature_flags WHERE flag_key = 'LEO_S21_REQUIRED_ARTIFACTS_GATE';

  IF NOT v_default_off THEN
    RAISE WARNING 'LEO_S21_REQUIRED_ARTIFACTS_GATE is_enabled=true on first seed. This MUST be OFF until worker deploy + 1d soak. Re-run will not reset is_enabled (ON CONFLICT preserves existing value).';
  END IF;

  RAISE NOTICE 'FEATURE FLAG SEEDED: LEO_S21_REQUIRED_ARTIFACTS_GATE present, default-off=%', v_default_off;
END $$;

COMMIT;
