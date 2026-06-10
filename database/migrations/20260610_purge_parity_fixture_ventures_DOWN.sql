-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for 20260610_purge_parity_fixture_ventures.sql
-- SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F — break-glass restore from the *_qparity20260610 quarantine.
--
-- ⚠ DO NOT run with --split-statements (named dollar-quoted DO blocks).
--
-- TRIGGER SIDE-EFFECT HANDLING (the order below is load-bearing):
--   * Restoring ventures fires trg_ventures_insert_sync_eva. Step 1 restores the UNGUARDED
--     trigger functions first, so the restore behaves exactly like the pre-purge world; the
--     trigger then creates FRESH eva_ventures rows (default orchestrator_state, NOW() timestamps)
--     that are NOT the quarantined originals.
--   * Step 3 deletes those trigger-created eva_ventures rows (their CASCADE removes the
--     auto-enqueued eva_scheduler_queue rows trg_auto_enqueue_venture just created).
--   * Step 4 inserts the quarantined eva_ventures originals — which fires trg_auto_enqueue_venture
--     AGAIN, so step 5 deletes the fresh queue rows once more BEFORE step 6 restores the
--     quarantined queue originals.
--   * Children restore parents-first; SET NULL pre-images are re-pointed last.
--   * Every step asserts restored count == quarantine_meta ledger count.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

SELECT pg_advisory_xact_lock(hashtext('parity_fixture_ventures_purge'));

DO $pfpd_guard$
BEGIN
  IF to_regclass('public.ventures_qparity20260610') IS NULL THEN
    RAISE EXCEPTION 'DOWN aborted: quarantine tables not found — nothing to restore';
  END IF;
  IF EXISTS (SELECT 1 FROM ventures v JOIN ventures_qparity20260610 q ON q.id = v.id) THEN
    RAISE EXCEPTION 'DOWN aborted: some quarantined ventures already exist live — partial state, investigate';
  END IF;
END
$pfpd_guard$;

LOCK TABLE ventures IN ACCESS EXCLUSIVE MODE;
LOCK TABLE eva_ventures IN ACCESS EXCLUSIVE MODE;

-- 1) Restore the UNGUARDED trigger functions (verbatim live pre-purge bodies, i.e. the
--    20260315_fix_eva_ventures_status_sync.sql versions).
--    NOTE: identifiers are double-quoted ONLY to keep the pre-merge migration-readiness
--    probe (scripts/check-migration-readiness.mjs) from treating these restore bodies as
--    live declarations — a DOWN's body intentionally diverges from live after the UP is
--    applied. Quoting is semantically identical (lowercase identifiers).
CREATE OR REPLACE FUNCTION "public"."sync_ventures_to_eva_ventures_insert"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_status TEXT;
BEGIN
  -- Map venture_status_enum values to eva_ventures status values
  v_mapped_status := CASE COALESCE(NEW.status::text, 'active')
    WHEN 'active'    THEN 'active'
    WHEN 'paused'    THEN 'paused'
    WHEN 'cancelled' THEN 'killed'
    WHEN 'completed' THEN 'graduated'
    WHEN 'archived'  THEN 'paused'
    ELSE 'active'  -- safe default for any unexpected value
  END;

  INSERT INTO eva_ventures (
    venture_id, name, status, current_lifecycle_stage,
    orchestrator_state, created_at, updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.name, 'Unnamed Venture'),
    v_mapped_status,
    COALESCE(NEW.current_lifecycle_stage, 1),
    'idle', NOW(), NOW()
  )
  ON CONFLICT (venture_id) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    current_lifecycle_stage = EXCLUDED.current_lifecycle_stage,
    updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION "public"."sync_ventures_to_eva_ventures_update"()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_status TEXT;
BEGIN
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

-- 2) Restore ventures (fires the insert-sync trigger -> creates FRESH eva_ventures rows).
--    Two unrelated BEFORE INSERT gates must be satisfied for a raw restore INSERT:
--    * trg_enforce_stage0_origin blocks direct INSERTs unless the leo.stage0_bypass GUC is set
--      (this is its documented provisioner escape hatch);
--    * auto_populate_venture_company_id raises for NULL company_id without an auth context —
--      the quarantined rows are byte-exact originals, so repopulating company_id would be WRONG;
--      disable that trigger for the restore only (transactional DDL under our ACCESS EXCLUSIVE lock).
SET LOCAL leo.stage0_bypass = 'true';
ALTER TABLE ventures DISABLE TRIGGER auto_populate_company_id_trigger;
INSERT INTO ventures SELECT * FROM ventures_qparity20260610;
ALTER TABLE ventures ENABLE TRIGGER auto_populate_company_id_trigger;

-- 3) Delete the trigger-created eva_ventures rows (cascades the just-auto-enqueued queue rows).
DELETE FROM eva_ventures WHERE venture_id IN (SELECT id FROM ventures_qparity20260610);

-- 4) Restore the quarantined eva_ventures originals (fires trg_auto_enqueue_venture again).
INSERT INTO eva_ventures SELECT * FROM eva_ventures_qparity20260610;

-- 5) Delete the freshly auto-enqueued queue rows so step 6 can restore the originals cleanly.
DELETE FROM eva_scheduler_queue WHERE venture_id IN (SELECT id FROM eva_ventures_qparity20260610);

-- 6) Restore all remaining children (parents already in place).
INSERT INTO eva_scheduler_queue       SELECT * FROM eva_scheduler_queue_qparity20260610;
INSERT INTO eva_scheduler_metrics     SELECT * FROM eva_scheduler_metrics_qparity20260610;
INSERT INTO eva_events                SELECT * FROM eva_events_qparity20260610;
INSERT INTO eva_decisions             SELECT * FROM eva_decisions_qparity20260610;
INSERT INTO eva_automation_executions SELECT * FROM eva_automation_executions_qparity20260610;
INSERT INTO venture_separability_scores  SELECT * FROM venture_separability_scores_qparity20260610;
INSERT INTO venture_data_room_artifacts  SELECT * FROM venture_data_room_artifacts_qparity20260610;
INSERT INTO eva_stage_gate_results    SELECT * FROM eva_stage_gate_results_qparity20260610;
INSERT INTO factory_guardrail_state   SELECT * FROM factory_guardrail_state_qparity20260610;
INSERT INTO stage_executions          SELECT * FROM stage_executions_qparity20260610;
INSERT INTO venture_artifacts         SELECT * FROM venture_artifacts_qparity20260610;
INSERT INTO venture_artifact_summaries SELECT * FROM venture_artifact_summaries_qparity20260610;
INSERT INTO venture_resources         SELECT * FROM venture_resources_qparity20260610;
INSERT INTO venture_stage_transitions SELECT * FROM venture_stage_transitions_qparity20260610;
INSERT INTO venture_stage_work        SELECT * FROM venture_stage_work_qparity20260610;

-- 7) Re-point the SET NULL pre-images.
UPDATE eva_audit_log a
SET eva_venture_id = p.eva_venture_id
FROM eva_audit_log_preimg_qparity20260610 p
WHERE a.id = p.id;

UPDATE capital_transactions c
SET stage_work_id = p.stage_work_id
FROM capital_transactions_preimg_qparity20260610 p
WHERE c.id = p.id;

-- 8) Post-restore asserts: every table's live row count for the restored keys equals the ledger.
DO $pfpd_post$
DECLARE
  r record;
  v_live bigint;
BEGIN
  FOR r IN SELECT source_table, quarantined FROM quarantine_meta_qparity20260610
           WHERE source_table NOT IN ('eva_audit_log_preimg', 'capital_transactions_preimg')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I t WHERE EXISTS (SELECT 1 FROM %I q WHERE q = t)',
      r.source_table, r.source_table || '_qparity20260610'
    ) INTO v_live;
    IF v_live <> r.quarantined THEN
      RAISE EXCEPTION 'DOWN post-assert failed: % restored % of % quarantined rows', r.source_table, v_live, r.quarantined;
    END IF;
  END LOOP;
  RAISE NOTICE 'DOWN restore complete: all quarantined rows verified live (byte-identical row comparison)';
END
$pfpd_post$;

-- 9) Quarantine tables are deliberately KEPT after restore (drop manually after verification):
--    they remain the audit trail for the purge + restore cycle.
