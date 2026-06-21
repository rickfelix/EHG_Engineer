-- DOWN for 20260621_fix_orphaned_scheduler_queue_entries.sql (SD-REFILL-00A88NSU)
--
-- Reverses FR-3 only. The FR-2 orphan DELETE is NOT reversible (the rows referenced ventures that no
-- longer exist; restoring meaningless orphans is undesirable and would re-trigger the fail-loop).

BEGIN;

ALTER TABLE eva_scheduler_queue
  DROP CONSTRAINT IF EXISTS eva_scheduler_queue_venture_id_fkey;

COMMIT;
