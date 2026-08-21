-- DOWN migration for 20260821_eva_scheduler_queue_kill_time_teardown.sql
-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-4, step 2 of 2) — restore the pre-teardown function.
-- @chairman-gated
--
-- ⚠ NO `-- @approved-by:` LINE — the chairman supplies it. APPLY IS NOT MINE.
-- ⚠ DO NOT run with --split-statements. ⚠ NO EXPLICIT BEGIN/COMMIT.
--
-- ⚠⚠ ORDERING ON THE WAY BACK IS THE REVERSE OF THE WAY IN:
--    apply THIS file BEFORE 20260821_eva_scheduler_queue_status_add_cancelled_DOWN.sql. Narrowing
--    the CHECK while the function can still write 'cancelled' would leave a live writer aimed at an
--    illegal value.
--
-- The body below is the VERBATIM live definition as of 2026-08-21, read back with
-- pg_get_functiondef() BEFORE the UP was authored — i.e. the 20260315 status-mapping version WITH
-- the SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F is_demo guard that 20260610_purge_parity_fixture_ventures.sql
-- added. It is NOT the 20260315 migration file's body, which predates that guard; restoring from
-- that file would silently re-open the demo-fixture leak.
--
-- NOTE ON check-migration-readiness.mjs: this DOWN's body MATCHES live for as long as the UP is
-- unapplied, so the pre-merge probe sees it as idempotent, not as drift. Once the UP is applied the
-- divergence is expected and the `-- @chairman-gated` marker above downgrades it to advisory
-- (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-GATED-EXEMPT-001).
--
-- WHAT THIS DOWN DOES NOT DO: it does not move already-'cancelled' queue rows back to 'pending'.
-- Re-arming dead ventures for dispatch is the hazard this SD exists to remove and must never be an
-- automatic side effect of a rollback. The reporting query at the bottom lists the affected rows so
-- an operator can decide deliberately.

CREATE OR REPLACE FUNCTION public.sync_ventures_to_eva_ventures_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_status TEXT;
BEGIN
  -- SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F: demo/test fixtures never enter the EVA pipeline
  -- (symmetric with the insert guard; updates to demo ventures have no eva_ventures row to touch).
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  IF OLD.current_lifecycle_stage IS DISTINCT FROM NEW.current_lifecycle_stage THEN
    UPDATE eva_ventures
      SET current_lifecycle_stage = NEW.current_lifecycle_stage,
          updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Map venture_status_enum values to eva_ventures status values
    v_mapped_status := CASE NEW.status::text
      WHEN 'active'    THEN 'active'
      WHEN 'paused'    THEN 'paused'
      WHEN 'cancelled' THEN 'killed'
      WHEN 'completed' THEN 'graduated'
      WHEN 'archived'  THEN 'paused'
      ELSE 'active'  -- safe default for any unexpected value
    END;

    UPDATE eva_ventures
      SET status = v_mapped_status, updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE eva_ventures
      SET name = NEW.name, updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- SECURITY DEFINER EXECUTE hygiene (secdef-execute-revoke-lint): a fresh CREATE OR REPLACE re-states
-- the REVOKE explicitly rather than relying on the UP migration's grant change surviving the
-- rollback implicitly -- self-contained per file, matching the UP migration's own reasoning.
-- Trigger-only function; no re-GRANT needed.
REVOKE EXECUTE ON FUNCTION public.sync_ventures_to_eva_ventures_update() FROM PUBLIC, anon, authenticated;

DO $esqtd_post$
DECLARE
  v_src text;
  v_stranded bigint;
  v_fn_oid oid;
BEGIN
  SELECT p.oid, p.prosrc INTO v_fn_oid, v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sync_ventures_to_eva_ventures_update';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'DOWN post-assert failed: sync_ventures_to_eva_ventures_update() is missing';
  END IF;
  IF position('eva_scheduler_queue' in v_src) > 0 THEN
    RAISE EXCEPTION 'DOWN post-assert failed: the teardown block is still present in the live body';
  END IF;
  IF position('NEW.is_demo' in v_src) = 0 THEN
    RAISE EXCEPTION 'DOWN post-assert failed: the is_demo guard was lost by the rollback';
  END IF;
  IF has_function_privilege('anon', v_fn_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'DOWN post-assert failed: anon/authenticated can still EXECUTE sync_ventures_to_eva_ventures_update() after the REVOKE';
  END IF;

  SELECT count(*) INTO v_stranded FROM eva_scheduler_queue WHERE status = 'cancelled';
  IF v_stranded > 0 THEN
    RAISE NOTICE 'DOWN: teardown removed. % queue row(s) remain status=cancelled and are NOT re-armed by this rollback — decide deliberately before narrowing the CHECK constraint.', v_stranded;
  END IF;

  RAISE NOTICE 'DOWN complete: pre-teardown function restored (is_demo guard intact)';
END
$esqtd_post$;

-- REPORT the rows this rollback deliberately leaves alone:
--   SELECT q.id, q.venture_id, q.status, v.status AS eva_status
--     FROM eva_scheduler_queue q JOIN eva_ventures v ON v.id = q.venture_id
--    WHERE q.status = 'cancelled';
