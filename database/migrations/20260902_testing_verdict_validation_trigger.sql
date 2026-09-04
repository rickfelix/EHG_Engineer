-- @approved-by: codestreetlabs@gmail.com
-- SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 / FR-1, FR-2
-- Validates the shape and arithmetic consistency of sub_agent_execution_results.metadata.test_execution
-- for TESTING rows, and soft-warns (never rejects) when a TESTING PASS/CONDITIONAL_PASS row lacks the
-- block entirely, to build a real writer census.
--
-- WHY A TRIGGER, NOT A CHECK CONSTRAINT (database-agent risk assessment, 2026-09-02, measured against
-- the live table -- 26497 rows, 14067 inserts / 26451 updates, 909 legacy TESTING PASS rows already
-- UPDATEd at least once): a CHECK constraint is re-evaluated on EVERY UPDATE regardless of which
-- columns changed and cannot be scoped to INSERT-only. A presence-adjacent CHECK, even NOT VALID,
-- would immediately reject any future UPDATE to those 909 rows. This table is update-dominant
-- (1.9 updates per insert) with live update paths (scripts/hooks/task-subagent-recorder.cjs:329's
-- dedup-update keyed on invocation_id; results-storage.js's own dedup branch). Only a trigger can be
-- scoped to INSERT-only / "metadata actually changed" on UPDATE.
--
-- WHY SHAPE-ONLY, NOT PRESENCE-ENFORCING (same assessment): measured coverage of the four-counter
-- shape is 13/905 (1.4%) of TESTING PASS/CONDITIONAL_PASS rows in the last 30 days, not the 87%
-- the source retrospective claimed (that figure was measured against an unmerged PR, #7961, still
-- open at the time of writing). Flipping presence from warn to reject would immediately break ~27
-- evidence writes/day across every writer that does not yet populate the block -- a second,
-- SD-sized migration of ~85 call sites, deliberately deferred. This migration only rejects blocks
-- that ARE present and malformed/inconsistent; 0 of the 8 currently well-formed blocks and 0 of the
-- 11 legacy free-form-prose blocks (which carry no counter keys at all) are affected.
--
-- Rollback (uncomment + execute via database-agent if needed):
--   DROP TRIGGER IF EXISTS trg_validate_testing_test_execution_ins ON public.sub_agent_execution_results;
--   DROP TRIGGER IF EXISTS trg_validate_testing_test_execution_upd ON public.sub_agent_execution_results;
--   DROP FUNCTION IF EXISTS public.validate_testing_test_execution();

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_testing_test_execution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  te jsonb := NEW.metadata -> 'test_execution';
  ex numeric; pa numeric; fa numeric; sk numeric;
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

  -- Free-form prose blocks (legacy rows) claim no counter keys at all: out of scope for this
  -- migration -- shape/arithmetic validation only applies once a writer opts into the counter shape.
  IF NOT (te ?| ARRAY['tests_executed','tests_passed','tests_failed','tests_skipped']) THEN
    RETURN NEW;
  END IF;

  -- IS DISTINCT FROM, never `=`: a missing key yields NULL from jsonb_typeof, and NULL must mean
  -- REJECT here, not silently pass three-valued logic.
  IF jsonb_typeof(te->'tests_executed') IS DISTINCT FROM 'number'
     OR jsonb_typeof(te->'tests_passed')  IS DISTINCT FROM 'number'
     OR jsonb_typeof(te->'tests_failed')  IS DISTINCT FROM 'number'
     OR jsonb_typeof(te->'tests_skipped') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'validate_testing_test_execution: all four counters must be JSON numbers; got executed=%, passed=%, failed=%, skipped=% (sd_id=%)',
      jsonb_typeof(te->'tests_executed'), jsonb_typeof(te->'tests_passed'),
      jsonb_typeof(te->'tests_failed'),  jsonb_typeof(te->'tests_skipped'),
      NEW.sd_id USING ERRCODE = '23514';
  END IF;

  ex := (te->>'tests_executed')::numeric;
  pa := (te->>'tests_passed')::numeric;
  fa := (te->>'tests_failed')::numeric;
  sk := (te->>'tests_skipped')::numeric;

  IF ex < 0 OR pa < 0 OR fa < 0 OR sk < 0 THEN
    RAISE EXCEPTION 'validate_testing_test_execution: counters must be >= 0; got executed=%, passed=%, failed=%, skipped=% (sd_id=%)',
      ex, pa, fa, sk, NEW.sd_id USING ERRCODE = '23514';
  END IF;

  IF pa + fa + sk > ex THEN
    RAISE EXCEPTION 'validate_testing_test_execution: passed(%) + failed(%) + skipped(%) = % exceeds executed(%) (sd_id=%)',
      pa, fa, sk, pa+fa+sk, ex, NEW.sd_id USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_testing_test_execution() IS 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 FR-1/FR-2: shape + arithmetic validation for TESTING metadata.test_execution when present; soft WARNING census when absent on a PASS/CONDITIONAL_PASS row. Never presence-enforcing.';

DROP TRIGGER IF EXISTS trg_validate_testing_test_execution_ins ON public.sub_agent_execution_results;
CREATE TRIGGER trg_validate_testing_test_execution_ins
BEFORE INSERT ON public.sub_agent_execution_results
FOR EACH ROW
WHEN (NEW.sub_agent_code = 'TESTING')
EXECUTE FUNCTION public.validate_testing_test_execution();

-- Separate UPDATE trigger (OLD cannot be referenced in a WHEN clause shared with INSERT) -- only
-- fires when metadata actually changed, so an unrelated UPDATE (e.g. a status column) never
-- re-triggers validation of an already-accepted block.
DROP TRIGGER IF EXISTS trg_validate_testing_test_execution_upd ON public.sub_agent_execution_results;
CREATE TRIGGER trg_validate_testing_test_execution_upd
BEFORE UPDATE ON public.sub_agent_execution_results
FOR EACH ROW
WHEN (NEW.sub_agent_code = 'TESTING' AND NEW.metadata IS DISTINCT FROM OLD.metadata)
EXECUTE FUNCTION public.validate_testing_test_execution();

COMMIT;
