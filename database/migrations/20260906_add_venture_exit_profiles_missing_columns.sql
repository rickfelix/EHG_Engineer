-- Add venture_exit_profiles.readiness_assessment and .updated_at
-- (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-D)
--
-- Both columns are read by server/routes/eva-exit.js (GET /api/eva/exit/portfolio-readiness
-- and GET /api/eva/exit/:ventureId/rehearsal/latest, both mounted authenticated routes) but
-- never existed on this table. readiness_assessment: a JSONB rehearsal-results field the
-- code's own null-fallback design (`data.readiness_assessment || null`) already anticipates
-- being sometimes-absent; no write path exists anywhere in the repo yet (a separate,
-- larger feature gap -- see the completion-flag finding filed alongside this SD, not built
-- here). updated_at: a standard timestamp column the table's own CREATE omitted, unlike its
-- sibling venture_exit_readiness (same migration family) which already has one.
--
-- Additive-only: two nullable columns plus a standard update trigger, no data migration.

BEGIN;

ALTER TABLE venture_exit_profiles
  ADD COLUMN IF NOT EXISTS readiness_assessment JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN venture_exit_profiles.readiness_assessment IS
  'Cached separation-rehearsal results. Read by server/routes/eva-exit.js; no write path exists yet (Phase 3 feature, SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C) -- restored by SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-D to stop a confirmed crash on GET /api/eva/exit/portfolio-readiness, not to complete the persist step.';
COMMENT ON COLUMN venture_exit_profiles.updated_at IS
  'Standard row-update timestamp, matching sibling table venture_exit_readiness. Auto-maintained by trg_venture_exit_profiles_updated_at.';

-- Standard update-timestamp trigger, matching the convention used elsewhere in this
-- migration family (venture_exit_readiness already has an equivalent).
CREATE OR REPLACE FUNCTION set_venture_exit_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venture_exit_profiles_updated_at ON venture_exit_profiles;
CREATE TRIGGER trg_venture_exit_profiles_updated_at
  BEFORE UPDATE ON venture_exit_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_venture_exit_profiles_updated_at();

COMMIT;
