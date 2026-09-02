-- @approved-by: codestreetlabs@gmail.com
-- SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 / FR-1 corrective (RCA 2026-09-02, PLAN_VERIFICATION)
--
-- CORRECTS 20260902_testing_verdict_validation_trigger.sql, already applied to production.
-- That migration's skip-guard used `te ?| ARRAY[four keys]` (ANY key present) as a proxy for
-- "writer opted into the four-counter contract". This only skips zero-key blocks; a block
-- carrying SOME but not all four keys (a legacy partial shape, e.g. {tests_passed, tests_failed}
-- with no tests_executed) fell through to the strict all-four-numeric check and was
-- hard-rejected with 23514 -- confirmed live against production row 07502310. Live census of the
-- 21 TESTING rows carrying metadata.test_execution: 13 complete, 3 partial (14%), 5 zero-key.
-- The migration's own header claimed "0 of the 11 legacy free-form-prose blocks are affected",
-- true of the zero-key bucket, silent on the partial bucket it never censused.
--
-- REJECTED ALTERNATIVE: widening the guard from `?|` to `?&` (skip unless ALL four keys
-- present). Measured to be WORSE than the bug it fixes: the gate reader
-- (lib/sub-agents/testing/test-execution-record.js:isMeasuredExecution) trusts a block as
-- "measured=true" based on tests_executed alone. Under `?&`, a block like
-- {tests_executed:5, tests_passed:900} (5 executed, 900 "passed") would be SKIPPED by the
-- trigger (not all four keys) while the reader reports it fully measured at 100/100 --
-- strictly worse than no trigger, because the trigger's existence is what makes the row look
-- vetted. database-agent's matrix found 5 malformed classes flip REJECT->ACCEPT under `?&`, all
-- in the quadrant the reader trusts.
--
-- FIX: four-branch union guard.
--   1. Zero counter keys at all -> skip (legacy prose; unchanged).
--   2. Type + non-negativity enforced on EVERY counter key that IS present, regardless of
--      completeness (closes a gap neither `?|` nor `?&` alone would catch: a partial block with
--      a malformed present key, e.g. {tests_passed: "banana"}, was previously invisible).
--   3. If tests_executed is present -> require ALL FOUR keys and full arithmetic consistency.
--      tests_executed is the sole anchor key the reader trusts as "measured"; concentrating
--      strictness there means {shapes the trigger validates} is a superset of {shapes the
--      reader trusts} -- the invariant `?&` violated.
--   4. tests_executed absent but some counters present -> accept, no RAISE WARNING (nothing in
--      this repo consumes RAISE WARNING -- grepped, zero readers; the existing FR-2 census is
--      write-only. Any operator-facing signal for this bucket belongs in the gate's
--      warnings[] array, which IS surfaced and persisted).
--
-- Companion reader fix (same SD, same RCA): lib/sub-agents/testing/test-execution-record.js
-- isMeasuredExecution() now returns null (not false) when tests_executed is absent, reserving
-- false for tests_executed===0 (genuine "nothing ran"). Without this, the same partial rows this
-- migration now accepts would still hard-block at the EXEC-TO-PLAN gate (mandatory-testing-
-- validation.js), since measured=false is REQUIRED-tier blocking and measured=null is not --
-- fixing only the trigger without the reader leaves the second, higher-severity defect live.
--
-- Verified zero-change against all 21 existing rows (13 complete + 3 partial + 5 zero-key
-- byte-identical outcome pre/post); differs from the prior version only prospectively.
--
-- Rollback (uncomment + execute via database-agent if needed -- reverts to the PRIOR corrective
-- state, i.e. re-applies the original 20260902_testing_verdict_validation_trigger.sql body):
--   -- see that file's CREATE OR REPLACE FUNCTION body for the pre-fix definition.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_testing_test_execution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  te jsonb := NEW.metadata -> 'test_execution';
  ex numeric; pa numeric; fa numeric; sk numeric;
  k text;
BEGIN
  IF te IS NULL OR jsonb_typeof(te) = 'null' THEN
    -- FR-2: no block at all on a TESTING PASS/CONDITIONAL_PASS row -- soft census, never a reject.
    IF NEW.sub_agent_code = 'TESTING' AND NEW.verdict IN ('PASS', 'CONDITIONAL_PASS') THEN
      RAISE WARNING 'validate_testing_test_execution: TESTING % row has no test_execution block (sd_id=%)', NEW.verdict, NEW.sd_id;
    END IF;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(te) <> 'object' THEN
    RAISE EXCEPTION 'validate_testing_test_execution: metadata.test_execution must be a JSON object, got % (sd_id=%)',
      jsonb_typeof(te), NEW.sd_id USING ERRCODE = '23514';
  END IF;

  -- Branch 1: zero counter keys at all -- free-form prose block, out of scope entirely.
  IF NOT (te ?| ARRAY['tests_executed','tests_passed','tests_failed','tests_skipped']) THEN
    RETURN NEW;
  END IF;

  -- Branch 2: type + non-negativity enforced on every counter key that IS present, regardless
  -- of completeness -- catches a malformed value inside an otherwise-partial block.
  FOREACH k IN ARRAY ARRAY['tests_executed','tests_passed','tests_failed','tests_skipped'] LOOP
    IF te ? k THEN
      IF jsonb_typeof(te->k) <> 'number' THEN
        RAISE EXCEPTION 'validate_testing_test_execution: % must be a JSON number if present; got % (sd_id=%)',
          k, jsonb_typeof(te->k), NEW.sd_id USING ERRCODE = '23514';
      END IF;
      IF (te->>k)::numeric < 0 THEN
        RAISE EXCEPTION 'validate_testing_test_execution: % must be >= 0; got % (sd_id=%)',
          k, te->>k, NEW.sd_id USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  -- Branch 3: tests_executed present -> it is the sole anchor key the gate reader trusts as
  -- "measured", so require ALL FOUR keys and full arithmetic consistency here.
  IF te ? 'tests_executed' THEN
    IF NOT (te ?& ARRAY['tests_executed','tests_passed','tests_failed','tests_skipped']) THEN
      RAISE EXCEPTION 'validate_testing_test_execution: tests_executed present requires all four counters (tests_executed, tests_passed, tests_failed, tests_skipped); got % (sd_id=%)',
        te, NEW.sd_id USING ERRCODE = '23514';
    END IF;

    ex := (te->>'tests_executed')::numeric;
    pa := (te->>'tests_passed')::numeric;
    fa := (te->>'tests_failed')::numeric;
    sk := (te->>'tests_skipped')::numeric;

    IF pa + fa + sk > ex THEN
      RAISE EXCEPTION 'validate_testing_test_execution: passed(%) + failed(%) + skipped(%) = % exceeds executed(%) (sd_id=%)',
        pa, fa, sk, pa+fa+sk, ex, NEW.sd_id USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Branch 4 (implicit): tests_executed absent, some counters present -- already passed the
  -- per-key type/sign check in Branch 2; accepted here with no further enforcement and no
  -- RAISE WARNING (nothing in this repo consumes it -- see header).

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_testing_test_execution() IS 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 FR-1/FR-2 (partial-shape corrective, 2026-09-02): shape + arithmetic validation for TESTING metadata.test_execution when tests_executed is present (the sole key the gate reader trusts as "measured"); per-key type/sign checks on any counter present regardless of completeness; a block missing tests_executed but carrying other valid counters is accepted untouched. Soft WARNING census only when the block is absent entirely on a PASS/CONDITIONAL_PASS row. Never presence-enforcing. Triggers unchanged -- CREATE OR REPLACE preserves the function OID and both trigger bindings.';

-- Triggers intentionally untouched: CREATE OR REPLACE FUNCTION preserves the function's OID and
-- both trg_validate_testing_test_execution_ins/_upd keep pointing at it (verified live:
-- pg_trigger.tgfoid unchanged across two consecutive CREATE OR REPLACE calls).

COMMIT;
