-- DOWN migration for 20260821_eva_scheduler_queue_status_add_cancelled.sql
-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-4, step 1 of 2) — narrow the CHECK back to the five
-- original values.
-- @chairman-gated
--
-- ⚠ NO `-- @approved-by:` LINE — the chairman supplies it. APPLY IS NOT MINE.
-- ⚠ DO NOT run with --split-statements. ⚠ NO EXPLICIT BEGIN/COMMIT.
--
-- ⚠⚠ APPLY 20260821_eva_scheduler_queue_kill_time_teardown_DOWN.sql FIRST.
--    Narrowing the constraint while sync_ventures_to_eva_ventures_update() can still write
--    'cancelled' leaves a live writer aimed at an illegal value: the next venture cancellation would
--    fail with 23514. Function rollback first, constraint rollback second.
--
-- THIS DOWN IS NOT UNCONDITIONALLY SAFE, AND IT DOES NOT PRETEND TO BE.
-- Narrowing a CHECK is the one direction that CAN invalidate stored rows. If any queue row still
-- holds 'cancelled', the ADD CONSTRAINT below would fail on its own validation scan — so this file
-- ABORTS FIRST with an actionable message instead of letting the operator read a bare 23514 and
-- guess. Deciding what those rows should become (delete? 'completed'? leave the constraint widened?)
-- is a judgement call about live scheduler state, and silently rewriting them to make a rollback
-- succeed would destroy exactly the information needed to make it.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $esqcd_pre$
DECLARE
  v_src       text;
  v_cancelled bigint;
BEGIN
  -- The function must not still be able to produce the value we are about to outlaw.
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sync_ventures_to_eva_ventures_update';
  IF v_src IS NOT NULL AND position('eva_scheduler_queue' in v_src) > 0 THEN
    RAISE EXCEPTION 'DOWN aborted: sync_ventures_to_eva_ventures_update() still writes eva_scheduler_queue — apply 20260821_eva_scheduler_queue_kill_time_teardown_DOWN.sql FIRST, or the next cancellation will fail with 23514';
  END IF;

  SELECT count(*) INTO v_cancelled FROM eva_scheduler_queue WHERE status = 'cancelled';
  IF v_cancelled > 0 THEN
    RAISE EXCEPTION 'DOWN aborted: % queue row(s) hold status=cancelled and would be invalidated by narrowing the constraint. Decide their fate explicitly (see the reporting query in this file), then re-run.', v_cancelled;
  END IF;

  RAISE NOTICE 'esq status narrow pre-assert OK: no cancelled rows, no writer';
END
$esqcd_pre$;

ALTER TABLE public.eva_scheduler_queue
  DROP CONSTRAINT IF EXISTS eva_scheduler_queue_status_check;

ALTER TABLE public.eva_scheduler_queue
  ADD CONSTRAINT eva_scheduler_queue_status_check
  CHECK (status IN ('pending', 'dispatching', 'blocked', 'paused', 'completed'));

DO $esqcd_post$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.eva_scheduler_queue'::regclass
    AND conname  = 'eva_scheduler_queue_status_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'DOWN post-assert failed: eva_scheduler_queue_status_check missing after re-add';
  END IF;
  IF position('cancelled' in v_def) > 0 THEN
    RAISE EXCEPTION 'DOWN post-assert failed: constraint still permits cancelled (def: %)', v_def;
  END IF;
  RAISE NOTICE 'esq status narrow complete; def: %', v_def;
END
$esqcd_post$;

-- REPORTING query for the abort path above — what is holding the rollback up:
--   SELECT q.id, q.venture_id, q.status, v.status AS eva_status, vv.status AS ventures_status
--     FROM eva_scheduler_queue q
--     JOIN eva_ventures v  ON v.id  = q.venture_id
--     JOIN ventures     vv ON vv.id = v.venture_id
--    WHERE q.status = 'cancelled';
