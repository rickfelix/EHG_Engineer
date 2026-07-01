-- @approved-by: codestreetlabs@gmail.com
--
-- Migration: Sync stage_artifact_requirements (legacy mirror) for S15
--            blueprint_user_story_pack.
-- QF-20260701-896
--
-- Additive/reversible per docs/03_protocols_and_standards/only-the-chairman-can.md
-- item 5 (single-row idempotent INSERT, no alter/drop/truncate/overwrite of
-- existing rows; documented DELETE rollback below) — fleet-autonomous apply.
--
-- WHY:
--   20260629_s15_require_user_story_pack.sql added 'blueprint_user_story_pack'
--   to venture_stages.required_artifacts (the SSOT) for stage 15, but did not
--   re-sync the legacy stage_artifact_requirements mirror table (still the
--   fn_advance_venture_stage fallback path; parity enforced by the
--   LEGACY_PARITY (C5) check in scripts/validate-stage-contract-connectivity.mjs,
--   per 20260610_sync_stage_artifact_requirements_to_ssot.sql). The migration's
--   filename didn't match stage-contract-connectivity.yml's PR-trigger path
--   filters (*venture_stages*.sql / *stage_artifact_requirements*.sql), so the
--   drift slipped through PR CI and was only caught by the nightly schedule
--   sweep (failing 2026-06-29, 06-30, 07-01).
--
--   Verified via direct DB comparison: this is the ONLY drifted stage (1 of 26).
--
-- Additive + idempotent (WHERE NOT EXISTS guard).
--
-- Rollback:
--   DELETE FROM stage_artifact_requirements
--    WHERE stage_number = 15 AND artifact_type = 'blueprint_user_story_pack';

BEGIN;

INSERT INTO stage_artifact_requirements (stage_number, artifact_type, required_status, is_blocking, description)
SELECT
  15,
  'blueprint_user_story_pack',
  'completed',
  true,
  'blueprint_user_story_pack required before leaving Stage 15 (Design Studio) — synced from venture_stages.required_artifacts (SSOT) by QF-20260701-896'
WHERE NOT EXISTS (
  SELECT 1 FROM stage_artifact_requirements
  WHERE stage_number = 15 AND artifact_type = 'blueprint_user_story_pack'
);

COMMIT;

-- VERIFY (run after apply):
--   node scripts/validate-stage-contract-connectivity.mjs   -- LEGACY_PARITY (C5) green
