-- SD-LEO-INFRA-BACKLOG-DISPOSITION-COLUMN-WORKFLOW-001 (FR-1)
-- Add a first-class disposition column to sd_backlog_map so vision ordinal-23
-- ('Backlog distilled and dispositioned') can read an actual disposition instead of the
-- completion_status='COMPLETED' lower-bound proxy.
--
-- ADDITIVE + NULLABLE + REVERSIBLE: no data migration, no existing-row change. NULL means
-- un-dispositioned (still counts in the backlog gauge denominator, not the numerator). The
-- CHECK allows NULL OR one of the four terminal dispositions. Backfill is the separate,
-- idempotent distillation pass (scripts/distill-backlog-dispositions.mjs), NOT this migration.
--
-- Rollback: ALTER TABLE sd_backlog_map DROP COLUMN disposition;

ALTER TABLE sd_backlog_map
  ADD COLUMN IF NOT EXISTS disposition text DEFAULT NULL;

ALTER TABLE sd_backlog_map
  DROP CONSTRAINT IF EXISTS chk_sd_backlog_map_disposition;

ALTER TABLE sd_backlog_map
  ADD CONSTRAINT chk_sd_backlog_map_disposition
  CHECK (disposition IS NULL OR disposition IN ('BUILD', 'RESEARCH', 'REFERENCE', 'CANCEL'));

COMMENT ON COLUMN sd_backlog_map.disposition IS
  'Distillation verdict for the backlog item: BUILD|RESEARCH|REFERENCE|CANCEL, or NULL when un-dispositioned. Set by scripts/distill-backlog-dispositions.mjs (completion_status proxy + conversion_ledger feeder) or by a human; read by vision ordinal-23. SD-LEO-INFRA-BACKLOG-DISPOSITION-COLUMN-WORKFLOW-001.';
