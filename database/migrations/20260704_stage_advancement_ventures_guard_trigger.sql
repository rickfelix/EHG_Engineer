-- =============================================================================
-- Migration: BEFORE UPDATE trigger on ventures.current_lifecycle_stage --
--            closes the RLS/service-role bypass gap (FR-7)
-- SD: SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-7)
-- Date: 2026-07-04
--
-- STATUS: LIVE — applied to the production DB (verified in pg_proc/pg_trigger
-- 2026-07-11, SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001 doc-drift correction;
-- the chairman GO decision has been exercised). Historical staging note: per the
-- chairman-gated migration convention (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-
-- GATED-EXEMPT-001), applying it is a separate, explicit chairman GO decision --
-- this is the highest-blast-radius migration of this SD's five (it is a
-- database-level backstop over EVERY write path, known or not), so it should
-- be the LAST of the five applied, after the four RPC/function amendments have
-- been live and observed for a rollout window with zero regressions.
--
-- Gap being closed (DATABASE sub-agent finding, PLAN_PRD phase; census "RLS /
-- service-role bypass" section):
--   ventures has RLS enabled, but the service_role policy is USING/CHECK=true
--   (full bypass). Any backend holding SERVICE_ROLE_KEY can raw-UPDATE
--   ventures SET current_lifecycle_stage, bypassing every one of the four
--   gated/fixed functions (census #1, #2 (staged), #3 (staged), #4 (staged),
--   #5 (already fixed, FR-2)) at the database layer. Census + the CI lint
--   guard (scripts/lint/stage-advancement-chokepoint-lint.mjs) can only prove
--   no CURRENTLY-KNOWN code path bypasses the gate -- they cannot guarantee a
--   future or manual service-role write is caught. This trigger is the only
--   mechanism that genuinely closes that surface, regardless of which code
--   path (or none -- a manual SQL console UPDATE) performs the write.
--
-- Side effect worth noting for the census (docs/architecture/
-- stage-advancement-path-census.md): this trigger, once applied, RETROACTIVELY
-- closes deferred bypass #16 (lib/agents/venture-ceo/handlers.js::
-- _updateVentureProgress) as a side effect -- it writes ventures
-- .current_lifecycle_stage directly, so it becomes subject to this trigger
-- like any other write path, with ZERO code change to handlers.js itself.
-- It does NOT close deferred bypass #17 (lib/eva/post-lifecycle-decisions.js),
-- because that path writes to eva_ventures, a DIFFERENT table this trigger
-- does not touch -- #17 remains open and requires its own investigation.
--
-- Scope (forward-advance only, matches every other gate in this SD):
--   Fires ONLY when NEW.current_lifecycle_stage is a genuine forward advance
--   (NEW > OLD). Venture-creation INSERTs are untouched (this is a BEFORE
--   UPDATE trigger, not BEFORE INSERT OR UPDATE) -- census #7's
--   initialize_venture_stages / creation-time current_lifecycle_stage=1
--   inserts are unaffected. Revert-only writes (NEW <= OLD -- saga rollback
--   census #6, and the two review-mode/chairman-gate revert-to-self writes
--   census #9/#10) are unaffected, since they never satisfy NEW > OLD.
--
-- Deviation-valve parity: uses the SAME shared helper
-- (public.fn_stage_artifact_precondition) as the FR-3 RPC amendments, so a
-- documented lib/eva/deviation-ledger.js record that satisfies the JS-side
-- daemon-walk check (FR-2/FR-6) ALSO satisfies this DB-level backstop --
-- defense-in-depth with IDENTICAL semantics, not a stricter duplicate that
-- would re-block an already-approved deviation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_stage_artifact_precondition(p_venture_id uuid, p_stage integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $helper$
DECLARE
  v_s22_legacy_skipped boolean;
  v_s22_flag_enabled boolean;
  v_canonical text[];
  v_legacy text[];
  v_required text[];
  v_source text;
  v_missing text[] := ARRAY[]::text[];
  v_deviated text[] := ARRAY[]::text[];
  v_artifact text;
  v_has_deviation boolean;
BEGIN
  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false) INTO v_s22_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  SELECT COALESCE(is_enabled, false) INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  SELECT required_artifacts INTO v_canonical
  FROM venture_stages WHERE stage_number = p_stage;
  v_canonical := COALESCE(v_canonical, ARRAY[]::text[]);

  SELECT array_agg(artifact_type) INTO v_legacy
  FROM stage_artifact_requirements
  WHERE stage_number = p_stage AND is_blocking = true;
  v_legacy := COALESCE(v_legacy, ARRAY[]::text[]);

  IF v_s22_legacy_skipped AND p_stage = 22 THEN
    v_required := ARRAY[]::text[];
    v_source := 'bypass_s22_legacy_skipped';
  ELSIF v_s22_flag_enabled THEN
    v_required := v_canonical;
    v_source := 'canonical';
  ELSIF array_length(v_canonical, 1) IS NOT NULL THEN
    v_required := v_canonical;
    v_source := 'canonical_with_fallback_available';
  ELSE
    v_required := v_legacy;
    v_source := 'legacy_fallback';
  END IF;

  IF array_length(v_required, 1) IS NULL THEN
    RETURN jsonb_build_object('blocked', false, 'missing_artifacts', '[]'::jsonb, 'deviated_artifacts', '[]'::jsonb, 'source', v_source);
  END IF;

  FOREACH v_artifact IN ARRAY v_required LOOP
    IF NOT EXISTS (
      SELECT 1 FROM venture_artifacts
      WHERE venture_id = p_venture_id AND is_current = true AND artifact_type = v_artifact
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM venture_artifacts
        WHERE venture_id = p_venture_id
          AND artifact_type = 'BUILD_DEVIATION_RECORD'
          AND artifact_data->>'artifact_ref' = v_artifact
      ) INTO v_has_deviation;
      IF v_has_deviation THEN
        v_deviated := array_append(v_deviated, v_artifact);
      ELSE
        v_missing := array_append(v_missing, v_artifact);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'blocked', array_length(v_missing, 1) IS NOT NULL,
    'missing_artifacts', to_jsonb(v_missing),
    'deviated_artifacts', to_jsonb(v_deviated),
    'source', v_source
  );
END;
$helper$;

-- ---------------------------------------------------------------------------
-- Trigger function: only fires on a genuine forward advance; delegates to the
-- shared helper for the FROM stage's requirements.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_stage_advancement_artifact_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $trigger$
DECLARE
  v_precondition JSONB;
BEGIN
  IF NEW.current_lifecycle_stage IS NULL OR OLD.current_lifecycle_stage IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.current_lifecycle_stage <= OLD.current_lifecycle_stage THEN
    RETURN NEW; -- revert / no-op / initialization-style write: not a forward advance
  END IF;

  v_precondition := public.fn_stage_artifact_precondition(NEW.id, OLD.current_lifecycle_stage);

  IF (v_precondition->>'blocked')::boolean THEN
    RAISE EXCEPTION 'STAGE_ADVANCEMENT_ARTIFACT_GATE: venture % cannot advance from stage % to % -- missing required artifact(s): % (source=%)',
      NEW.id, OLD.current_lifecycle_stage, NEW.current_lifecycle_stage,
      (SELECT string_agg(a, ', ') FROM jsonb_array_elements_text(v_precondition->'missing_artifacts') a),
      v_precondition->>'source'
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$trigger$;

DROP TRIGGER IF EXISTS enforce_stage_advancement_artifact_gate ON ventures;

CREATE TRIGGER enforce_stage_advancement_artifact_gate
  BEFORE UPDATE OF current_lifecycle_stage
  ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_stage_advancement_artifact_gate();

COMMENT ON FUNCTION public.fn_enforce_stage_advancement_artifact_gate() IS
'DB-level backstop closing the RLS/service-role bypass gap for
ventures.current_lifecycle_stage (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001,
FR-7). Fires on any forward advance (NEW > OLD) regardless of caller/RPC/raw
UPDATE, using the same fn_stage_artifact_precondition helper (and therefore
the same deviation-ledger valve) as the FR-3 RPC amendments. Reverts,
no-op re-asserts, and INSERT-time initialization are unaffected.';

COMMENT ON TRIGGER enforce_stage_advancement_artifact_gate ON ventures IS
'Blocks a forward current_lifecycle_stage advance when a required artifact is
missing and undocumented. See fn_enforce_stage_advancement_artifact_gate().';

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the trigger/function did not land.
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_stage_advancement_artifact_gate'
      AND tgrelid = 'public.ventures'::regclass
  ), 'enforce_stage_advancement_artifact_gate trigger did not land on ventures';

  ASSERT pg_get_functiondef('public.fn_enforce_stage_advancement_artifact_gate()'::regprocedure) LIKE '%fn_stage_artifact_precondition%',
    'fn_enforce_stage_advancement_artifact_gate: helper call missing';
END
$verify$;
