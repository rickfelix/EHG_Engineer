-- =============================================================================
-- Migration: Seed LEO_S22_GATES_ENABLED feature flag (default OFF)
-- SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-6 step 4)
-- Date: 2026-05-03
--
-- Purpose:
--   When OFF (default): worker dual-emits (canonical pair + legacy launch_deployment_runbook).
--                       fn_advance_venture_stage canonical-first with legacy-fallback.
--   When ON:           worker emits only canonical pair. fn_advance_venture_stage canonical exclusively.
--
-- The flag is FLIPPED MANUALLY by the EXEC owner ≥1 day after worker code (FR-1) is
-- deployed. The auto-pipeline does NOT flip it — that requires explicit operator action.
--
-- Idempotent: ON CONFLICT (flag_key) DO UPDATE re-applies on re-run.
--
-- Rollback:
--   UPDATE leo_feature_flags
--   SET is_enabled = false, lifecycle_state = 'disabled'
--   WHERE flag_key = 'LEO_S22_GATES_ENABLED';
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
  'LEO_S22_GATES_ENABLED',
  'S22 Distribution Gates Enforcement',
  'When ON: fn_advance_venture_stage reads ONLY canonical lifecycle_stage_config.required_artifacts (legacy stage_artifact_requirements ignored). Worker emits ONLY new pair (distribution_channel_config + distribution_ad_copy). When OFF: dual-read with canonical-first, legacy-fallback. Worker emits BOTH legacy launch_deployment_runbook AND new pair. SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001.',
  false,
  'high',
  'enabled',
  true,
  NOW() + INTERVAL '90 days',
  'sd',
  'SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001'
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
    SELECT 1 FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'FEATURE FLAG SEED FAIL: LEO_S22_GATES_ENABLED row not present after INSERT';
  END IF;

  -- Default must be OFF — accidental ON would block all in-flight ventures.
  SELECT (is_enabled = false) INTO v_default_off
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';

  IF NOT v_default_off THEN
    RAISE WARNING 'LEO_S22_GATES_ENABLED is_enabled=true on first seed. This MUST be OFF until worker deploy + 1d soak. Re-run will not reset is_enabled (ON CONFLICT preserves existing value).';
  END IF;

  RAISE NOTICE 'FEATURE FLAG SEEDED: LEO_S22_GATES_ENABLED present, default-off=%', v_default_off;
END $$;

COMMIT;
