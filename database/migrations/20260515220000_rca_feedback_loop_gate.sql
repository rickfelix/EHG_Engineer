-- SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-G
-- Adds partial unique index on architectural_prevention_findings to support
-- idempotent upsert from rca-feedback-loop-gate.js when a no_seam_exists
-- payload is detected. Seeds app_config row for enforcement_mode (default
-- advisory in v1; Phase-2 cutover flips via UPDATE, no redeploy).
--
-- Rollback (uncomment + execute via database-agent if needed):
--   DROP INDEX IF EXISTS idx_apf_rca_sd_alive;
--   DELETE FROM app_config WHERE key = 'rca.feedback_loop.enforcement_mode';

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_apf_rca_sd_alive
  ON architectural_prevention_findings (source_rca_id, source_sd_key)
  WHERE deleted_at IS NULL;

INSERT INTO app_config (key, value, description)
VALUES (
  'rca.feedback_loop.enforcement_mode',
  '"advisory"'::jsonb,
  'RCA feedback-loop gate enforcement mode (SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-G). Values: advisory (warn-only, default v1), blocking (Phase-2 cutover), disabled (no-op).'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
