-- SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-1
-- Additive-only migration: ADD COLUMN lineage_attribution_confidence + lineage_verdict
-- on strategic_directives_v2. CHECK constraints on TEXT enum + NUMERIC range.
-- NULL grandfathered for rows with created_at < cutover_ts (no retroactive blocking).
-- RISK C0-R-03 mitigation: separate TEXT column, NOT JSONB CHECK on metadata.

BEGIN;

ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS lineage_attribution_confidence NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS lineage_verdict TEXT NULL;

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT chk_lineage_verdict_enum
  CHECK (
    lineage_verdict IS NULL
    OR lineage_verdict IN ('BACKFILLED_HIGH', 'BACKFILLED_LOW_CONFIDENCE', 'GRANDFATHERED_NO_VALIDATION')
  );

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT chk_lineage_attribution_confidence_range
  CHECK (
    lineage_attribution_confidence IS NULL
    OR (lineage_attribution_confidence >= 0 AND lineage_attribution_confidence <= 100)
  );

-- Cutover policy: NULL allowed for created_at < cutover_ts is implicit
-- (the CHECK accepts NULL). Forward writes set verdict + confidence.

COMMIT;
