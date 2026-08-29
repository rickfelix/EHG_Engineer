-- solomon_advice_outcome_ledger: widen the decision CHECK domain to add 'superseded'.
-- SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-001.
--
-- WHY: at least two live rows (4eb111f8-917c-44dc-a343-4d7b77435a5d, decision=rejected;
-- 0be7e5a8-6ced-453c-9e81-01736eb9ae34, decision=partial) carry a true disposition of
-- "superseded by a later revision/resend" that only exists as outcome_ref prose today --
-- the existing 5-value domain (pending/accepted/rejected/partial/deferred) has no honest
-- structured representation for "this advisory was withdrawn/replaced, not judged on its
-- merits". Forcing these into rejected/partial mislabels them as quality judgments they are
-- not (LEAD-phase VALIDATION sub-agent finding, evidence d3dd1dba-098b-47e4-8fe1-775ff761b32e).
--
-- Purely additive: widens an existing CHECK constraint (DROP + re-ADD with the superset
-- list), same pattern already established for the sibling `outcome` column in
-- 20260819_solomon_ledger_outcome_not_applicable.sql / 20260828_solomon_ledger_outcome_
-- unmeasurable.sql. No column added, no existing row's value becomes invalid, no data
-- rewritten by this file (the actual re-stamp of the two known rows ships as a separate
-- application-level write in the same PR, per this SD's FR-2).
--
-- Constraint name confirmed via live pg_constraint introspection (EXEC phase, 2026-08-29):
-- solomon_advice_outcome_ledger_decision_check.
--
-- Uses bare $$ (not a named dollar-quote tag) deliberately, so this file survives EITHER
-- scripts/apply-migration.js (default whole-file mode) OR scripts/run-sql-migration.js
-- (whose statement splitter was found this SD to only track bare $$, breaking any file that
-- uses named tags like $foo$ -- see 20260828's header for the finding).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Pre-assert: the constraint is the one we think it is, and the new value is not already
-- present (idempotency guard against double-apply).
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.solomon_advice_outcome_ledger'::regclass
    AND conname  = 'solomon_advice_outcome_ledger_decision_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'aborted: solomon_advice_outcome_ledger_decision_check not found — investigate before applying';
  END IF;
  IF position('superseded' in v_def) > 0 THEN
    RAISE EXCEPTION 'aborted: solomon_advice_outcome_ledger_decision_check already permits superseded — already applied, nothing to do';
  END IF;

  RAISE NOTICE 'solomon ledger decision widen pre-assert OK; current def: %', v_def;
END
$$;

ALTER TABLE public.solomon_advice_outcome_ledger
  DROP CONSTRAINT IF EXISTS solomon_advice_outcome_ledger_decision_check;

ALTER TABLE public.solomon_advice_outcome_ledger
  ADD CONSTRAINT solomon_advice_outcome_ledger_decision_check
  CHECK (decision IN ('pending', 'accepted', 'rejected', 'partial', 'deferred', 'superseded'));

COMMENT ON COLUMN public.solomon_advice_outcome_ledger.decision IS 'Chairman/Solomon disposition on the advisory itself (distinct from outcome, which tracks the downstream result). ''superseded'' (SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-001) is for an advisory withdrawn/replaced by a later revision or resend -- distinct from ''rejected'' (judged on its merits and declined).';

-- Post-assert: exercised, not merely read back -- an insert-and-undo inside a subtransaction
-- proves the constraint actually admits the new value.
DO $$
DECLARE
  v_def text;
  v_id  uuid;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.solomon_advice_outcome_ledger'::regclass
    AND conname  = 'solomon_advice_outcome_ledger_decision_check';
  IF v_def IS NULL OR position('superseded' in v_def) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: widened constraint missing superseded after ALTER (def: %)', COALESCE(v_def, '<missing>');
  END IF;

  SELECT id INTO v_id FROM solomon_advice_outcome_ledger LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      UPDATE solomon_advice_outcome_ledger SET decision = 'superseded' WHERE id = v_id;
      RAISE EXCEPTION 'saolu_decision_probe_ok';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'saolu_decision_probe_ok' THEN RAISE; END IF;
        RAISE NOTICE 'solomon ledger decision widen: constraint verified by exercise (superseded accepted, probe undone)';
    END;
  END IF;

  RAISE NOTICE 'solomon ledger decision widen complete; new def: %', v_def;
END
$$;

-- VERIFY (run after apply):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.solomon_advice_outcome_ledger'::regclass
--      AND conname  = 'solomon_advice_outcome_ledger_decision_check';
