-- solomon_advice_outcome_ledger: widen the outcome CHECK domain to add 'unmeasurable', and (as a
-- union, not a separate step) 'not_applicable' — SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002 (TR-1).
--
-- SUPERSEDES database/migrations/20260819_solomon_ledger_outcome_not_applicable.sql. That file is
-- STILL UNAPPLIED (live pg_constraint introspection 2026-08-28: the constraint is only
-- CHECK (outcome IN ('unknown','shipped_clean','reverted','caused_rework')) — 4 values, no
-- 'not_applicable') and is left UNTOUCHED on disk (editing a historical migration file, even
-- comment-only, is avoided as a matter of migration hygiene). Both files DROP + re-ADD the SAME
-- named constraint (solomon_advice_outcome_ledger_outcome_check), so whichever is applied LAST
-- would silently overwrite the other's added value if the two lists didn't already agree — this
-- file's list is the UNION of both pending values, so applying ONLY this one (and never 20260819
-- separately) re-establishes everything 20260819 would have added, plus 'unmeasurable'.
--
-- WHY 'unmeasurable' (SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002): the correlation-leg gap (accepted
-- advisory rows with no outcome_sd_key) has ~954 measured rows (2026-08-28) whose outcome_ref is
-- narrative prose / a bare commit sha / a QF-excluded id — no instrument will EVER be able to
-- watch these rows. Forcing them to stay 'unknown' forever is the same lying-instrument defect
-- 20260819's 'not_applicable' value already exists to close for the sibling (rejected-leg) case;
-- 'unmeasurable' is the accepted-leg's honest equivalent, distinct from 'not_applicable' because
-- the two legs' decision states differ (accepted vs rejected) even though the underlying "no
-- traceable artifact" reason is the same shape.
--
-- Purely additive: widens an existing CHECK constraint (DROP + re-ADD with the superset list). No
-- column added, no existing row's value becomes invalid, no data rewritten. Constraint name
-- confirmed via live pg_constraint introspection (2026-08-28):
-- solomon_advice_outcome_ledger_outcome_check.
--
-- ACCURACY-MATH IMPACT (SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002 FR-3): writing 'unmeasurable' onto
-- a formerly-'unknown' accepted row is NOT accuracy-math-neutral by itself — scripts/
-- fleet-dashboard.cjs's existing accuracy-denominator exclusion is keyed on the literal string
-- 'unknown', so a bare write of this value would silently regress the published accuracy figure.
-- FR-3 (shipped in the SAME PR as the writer that uses this new value) extends that exclusion to
-- also cover 'unmeasurable' — see scripts/fleet-dashboard.cjs and tests/unit/
-- fleet-dashboard-solomon-ledger-rollup.test.js (TS-8). Do NOT apply this migration and start the
-- backfill (scripts/solomon-ledger-reconcile.cjs --backfill) before that fix has shipped.
--
-- STAGED, NOT YET APPROVED FOR APPLY. Application code (lib/ledger/outcome-writer.js,
-- scripts/solomon-ledger-reconcile.cjs's backfill mode) degrades safely if this migration has not
-- yet been applied — an attempted 'unmeasurable' write fails the CHECK constraint (23514) and is
-- classified 'expected-pre-migration' (never silently masked as success, never counted as
-- 'unaccounted'), exercised only via unit tests with a mocked DB until this lands, mirroring
-- 20260819's documented pattern.
--
-- requires-chairman-apply
--
-- No explicit transaction wrapper needed here — apply-migration.js wraps the whole file (see
-- 20260821_eva_scheduler_queue_status_add_cancelled.sql's header for why an inner BEGIN/COMMIT is
-- avoided when the runner already provides one); this migration is a single DROP+ADD pair with no
-- dollar-quoted DO blocks, so either both statements land or neither does either way.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Pre-assert: the constraint is the one we think it is, and neither new value is already present
-- (idempotency guard against double-apply).
DO $saolu_pre$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.solomon_advice_outcome_ledger'::regclass
    AND conname  = 'solomon_advice_outcome_ledger_outcome_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'aborted: solomon_advice_outcome_ledger_outcome_check not found — investigate before applying';
  END IF;
  IF position('unmeasurable' in v_def) > 0 THEN
    RAISE EXCEPTION 'aborted: solomon_advice_outcome_ledger_outcome_check already permits unmeasurable — already applied, nothing to do';
  END IF;

  RAISE NOTICE 'solomon ledger outcome widen pre-assert OK; current def: %', v_def;
END
$saolu_pre$;

ALTER TABLE public.solomon_advice_outcome_ledger
  DROP CONSTRAINT IF EXISTS solomon_advice_outcome_ledger_outcome_check;

ALTER TABLE public.solomon_advice_outcome_ledger
  ADD CONSTRAINT solomon_advice_outcome_ledger_outcome_check
  CHECK (outcome IN (
    'unknown', 'shipped_clean', 'reverted', 'caused_rework',
    -- 20260819_solomon_ledger_outcome_not_applicable.sql's value (superseded by this file, union'd
    -- here so applying only this migration is sufficient):
    'not_applicable',
    -- SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002: accepted-leg "no traceable artifact, never will be" state.
    'unmeasurable'
  ));

COMMENT ON COLUMN public.solomon_advice_outcome_ledger.outcome IS 'Set from the ACTUAL downstream SD/CI/QF/PR result, never from Solomon''s self-report (CONST-002 proposer!=approver). ''not_applicable'' (SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001) is a correctly rejected/refuted advisory with no downstream artifact to trace. ''unmeasurable'' (SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002) is the accepted-leg equivalent: no instrument will ever be able to resolve this row. Both are distinct from ''unknown'' (not yet determined, still on an active resolution path).';

-- Post-assert: exercised, not merely read back — an insert-and-undo inside a subtransaction proves
-- the constraint actually admits both new values, not just that the definition string contains them.
DO $saolu_post$
DECLARE
  v_def  text;
  v_id   uuid;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.solomon_advice_outcome_ledger'::regclass
    AND conname  = 'solomon_advice_outcome_ledger_outcome_check';
  IF v_def IS NULL OR position('unmeasurable' in v_def) = 0 OR position('not_applicable' in v_def) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: widened constraint missing an expected value after ALTER (def: %)', COALESCE(v_def, '<missing>');
  END IF;

  SELECT id INTO v_id FROM solomon_advice_outcome_ledger LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      UPDATE solomon_advice_outcome_ledger SET outcome = 'unmeasurable' WHERE id = v_id;
      RAISE EXCEPTION 'saolu_probe_ok';   -- forced abort of THIS subtransaction only
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'saolu_probe_ok' THEN RAISE; END IF;
        RAISE NOTICE 'solomon ledger outcome widen: constraint verified by exercise (unmeasurable accepted, probe undone)';
    END;
  END IF;

  RAISE NOTICE 'solomon ledger outcome widen complete; new def: %', v_def;
END
$saolu_post$;

-- VERIFY (run after apply; this file's existence is a lead, never proof a live object changed):
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.solomon_advice_outcome_ledger'::regclass
--      AND conname  = 'solomon_advice_outcome_ledger_outcome_check';
--
--   -- must be 0 (nothing invalidated):
--   SELECT count(*) FROM solomon_advice_outcome_ledger
--    WHERE outcome NOT IN ('unknown','shipped_clean','reverted','caused_rework','not_applicable','unmeasurable');
