-- @approved-by: codestreetlabs@gmail.com
-- Migration: Reversible purge of leaked parity-test fixture ventures + is_demo guard on the
--            eva_ventures sync triggers (leak-source root fix)
-- SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F (child of SD-LEO-ORCH-ADAM-PLAN-KEEPER-001)
--
-- ⚠ DO NOT run this file with apply-migration.js --split-statements. The named dollar-quoted DO
--   blocks are only safe on the DEFAULT single-query path.
--
-- WHAT: tests/integration/s17-parity.test.js seeds ventures named parity-test-* with is_demo=true.
--       When a run is killed before afterAll, fixtures leak. Live-verified 2026-06-10: 3 leaked
--       fixtures (6de3685e, aba97191, 5aa9f3dc) with a ~744-row FK closure across 11 tables —
--       grown SYSTEMICALLY because the unconditional sync_ventures_to_eva_ventures_insert trigger
--       copies every venture (demo or not) into eva_ventures, trg_auto_enqueue_venture feeds the
--       EVA Master Scheduler, and the scheduler generated 677 eva_scheduler_metrics rows
--       (NO ACTION FK) against the fixtures. Those NO ACTION children are also why the test's own
--       beforeAll self-clean silently fails (its ventures.delete() hits FK violations; the supabase
--       error is never checked).
--
-- THIS FILE (one transaction):
--   1. Quarantine snapshot of the ENTIRE closure (19 *_qparity20260610 tables incl. SET NULL
--      pre-images + a meta count ledger) — the DOWN migration's only data source.
--   2. Explicit DELETE of the NO ACTION blockers, then DELETE ventures (CASCADE covers the rest;
--      any UNKNOWN blocker aborts the whole transaction = fail-safe).
--   3. is_demo guard added to BOTH sync trigger functions (verbatim live bodies + early return) so
--      demo fixtures never re-enter the EVA pipeline. Paired code change (same SD/branch) hardens
--      the test cleanup to be loud.
--
-- SAFETY (recipe: 20260610_purge_management_reviews_pollution.sql / SD-LEO-INFRA-BULK-PURGE-LIVE-001):
--   * REVERSIBLE: every deleted/nulled row is quarantined; DOWN restores byte-identical with
--     trigger-side-effect handling and post-restore count asserts.
--   * RACE-SAFE: ACCESS EXCLUSIVE on ventures AND eva_ventures for the whole transaction freezes
--     the fixture set and blocks the scheduler's metrics writer (FK checks against eva_ventures
--     cannot proceed), so snapshot == deleted set.
--   * LIVE PREDICATE: the fixture set is computed in-transaction from
--     (name LIKE 'parity-test-%' AND is_demo = true) — never from hardcoded ids. The 3 known ids
--     appear only as a presence ASSERT (cross-check), never as the delete predicate.
--   * KEEP-PREDICATE TRIPWIRES: aborts if the set contains any is_demo=false venture, any venture
--     with an applications row (real ventures have one), or if the set is empty / implausibly large.
--   * FRESH SNAPSHOT: aborts if any quarantine table already exists.
--
-- BOUNDARIES: deletes ONLY the parity-test fixture closure. CronGenius/DataDistill and every
--   is_demo=false venture are provably untouched (pre/post count assert). No writer code changes
--   in this file (the test hardening is the paired code change on the same branch).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

SELECT pg_advisory_xact_lock(hashtext('parity_fixture_ventures_purge'));

-- 0a) One-shot guard: clean slate or abort.
DO $pfp_guard$
BEGIN
  IF to_regclass('public.ventures_qparity20260610') IS NOT NULL THEN
    RAISE EXCEPTION 'purge aborted: quarantine tables already exist — prior run detected, investigate before re-running';
  END IF;
END
$pfp_guard$;

-- 0b) Freeze the world this purge depends on.
LOCK TABLE ventures IN ACCESS EXCLUSIVE MODE;
LOCK TABLE eva_ventures IN ACCESS EXCLUSIVE MODE;

-- 1) Fixture set: LIVE predicate (includes soft-deleted parity fixtures if any exist).
CREATE TEMP TABLE _pfp_fixtures ON COMMIT DROP AS
SELECT id FROM ventures WHERE name LIKE 'parity-test-%' AND is_demo = true;

CREATE TEMP TABLE _pfp_eva ON COMMIT DROP AS
SELECT id FROM eva_ventures WHERE venture_id IN (SELECT id FROM _pfp_fixtures);

-- 2) Pre-assert tripwires.
DO $pfp_pre$
DECLARE
  v_n        bigint;
  v_bad      bigint;
  v_apps     bigint;
  v_known    bigint;
BEGIN
  SELECT count(*) INTO v_n FROM _pfp_fixtures;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'purge aborted: fixture set is EMPTY — nothing matches the predicate; chairman expected leaked fixtures. Verify state before applying.';
  END IF;
  IF v_n > 10 THEN
    RAISE EXCEPTION 'purge aborted: fixture set has % rows (> ceiling 10) — implausibly large, investigate before applying.', v_n;
  END IF;

  -- A non-demo or non-parity venture can never be in the set (belt + braces on the predicate).
  SELECT count(*) INTO v_bad
  FROM ventures v JOIN _pfp_fixtures f ON f.id = v.id
  WHERE v.is_demo IS DISTINCT FROM true OR v.name NOT LIKE 'parity-test-%';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'purge aborted: % set member(s) violate the keep-predicate (non-demo or non-parity name).', v_bad;
  END IF;

  -- Real ventures have applications rows; fixtures must have none.
  SELECT count(*) INTO v_apps FROM applications WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
  IF v_apps > 0 THEN
    RAISE EXCEPTION 'purge aborted: % applications row(s) reference set members — a REAL venture may be in the set.', v_apps;
  END IF;

  -- Cross-check (assert only, never the predicate): the 3 fixtures witnessed at authoring are present.
  SELECT count(*) INTO v_known FROM _pfp_fixtures
  WHERE id IN ('6de3685e-d7e2-415f-9695-fc9299120197',
               'aba97191-1067-4d76-a090-1328dc8ad28e',
               '5aa9f3dc-9286-4166-ae50-156a93ab5810');
  IF v_known <> 3 THEN
    RAISE EXCEPTION 'purge aborted: expected the 3 authoring-time fixture ids in the set, found % — state drifted, re-verify before applying.', v_known;
  END IF;

  RAISE NOTICE 'parity purge pre-assert OK: % fixture venture(s)', v_n;
END
$pfp_pre$;

-- 3) Quarantine snapshot — the DOWN migration's only data source.
--    Direct children of ventures:
CREATE TABLE ventures_qparity20260610                  AS SELECT * FROM ventures                  WHERE id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE eva_ventures_qparity20260610              AS SELECT * FROM eva_ventures              WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE eva_stage_gate_results_qparity20260610    AS SELECT * FROM eva_stage_gate_results    WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE factory_guardrail_state_qparity20260610   AS SELECT * FROM factory_guardrail_state   WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE stage_executions_qparity20260610          AS SELECT * FROM stage_executions          WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE venture_artifacts_qparity20260610         AS SELECT * FROM venture_artifacts         WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE venture_resources_qparity20260610         AS SELECT * FROM venture_resources         WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE venture_stage_transitions_qparity20260610 AS SELECT * FROM venture_stage_transitions WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
CREATE TABLE venture_stage_work_qparity20260610        AS SELECT * FROM venture_stage_work        WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
--    Children of eva_ventures:
CREATE TABLE eva_scheduler_queue_qparity20260610       AS SELECT * FROM eva_scheduler_queue       WHERE venture_id IN (SELECT id FROM _pfp_eva);
CREATE TABLE eva_scheduler_metrics_qparity20260610     AS SELECT * FROM eva_scheduler_metrics     WHERE venture_id IN (SELECT id FROM _pfp_eva);
CREATE TABLE eva_events_qparity20260610                AS SELECT * FROM eva_events                WHERE eva_venture_id IN (SELECT id FROM _pfp_eva);
CREATE TABLE eva_decisions_qparity20260610             AS SELECT * FROM eva_decisions             WHERE eva_venture_id IN (SELECT id FROM _pfp_eva);
CREATE TABLE eva_automation_executions_qparity20260610 AS SELECT * FROM eva_automation_executions WHERE venture_id IN (SELECT id FROM _pfp_eva);
CREATE TABLE venture_separability_scores_qparity20260610   AS SELECT * FROM venture_separability_scores   WHERE venture_id IN (SELECT id FROM _pfp_eva);
CREATE TABLE venture_data_room_artifacts_qparity20260610   AS SELECT * FROM venture_data_room_artifacts   WHERE venture_id IN (SELECT id FROM _pfp_eva);
--    Grandchildren:
CREATE TABLE venture_artifact_summaries_qparity20260610 AS SELECT * FROM venture_artifact_summaries
  WHERE artifact_id IN (SELECT id FROM venture_artifacts WHERE venture_id IN (SELECT id FROM _pfp_fixtures));
--    SET NULL pre-images (cascade nulls these FKs; DOWN restores the pointers):
CREATE TABLE eva_audit_log_preimg_qparity20260610 AS
  SELECT id, eva_venture_id FROM eva_audit_log WHERE eva_venture_id IN (SELECT id FROM _pfp_eva);
CREATE TABLE capital_transactions_preimg_qparity20260610 AS
  SELECT id, stage_work_id FROM capital_transactions
  WHERE stage_work_id IN (SELECT id FROM venture_stage_work WHERE venture_id IN (SELECT id FROM _pfp_fixtures));

-- 3b) Meta ledger: per-table pre-delete counts (DOWN asserts against this; smoke step 5 reads it).
CREATE TABLE quarantine_meta_qparity20260610 (
  source_table text PRIMARY KEY,
  quarantined  bigint NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO quarantine_meta_qparity20260610 (source_table, quarantined) VALUES
  ('ventures',                  (SELECT count(*) FROM ventures_qparity20260610)),
  ('eva_ventures',              (SELECT count(*) FROM eva_ventures_qparity20260610)),
  ('eva_stage_gate_results',    (SELECT count(*) FROM eva_stage_gate_results_qparity20260610)),
  ('factory_guardrail_state',   (SELECT count(*) FROM factory_guardrail_state_qparity20260610)),
  ('stage_executions',          (SELECT count(*) FROM stage_executions_qparity20260610)),
  ('venture_artifacts',         (SELECT count(*) FROM venture_artifacts_qparity20260610)),
  ('venture_resources',         (SELECT count(*) FROM venture_resources_qparity20260610)),
  ('venture_stage_transitions', (SELECT count(*) FROM venture_stage_transitions_qparity20260610)),
  ('venture_stage_work',        (SELECT count(*) FROM venture_stage_work_qparity20260610)),
  ('eva_scheduler_queue',       (SELECT count(*) FROM eva_scheduler_queue_qparity20260610)),
  ('eva_scheduler_metrics',     (SELECT count(*) FROM eva_scheduler_metrics_qparity20260610)),
  ('eva_events',                (SELECT count(*) FROM eva_events_qparity20260610)),
  ('eva_decisions',             (SELECT count(*) FROM eva_decisions_qparity20260610)),
  ('eva_automation_executions', (SELECT count(*) FROM eva_automation_executions_qparity20260610)),
  ('venture_separability_scores',  (SELECT count(*) FROM venture_separability_scores_qparity20260610)),
  ('venture_data_room_artifacts',  (SELECT count(*) FROM venture_data_room_artifacts_qparity20260610)),
  ('venture_artifact_summaries',   (SELECT count(*) FROM venture_artifact_summaries_qparity20260610)),
  ('eva_audit_log_preimg',         (SELECT count(*) FROM eva_audit_log_preimg_qparity20260610)),
  ('capital_transactions_preimg',  (SELECT count(*) FROM capital_transactions_preimg_qparity20260610));

-- 4) Record the non-fixture venture count BEFORE deleting (post-assert input).
CREATE TEMP TABLE _pfp_precount ON COMMIT DROP AS
SELECT count(*) AS n FROM ventures WHERE is_demo IS DISTINCT FROM true;

-- 5) Deletes. NO ACTION blockers first (these are exactly why the test's self-clean failed),
--    then ventures — CASCADE covers every remaining child. An unknown NO ACTION blocker anywhere
--    else aborts the whole transaction (quarantine rolls back too): fail-safe by construction.
DELETE FROM venture_artifact_summaries
  WHERE artifact_id IN (SELECT id FROM venture_artifacts WHERE venture_id IN (SELECT id FROM _pfp_fixtures));
DELETE FROM eva_scheduler_metrics     WHERE venture_id IN (SELECT id FROM _pfp_eva);
DELETE FROM eva_automation_executions WHERE venture_id IN (SELECT id FROM _pfp_eva);
DELETE FROM factory_guardrail_state   WHERE venture_id IN (SELECT id FROM _pfp_fixtures);
DELETE FROM ventures                  WHERE id IN (SELECT id FROM _pfp_fixtures);

-- 6) Post-asserts: closure empty, keep-set intact, quarantine complete.
DO $pfp_post$
DECLARE
  v_left bigint;
  v_keep_pre  bigint;
  v_keep_post bigint;
  v_q bigint;
BEGIN
  SELECT count(*) INTO v_left FROM ventures WHERE name LIKE 'parity-test-%';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'post-assert failed: % parity-test venture(s) remain', v_left;
  END IF;

  SELECT count(*) INTO v_left FROM eva_ventures ev JOIN ventures_qparity20260610 q ON q.id = ev.venture_id;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'post-assert failed: % eva_ventures row(s) remain for purged fixtures', v_left;
  END IF;

  SELECT count(*) INTO v_left FROM eva_scheduler_metrics WHERE venture_id IN (SELECT id FROM eva_ventures_qparity20260610);
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'post-assert failed: % eva_scheduler_metrics row(s) remain', v_left;
  END IF;

  SELECT n INTO v_keep_pre FROM _pfp_precount;
  SELECT count(*) INTO v_keep_post FROM ventures WHERE is_demo IS DISTINCT FROM true;
  IF v_keep_pre <> v_keep_post THEN
    RAISE EXCEPTION 'post-assert failed: non-demo venture count changed (% -> %) — keep-predicate violated, ABORT', v_keep_pre, v_keep_post;
  END IF;

  SELECT quarantined INTO v_q FROM quarantine_meta_qparity20260610 WHERE source_table = 'ventures';
  IF v_q < 1 THEN
    RAISE EXCEPTION 'post-assert failed: quarantine ledger shows no ventures captured';
  END IF;

  RAISE NOTICE 'parity purge complete: % venture(s) + closure quarantined and deleted; non-demo count stable at %', v_q, v_keep_post;
END
$pfp_post$;

-- 7) LEAK-SOURCE ROOT FIX: is_demo guard on BOTH sync trigger functions.
--    Bodies are VERBATIM the live 2026-06-10 versions (= 20260315_fix_eva_ventures_status_sync.sql)
--    plus the early demo return. The DOWN migration restores the unguarded versions verbatim.
CREATE OR REPLACE FUNCTION public.sync_ventures_to_eva_ventures_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_status TEXT;
BEGIN
  -- SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F: demo/test fixtures never enter the EVA pipeline.
  -- Without this guard, parity-test fixtures synced into eva_ventures, were auto-enqueued to the
  -- EVA Master Scheduler, and accumulated NO ACTION children (677 eva_scheduler_metrics rows)
  -- that silently blocked the test suite's own cleanup.
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

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
