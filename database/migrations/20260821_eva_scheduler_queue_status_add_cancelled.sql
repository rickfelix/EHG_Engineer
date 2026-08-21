-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-4, step 1 of 2)
-- @chairman-gated
--
-- ⚠ NO `-- @approved-by:` LINE. TIER-2 DDL needs the 3-factor chairman gate (`--prod-deploy` +
--   single-use 1h token + an `@approved-by` header matching `git config user.email`, enforced by
--   scripts/lib/migration-guards.js). The builder holds none of those and must not forge one.
--   APPLY IS NOT MINE.
--
-- ⚠⚠ APPLY ORDER IS LOAD-BEARING — THIS FILE MUST BE APPLIED **BEFORE**
--    20260821_eva_scheduler_queue_kill_time_teardown.sql.
--    That file teaches sync_ventures_to_eva_ventures_update() to write status='cancelled'. Applied
--    first, it would make EVERY venture cancellation fail with 23514 (check constraint
--    eva_scheduler_queue_status_check) — i.e. `UPDATE ventures SET status='cancelled'` would start
--    throwing across the whole application. This is the same ordering hazard called out in
--    20260610_purge_management_reviews_pollution.sql; the two files ship together, only the
--    apply-order matters.
--        1.  node scripts/apply-migration.js database/migrations/20260821_eva_scheduler_queue_status_add_cancelled.sql --prod-deploy
--        2.  (verify the constraint below)
--        3.  node scripts/apply-migration.js database/migrations/20260821_eva_scheduler_queue_kill_time_teardown.sql --prod-deploy
--
-- ⚠ DO NOT run this file with apply-migration.js --split-statements. The named dollar-quoted DO
--   blocks ($esqc_pre$ / $esqc_post$) are only safe on the DEFAULT single-query path;
--   splitPostgreSQLStatements recognizes bare $$ but not named $tag$ and would shred them.
--
-- ⚠ NO EXPLICIT BEGIN/COMMIT — apply-migration.js wraps the file (scripts/apply-migration.js:341/430).
--   The 20260809_semantic_index migration whose DROP+re-ADD shape this mirrors does carry its own
--   BEGIN/COMMIT; that is harmless there but is not copied here, because an inner COMMIT would end
--   the wrapper's transaction and break atomicity with the verification block below.
--
-- WHAT: add 'cancelled' to eva_scheduler_queue.status's legal values.
--
-- WHY A NEW VALUE RATHER THAN REUSING ONE THAT EXISTS. The four existing terminal-ish values all
-- mean something else, and making one of them do double duty would be a column that misreports what
-- it holds:
--   'completed' — the venture finished its cycle. A killed venture did not complete anything.
--   'paused'    — resumable. A killed venture must never be resumed by the scheduler.
--   'blocked'   — waiting on something; still live work.
--   'pending'   — the hazardous state this SD exists to stop.
-- 'cancelled' is the honest name, and it also matches the source vocabulary (ventures.status is
-- already 'cancelled' for exactly these rows — measured: all 45 killed-venture queue rows resolve to
-- ventures.status='cancelled', 2026-08-21).
--
-- SAFETY: widening a CHECK is purely additive. Every value currently stored remains legal, so this
-- cannot invalidate an existing row. Live 2026-08-21 the constraint is
--   CHECK (status = ANY (ARRAY['pending','dispatching','blocked','paused','completed']))
-- and all 113 rows hold 'pending'. Asserted below rather than assumed.
--
-- INTERACTION WITH select_schedulable_ventures(): that selector filters `q.status = 'pending'`, so a
-- row moved to 'cancelled' becomes unschedulable with NO change to the selector. That is why this
-- pair closes the hazard at the source without touching the dispatch path.

-- Fail clean rather than stalling a live table if the ALTER has to wait behind a reader.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1) Pre-assert: nothing is about to be invalidated, and the constraint is the one we think it is.
DO $esqc_pre$
DECLARE
  v_def  text;
  v_rogue bigint;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.eva_scheduler_queue'::regclass
    AND conname  = 'eva_scheduler_queue_status_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'aborted: eva_scheduler_queue_status_check not found — the constraint this migration widens does not exist under that name, investigate before applying';
  END IF;
  IF position('cancelled' in v_def) > 0 THEN
    RAISE EXCEPTION 'aborted: eva_scheduler_queue_status_check already permits cancelled — already applied, nothing to do';
  END IF;

  -- Every stored value must be legal under the NEW list too (it is a superset, so this can only
  -- fail if the live data already violates the OLD constraint — worth knowing before we touch it).
  SELECT count(*) INTO v_rogue FROM eva_scheduler_queue
  WHERE status NOT IN ('pending','dispatching','blocked','paused','completed','cancelled');
  IF v_rogue > 0 THEN
    RAISE EXCEPTION 'aborted: % row(s) hold a status outside the widened list — widening would not cover them', v_rogue;
  END IF;

  RAISE NOTICE 'esq status widen pre-assert OK; current def: %', v_def;
END
$esqc_pre$;

-- 2) DROP + re-ADD with the widened IN-list. All five original values are preserved verbatim;
--    'cancelled' is the only addition.
ALTER TABLE public.eva_scheduler_queue
  DROP CONSTRAINT IF EXISTS eva_scheduler_queue_status_check;

ALTER TABLE public.eva_scheduler_queue
  ADD CONSTRAINT eva_scheduler_queue_status_check
  CHECK (status IN (
    'pending', 'dispatching', 'blocked', 'paused', 'completed',
    -- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 FR-4: kill-time teardown terminal state.
    -- Written by sync_ventures_to_eva_ventures_update() when a venture is cancelled.
    'cancelled'
  ));

-- 3) Post-assert: the widened constraint is live, and it really does accept the new value.
--    Proving acceptance by EXERCISING it (insert-and-undo inside a subtransaction) rather than by
--    reading the definition back — a definition that merely CONTAINS the string 'cancelled' is not
--    proof the constraint admits it.
DO $esqc_post$
DECLARE
  v_def  text;
  v_id   uuid;
  v_kept text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.eva_scheduler_queue'::regclass
    AND conname  = 'eva_scheduler_queue_status_check';
  IF v_def IS NULL OR position('cancelled' in v_def) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: widened constraint not present after ALTER (def: %)', COALESCE(v_def, '<missing>');
  END IF;
  FOR v_kept IN SELECT unnest(ARRAY['pending','dispatching','blocked','paused','completed'])
  LOOP
    IF position(v_kept in v_def) = 0 THEN
      RAISE EXCEPTION 'post-assert failed: original value % was dropped from the widened constraint', v_kept;
    END IF;
  END LOOP;

  -- Exercise it: flip a real row to 'cancelled', then undo. If the constraint rejects the value the
  -- UPDATE raises 23514 and the whole migration aborts.
  SELECT id INTO v_id FROM eva_scheduler_queue LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      UPDATE eva_scheduler_queue SET status = 'cancelled' WHERE id = v_id;
      RAISE EXCEPTION 'esqc_probe_ok';   -- forced abort of THIS subtransaction only
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'esqc_probe_ok' THEN RAISE; END IF;   -- a real failure still propagates
        RAISE NOTICE 'esq status widen: constraint verified by exercise (cancelled accepted, probe undone)';
    END;
  END IF;

  RAISE NOTICE 'esq status widen complete; new def: %', v_def;
END
$esqc_post$;

-- VERIFY (run after apply; this file's existence is a lead, never proof a live object changed):
--
--   -- 1. the widened definition (must contain all six values)
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.eva_scheduler_queue'::regclass
--      AND conname  = 'eva_scheduler_queue_status_check';
--
--   -- 2. nothing invalidated (must be 0)
--   SELECT count(*) FROM eva_scheduler_queue
--    WHERE status NOT IN ('pending','dispatching','blocked','paused','completed','cancelled');
