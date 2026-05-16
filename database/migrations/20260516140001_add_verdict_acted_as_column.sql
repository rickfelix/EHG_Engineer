-- Sibling B FR-B-5: ADD COLUMN verdict_acted_as on validation_audit_log.
-- Closes RISK A-01 priority 16: acted_as measurement on advisory verdicts.
-- ADDITIVE-ONLY: NULL allowed (existing rows grandfathered). Ordinal 20260516140001 > FR-B-4.

ALTER TABLE validation_audit_log ADD COLUMN IF NOT EXISTS verdict_acted_as TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validation_audit_log_verdict_acted_as_check') THEN
    ALTER TABLE validation_audit_log
      ADD CONSTRAINT validation_audit_log_verdict_acted_as_check
      CHECK (verdict_acted_as IS NULL OR verdict_acted_as IN ('binding', 'overridden', 'ignored'));
  END IF;
END $$;

COMMENT ON COLUMN validation_audit_log.verdict_acted_as IS 'Sibling B (SD-WRITERCONSUMER-...-001-B) — acted_as measurement for /goal advisory verdicts. NULL allowed (existing rows grandfathered). Quarterly 30% threshold review per parent ACTED-AS-MEASUREMENT prd_condition (RISK A-01).';
