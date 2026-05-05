-- =============================================================================
-- Migration: Ensure lifecycle_stage_config row for stage 25 has canonical
--            postlaunch_* required_artifacts populated and work_type='artifact_only'
-- SD: SD-LEO-FEAT-STAGE-POST-LAUNCH-001 (FR-6 exit-gate enforcement)
-- Date: 2026-05-04
--
-- Purpose:
--   advance_venture_stage(v, 25→26) reads lifecycle_stage_config.required_artifacts
--   to enforce that S25 emitted before allowing transition to S26 (Growth Playbook).
--   Per DATABASE evidence (sub_agent_execution_results 5b72213e-8945-4c55-884e-3936e13a545d),
--   the row currently exists with legacy launch_* prefix; this migration updates it
--   to the new postlaunch_* prefix:
--     - postlaunch_assumptions_vs_reality
--     - postlaunch_user_feedback_summary
--     - postlaunch_analytics_dashboard
--   Coordinated with 20260504_extend_venture_artifacts_postlaunch_types.sql which
--   adds these keys to the venture_artifacts CHECK constraint.
--
-- Idempotent: INSERT ... ON CONFLICT (stage_number) DO UPDATE.
--
-- Apply path (Windows canonical):
--   supabase db query --linked --file database/migrations/20260504_ensure_s25_lifecycle_stage_config.sql
--
-- Rollback (manual):
--   Restore prior required_artifacts ['launch_assumptions_vs_reality','launch_user_feedback_summary'].
-- =============================================================================

BEGIN;

INSERT INTO lifecycle_stage_config (
  stage_number,
  stage_name,
  work_type,
  required_artifacts
) VALUES (
  25,
  'Post-Launch Review',
  'artifact_only',
  '["postlaunch_assumptions_vs_reality", "postlaunch_user_feedback_summary", "postlaunch_analytics_dashboard"]'::jsonb
)
ON CONFLICT (stage_number) DO UPDATE SET
  stage_name = 'Post-Launch Review',
  work_type = 'artifact_only',
  required_artifacts = '["postlaunch_assumptions_vs_reality", "postlaunch_user_feedback_summary", "postlaunch_analytics_dashboard"]'::jsonb,
  updated_at = NOW();

-- Verification.
DO $$
DECLARE
  v_required jsonb;
  v_work_type text;
  v_stage_name text;
BEGIN
  SELECT required_artifacts, work_type, stage_name
    INTO v_required, v_work_type, v_stage_name
  FROM lifecycle_stage_config WHERE stage_number = 25;

  IF v_required IS NULL THEN
    RAISE EXCEPTION 'S25 LIFECYCLE CONFIG FAIL: no row for stage_number=25 after upsert';
  END IF;

  IF v_work_type IS DISTINCT FROM 'artifact_only' THEN
    RAISE EXCEPTION 'S25 LIFECYCLE CONFIG FAIL: work_type=% (expected artifact_only)', v_work_type;
  END IF;

  IF v_stage_name IS DISTINCT FROM 'Post-Launch Review' THEN
    RAISE EXCEPTION 'S25 LIFECYCLE CONFIG FAIL: stage_name=% (expected Post-Launch Review)', v_stage_name;
  END IF;

  IF NOT (v_required @> '["postlaunch_assumptions_vs_reality"]'::jsonb) THEN
    RAISE EXCEPTION 'S25 LIFECYCLE CONFIG FAIL: required_artifacts missing postlaunch_assumptions_vs_reality. Got: %', v_required::text;
  END IF;

  IF NOT (v_required @> '["postlaunch_user_feedback_summary"]'::jsonb) THEN
    RAISE EXCEPTION 'S25 LIFECYCLE CONFIG FAIL: required_artifacts missing postlaunch_user_feedback_summary. Got: %', v_required::text;
  END IF;

  IF NOT (v_required @> '["postlaunch_analytics_dashboard"]'::jsonb) THEN
    RAISE EXCEPTION 'S25 LIFECYCLE CONFIG FAIL: required_artifacts missing postlaunch_analytics_dashboard. Got: %', v_required::text;
  END IF;

  RAISE NOTICE 'S25 LIFECYCLE CONFIG OK: work_type=artifact_only, required_artifacts=%', v_required::text;
END $$;

COMMIT;
