-- SD-REFILL-00A88NSU — Fix orphaned eva_scheduler_queue entries (scheduler fail-loop / metrics row-growth)
--
-- ROOT CAUSE: database/migrations/20260610_purge_parity_fixture_ventures.sql deleted parity-fixture
-- ventures but left their eva_scheduler_queue rows. The EVA master scheduler re-dispatched these dead
-- ventures every poll; processStage() did .single() on ventures by id, got 0 rows -> CONTEXT_LOAD_FAILED
-- ("Cannot coerce the result to a single JSON object"), emitting a scheduler_dispatch=failure metric each
-- time -> eva_scheduler_metrics grew unbounded (~666 failure rows/hr).
--
-- FR-2: clean up the existing orphaned queue entries (venture_id absent from ventures).
-- FR-3: add a FK with ON DELETE CASCADE so a future venture purge can never re-create the orphan
--       condition. (FR-1 — runtime self-healing eviction — ships in lib/eva/eva-master-scheduler.js.)
--
-- Idempotent: the DELETE is a no-op when already clean; the FK is added only if absent.

BEGIN;

-- FR-2: remove orphaned queue rows (their venture no longer exists). Safe to re-run.
DELETE FROM eva_scheduler_queue q
WHERE NOT EXISTS (SELECT 1 FROM ventures v WHERE v.id = q.venture_id);

-- FR-3: recurrence guard — cascade queue cleanup on venture deletion. Added only if not present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'eva_scheduler_queue'::regclass
      AND contype = 'f'
      AND conname = 'eva_scheduler_queue_venture_id_fkey'
  ) THEN
    ALTER TABLE eva_scheduler_queue
      ADD CONSTRAINT eva_scheduler_queue_venture_id_fkey
      FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
