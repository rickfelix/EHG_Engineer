-- @chairman-gated
-- SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-3 -- derive uat_test_runs.metadata.
-- control_pack_evaluated from control_pack_status (the per-control status map), so the
-- summary boolean can never drift out of sync with its detail again.
--
-- PREDICATE: true iff all 4 required control keys (fence_two_sidedness,
-- canary_mutation_control, live_deployment_binding, minimum_assertion_manifest) are PRESENT
-- in control_pack_status AND none equals the literal string 'not_attempted'. This mirrors
-- lib/eva/uat-control-pack.js:206-226's allRequiredEvaluated for every shape that writer has
-- ever produced (all 4 keys always present); it is deliberately MORE STRICT on a key's
-- theoretical absence (the app layer treats an absent key as not-missing and fails open; this
-- trigger fails closed) as a defensive hardening against any future writer that does not fully
-- populate control_pack_status.
--
-- NEVER derives from control_pack_failures -- PLAN-phase TESTING (evidence 51dde124) found the
-- original scope text's control_pack_failures-based design reintroduces the exact
-- QF-20260830-666 bug class: control_pack_failures is documented by its own writer
-- (lib/uat/result-recorder.js:613) as ambiguous between "evaluated, all passed" and "never
-- evaluated" (both are jsonb null).
--
-- GUARD (5 rounds of adversarial TESTING review, PLAN phase, evidence 51dde124 / 1d78482f /
-- fc38d1fd / d12076b3 / 9b7255fd -- see PRD FR-3 description for the full correction history):
-- `IF TG_OP = 'INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->
-- 'control_pack_status' THEN`. Scoped to the control_pack_status sub-key (not the whole
-- metadata blob), so an UPDATE touching an unrelated metadata sub-key does not recompute. The
-- TG_OP='INSERT' branch forces the body to run on every INSERT, closing a silent-skip gap: an
-- INSERT that sets metadata to an explicit NULL would otherwise evaluate NULL IS DISTINCT FROM
-- NULL = FALSE and skip derivation entirely, leaving control_pack_evaluated undetermined. (A
-- bare, unguarded OLD reference does NOT error on INSERT in PG 11+ -- OLD is given an all-NULL
-- row via tupdesc, not an unassigned-record error; that error is PG<=10 statement-level
-- behavior. Verified live against PG 17.4, always-ROLLBACK, TEMP table, by two independent
-- passes of this SD's own review before this design was finalized.)
--
-- SCOPE: uat_test_runs is COLD (26 rows, ~6/day, ZERO existing triggers on this table today) --
-- the lowest-blast-radius instance of the 3 originally named by this SD, and the only one that
-- ships in this SD. The other 2 (strategic_directives_v2 fence-status, sms_outbound_obligations)
-- are explicitly descoped -- see FR-5/FR-6 in the PRD for why.
--
-- NO BACKFILL: measured live, 24 of 26 rows already carry the correct derived value under this
-- predicate (0 disagreements); the remaining 2 are legacy rows pre-dating this key entirely,
-- which the sole consumer (lib/eva/uat-robustness-gate.js:141) already treats as falsy ≡ false.
--
-- @approved-by: PENDING
--   Chairman verification NOT yet obtained. This file is staged only.
--
-- Rollback: 20260913_uat_control_pack_evaluated_derive_DOWN.sql
--
-- NOTE: no top-level BEGIN/COMMIT -- scripts/apply-migration.js wraps the whole file in its
-- own transaction (this directory's established convention).

-- TR-1: uat_test_runs has zero existing triggers and low write volume (~6/day), but every
-- chairman-gated migration in this SD adding a trigger uses this mitigation regardless,
-- per database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql's
-- documented ACCESS EXCLUSIVE hazard on CREATE TRIGGER (a table-wide lock class, not specific
-- to any one table's current trigger count).
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION derive_uat_control_pack_evaluated()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status jsonb;
  v_required text[] := ARRAY['fence_two_sidedness', 'canary_mutation_control', 'live_deployment_binding', 'minimum_assertion_manifest'];
  v_key text;
  v_evaluated boolean := true;
BEGIN
  IF TG_OP = 'INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status' THEN
    v_status := NEW.metadata->'control_pack_status';
    IF v_status IS NULL OR jsonb_typeof(v_status) != 'object' THEN
      v_evaluated := false;
    ELSE
      FOREACH v_key IN ARRAY v_required LOOP
        IF NOT (v_status ? v_key) OR v_status->>v_key = 'not_attempted' THEN
          v_evaluated := false;
        END IF;
      END LOOP;
    END IF;
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{control_pack_evaluated}', to_jsonb(v_evaluated));
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION derive_uat_control_pack_evaluated() IS
'SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-3: derives uat_test_runs.metadata.control_pack_evaluated '
'from control_pack_status (never control_pack_failures, which is ambiguous per its own writer). '
'Guard is scoped to the control_pack_status sub-key and forced on every INSERT.';

DROP TRIGGER IF EXISTS trg_uat_control_pack_evaluated_derive ON uat_test_runs;
CREATE TRIGGER trg_uat_control_pack_evaluated_derive
  BEFORE INSERT OR UPDATE ON uat_test_runs
  FOR EACH ROW
  EXECUTE FUNCTION derive_uat_control_pack_evaluated();

DO $verify$
DECLARE
  v_fn_exists BOOLEAN;
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'derive_uat_control_pack_evaluated'
  ) INTO v_fn_exists;
  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'FR-3 VERIFY FAILED: function derive_uat_control_pack_evaluated does not exist';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_uat_control_pack_evaluated_derive'
       AND tgrelid = 'public.uat_test_runs'::regclass
  ) INTO v_trigger_exists;
  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'FR-3 VERIFY FAILED: trigger trg_uat_control_pack_evaluated_derive does not exist';
  END IF;
END;
$verify$;
