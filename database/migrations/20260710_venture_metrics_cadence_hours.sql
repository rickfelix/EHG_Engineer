-- Migration: 20260710_venture_metrics_cadence_hours.sql
-- SD: SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-2)
-- Purpose: per-venture override for the funnel gauge's declared-writer expected
--          cadence (lib/telemetry/funnel-gauge.mjs). NULL = use the module's
--          DEFAULT_CADENCE_HOURS (30h, buffered over the daily pull cron).
--          Additive, nullable — zero-risk to existing consumers of applications.
-- @approved-by: codestreetlabs@gmail.com

ALTER TABLE applications ADD COLUMN IF NOT EXISTS metrics_cadence_hours INTEGER;

COMMENT ON COLUMN applications.metrics_cadence_hours IS 'Declared expected /v1/metrics pull cadence in hours for the funnel gauge STALE check (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A). NULL = use lib/telemetry/funnel-gauge.mjs DEFAULT_CADENCE_HOURS.';

-- ============================================================================
-- ROLLBACK (manual):
--   ALTER TABLE applications DROP COLUMN IF EXISTS metrics_cadence_hours;
-- ============================================================================
