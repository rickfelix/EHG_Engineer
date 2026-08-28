-- DOWN migration for 20260828_solomon_ledger_outcome_unmeasurable.sql
-- SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002 (TR-1) — narrow the CHECK back to the 4 original values.
--
-- THIS DOWN IS NOT UNCONDITIONALLY SAFE, AND IT DOES NOT PRETEND TO BE. Narrowing a CHECK is the
-- one direction that CAN invalidate stored rows. If any ledger row already holds 'unmeasurable' or
-- 'not_applicable', the ADD CONSTRAINT below would fail its own validation scan — so this file
-- ABORTS FIRST with an actionable count instead of letting the operator read a bare 23514 and
-- guess. Deciding what those rows should become (reset to 'unknown'? leave the constraint widened?)
-- is a judgement call about live backfill state, and silently rewriting them to force a rollback to
-- succeed would destroy exactly the information needed to make that call.
--
-- requires-chairman-apply

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $saolud_pre$
DECLARE
  v_unmeasurable   bigint;
  v_not_applicable bigint;
BEGIN
  SELECT count(*) INTO v_unmeasurable FROM solomon_advice_outcome_ledger WHERE outcome = 'unmeasurable';
  SELECT count(*) INTO v_not_applicable FROM solomon_advice_outcome_ledger WHERE outcome = 'not_applicable';
  IF v_unmeasurable > 0 OR v_not_applicable > 0 THEN
    RAISE EXCEPTION 'DOWN aborted: % row(s) hold outcome=unmeasurable and % row(s) hold outcome=not_applicable — narrowing the constraint would invalidate them. Decide their fate explicitly (e.g. reset to unknown) before re-running this DOWN.', v_unmeasurable, v_not_applicable;
  END IF;

  RAISE NOTICE 'solomon ledger outcome narrow pre-assert OK: no unmeasurable/not_applicable rows';
END
$saolud_pre$;

ALTER TABLE public.solomon_advice_outcome_ledger
  DROP CONSTRAINT IF EXISTS solomon_advice_outcome_ledger_outcome_check;

ALTER TABLE public.solomon_advice_outcome_ledger
  ADD CONSTRAINT solomon_advice_outcome_ledger_outcome_check
  CHECK (outcome IN ('unknown', 'shipped_clean', 'reverted', 'caused_rework'));

DO $saolud_post$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.solomon_advice_outcome_ledger'::regclass
    AND conname  = 'solomon_advice_outcome_ledger_outcome_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'DOWN post-assert failed: solomon_advice_outcome_ledger_outcome_check missing after re-add';
  END IF;
  IF position('unmeasurable' in v_def) > 0 OR position('not_applicable' in v_def) > 0 THEN
    RAISE EXCEPTION 'DOWN post-assert failed: constraint still permits a widened value (def: %)', v_def;
  END IF;
  RAISE NOTICE 'solomon ledger outcome narrow complete; def: %', v_def;
END
$saolud_post$;

-- REPORTING query for the abort path above:
--   SELECT id, outcome, outcome_ref, closed_by, closed_at FROM solomon_advice_outcome_ledger
--    WHERE outcome IN ('unmeasurable', 'not_applicable');
