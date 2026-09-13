-- @approved-by: codestreetlabs@gmail.com
--
-- Migration: Sync stage_artifact_requirements (legacy mirror) for S24
--            launch_usage_signal.
-- SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 (FR-6)
--
-- Additive/reversible per docs/03_protocols_and_standards/only-the-chairman-can.md
-- item 5 (single-row idempotent INSERT, no alter/drop/truncate/overwrite of
-- existing rows; documented DELETE rollback below) — fleet-autonomous apply.
-- Same shape as the S15 precedent (20260701_sync_stage_artifact_requirements_
-- s15_user_story_pack.sql, QF-20260701-896).
--
-- WHY:
--   database/chairman-gated/20260826_venture_usage_events_rpc.sql added
--   'launch_usage_signal' to venture_stages.required_artifacts (the SSOT) for
--   stage 24, but did not re-sync the legacy stage_artifact_requirements
--   mirror table (still the fn_advance_venture_stage fallback path; parity
--   enforced by the LEGACY_PARITY (C5) check in
--   scripts/validate-stage-contract-connectivity.mjs, per
--   20260610_sync_stage_artifact_requirements_to_ssot.sql). The migration's
--   filename didn't match stage-contract-connectivity.yml's PR-trigger path
--   filters (*venture_stages*.sql / *stage_artifact_requirements*.sql -- it
--   lives under database/chairman-gated/ and is named for its RPC content),
--   so the drift slipped through PR CI. Live-confirmed 2026-09-13:
--   `node scripts/validate-stage-contract-connectivity.mjs` reports exactly
--   one LEGACY_PARITY hard failure (stage 24 'launch_usage_signal'), no other
--   stage drifted.
--
-- Additive + idempotent (WHERE NOT EXISTS guard).
--
-- Rollback:
--   DELETE FROM stage_artifact_requirements
--    WHERE stage_number = 24 AND artifact_type = 'launch_usage_signal';

BEGIN;

INSERT INTO stage_artifact_requirements (stage_number, artifact_type, required_status, is_blocking, description)
SELECT
  24,
  'launch_usage_signal',
  'completed',
  true,
  'launch_usage_signal required before leaving Stage 24 (Go Live) — synced from venture_stages.required_artifacts (SSOT) by SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001'
WHERE NOT EXISTS (
  SELECT 1 FROM stage_artifact_requirements
  WHERE stage_number = 24 AND artifact_type = 'launch_usage_signal'
);

COMMIT;

-- VERIFY (run after apply):
--   node scripts/validate-stage-contract-connectivity.mjs   -- LEGACY_PARITY (C5) green
