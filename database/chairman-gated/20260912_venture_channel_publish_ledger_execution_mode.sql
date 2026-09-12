-- @chairman-gated
-- SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4 -- adds a mock/real discriminator to
-- venture_channel_publish_ledger BEFORE any code path that can produce a mock-shaped row
-- exists (per coordinator directive 7c1c6622, Solomon's amended design).
--
-- MEASURED (2026-09-12): evaluateGraduation() (lib/marketing/autonomy-gate.js) already filters
-- .neq('outcome','unknown') and only counts decision='accepted' AND outcome='shipped_clean' rows
-- toward a channel's autonomy graduation streak. recordPublishOutcome() -- the ONLY function that
-- can move a row's outcome away from 'unknown' -- has ZERO production callers anywhere in this
-- codebase today, so no channel can graduate via this mechanism regardless of mock/real activity
-- (a separate, pre-existing gate-on-dead-instrument on the graduation mechanism itself). This
-- migration is forward-looking defense-in-depth: once a future change wires recordPublishOutcome()
-- into a real outcome signal, a mock-shaped send must be structurally incapable of ever being
-- recorded as shipped_clean.
--
-- execution_mode is NOT NULL with NO DEFAULT, deliberately: a future writer that omits the column
-- entirely must fail the INSERT outright (NOT NULL violation), never silently mint a 'live' row by
-- falling through to an implicit default. mock_run_id is an optional correlation key for a future
-- Part B (mock first-stranger run) SD to group a batch of synthetic sends together; nullable since
-- a real send has no run to correlate.
--
-- The 3 existing rows (all decision='pending', outcome='unknown', dated July 2026 -- predate this
-- SD and any mock-mode concept entirely) are backfilled execution_mode='live': genuine proposed
-- publish attempts under the pre-mock-aware code, not synthetic/test activity.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verification NOT yet obtained. This file is staged only -- per coordinator directive
--   7c1c6622: "a migration, so it is a chairman-gated file in your PR and LEAD-FINAL will WAIT on
--   the apply; write it, do not apply it."
--
-- Rollback: 20260912_venture_channel_publish_ledger_execution_mode_DOWN.sql
--
-- NOTE: no top-level BEGIN/COMMIT in this file -- scripts/apply-migration.js wraps the whole
-- file in its own transaction (per this directory's established convention; see e.g.
-- 20260912_sd_mutation_audit_actor_threading.sql).

-- Step 1: add the column nullable so the backfill below can populate existing rows.
ALTER TABLE venture_channel_publish_ledger
  ADD COLUMN IF NOT EXISTS execution_mode TEXT;

ALTER TABLE venture_channel_publish_ledger
  ADD COLUMN IF NOT EXISTS mock_run_id UUID;

-- Step 2: backfill the pre-existing rows (all genuine July 2026 proposed-publish attempts,
-- predating any mock-mode concept) as 'live'.
UPDATE venture_channel_publish_ledger
   SET execution_mode = 'live'
 WHERE execution_mode IS NULL;

-- Step 3: lock the column down -- NOT NULL, no default, and a CHECK restricting the vocabulary
-- to exactly the two values this SD's design uses.
ALTER TABLE venture_channel_publish_ledger
  ALTER COLUMN execution_mode SET NOT NULL;

ALTER TABLE venture_channel_publish_ledger
  ADD CONSTRAINT venture_channel_publish_ledger_execution_mode_check
  CHECK (execution_mode IN ('live', 'mock'));

COMMENT ON COLUMN venture_channel_publish_ledger.execution_mode IS
'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4: live|mock discriminator. NOT NULL, no default -- a '
'writer that forgets this column fails the INSERT rather than silently minting a live-looking row. '
'evaluateGraduation() must exclude execution_mode=mock rows from its streak count once '
'recordPublishOutcome() is ever wired to a real outcome signal.';

COMMENT ON COLUMN venture_channel_publish_ledger.mock_run_id IS
'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4: optional correlation key grouping a batch of synthetic '
'sends from a single mock/test run. NULL for execution_mode=live rows. Consumed by the deferred '
'Part B (mock first-stranger run) follow-on SD.';

DO $verify$
DECLARE
  v_null_count INT;
  v_bad_value_count INT;
BEGIN
  SELECT count(*) INTO v_null_count FROM venture_channel_publish_ledger WHERE execution_mode IS NULL;
  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'FR-4 VERIFY FAILED: % row(s) still have execution_mode IS NULL after backfill', v_null_count;
  END IF;

  SELECT count(*) INTO v_bad_value_count
    FROM venture_channel_publish_ledger
   WHERE execution_mode NOT IN ('live', 'mock');
  IF v_bad_value_count <> 0 THEN
    RAISE EXCEPTION 'FR-4 VERIFY FAILED: % row(s) have an execution_mode outside (live, mock)', v_bad_value_count;
  END IF;
END;
$verify$;
