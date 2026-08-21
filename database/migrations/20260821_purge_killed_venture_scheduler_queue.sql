-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-2) — archive-first purge of scheduler-queue rows
-- belonging to KILLED ventures.
-- @chairman-gated
--
-- ⚠ THERE IS DELIBERATELY NO `-- @approved-by:` LINE IN THIS FILE.
--   TIER-2 DDL requires the 3-factor chairman gate (`--prod-deploy` + a single-use 1h token + an
--   `@approved-by` header matching `git config user.email`, enforced by scripts/lib/migration-guards.js).
--   The builder that authored this file holds none of those and MUST NOT forge the attestation.
--   The chairman adds the `@approved-by` line and runs:
--       node scripts/apply-migration.js database/migrations/20260821_purge_killed_venture_scheduler_queue.sql --prod-deploy
--   APPLY IS NOT MINE. Until it is applied, the hazard described below remains ARMED — that is a
--   KNOWN, DECLARED gap, not a clean queue.
--
-- ⚠ DO NOT run this file with apply-migration.js --split-statements. The named dollar-quoted DO
--   blocks ($esq_guard$ / $esq_pre$ / $esq_post$) are only safe on the DEFAULT single-query path;
--   splitPostgreSQLStatements recognizes bare $$ but not named $tag$ and would shred them.
--
-- ⚠ NO EXPLICIT BEGIN/COMMIT. apply-migration.js already wraps the file in BEGIN/COMMIT
--   (scripts/apply-migration.js:341/430, useTx default true). An inner COMMIT would close the
--   wrapper's transaction early and destroy the all-or-nothing property every assert below relies on.
--   (The 20260809_semantic_index migration does carry BEGIN/COMMIT; that is benign for a two-statement
--   file and is NOT a pattern to copy into a file with quarantine + delete + asserts.)
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHAT, AND WHY IT IS A LIVE HAZARD RATHER THAN HYGIENE DEBT.
--
-- MEASURED against live 2026-08-21 (read-only), not inferred:
--   * eva_scheduler_queue holds 113 rows: 68 for eva_ventures.status='active', 45 for status='killed'.
--   * ALL 45 killed-venture rows carry queue status='pending'.
--   * All 45 resolve to ventures.status='cancelled' — i.e. they are genuinely dead ventures.
--   * 0 orphan rows (every venture_id resolves to an eva_ventures row).
--
-- select_schedulable_ventures() — the EVA Master Scheduler's dispatch selector — filters ONLY on
--   q.status = 'pending' AND v.orchestrator_state NOT IN ('blocked','failed')
-- It NEVER inspects eva_ventures.status. A killed venture's still-pending queue row is therefore
-- LIVE-SCHEDULABLE today: the scheduler can and will hand a dead venture to a dispatcher.
--
-- BOUNDARIES: eva_scheduler_queue rows ONLY. This file deletes nothing from ventures, eva_ventures,
--   eva_scheduler_metrics, or any other table, and changes no function, trigger or constraint.
--   The kill-time teardown that stops NEW rows from reaching this state is FR-4, in two separate
--   files (20260821_eva_scheduler_queue_status_add_cancelled.sql, then
--   20260821_eva_scheduler_queue_kill_time_teardown.sql). This purge is the backlog; FR-4 is the tap.
--
-- SAFETY (recipe: 20260610_purge_management_reviews_pollution.sql / SD-LEO-INFRA-BULK-PURGE-LIVE-001,
--         with the eva_scheduler_queue snapshot/restore shape of 20260610_purge_parity_fixture_ventures.sql):
--   * REVERSIBLE: every deleted row is snapshotted into eva_scheduler_queue_qkilled20260821 FIRST;
--     the paired _DOWN.sql restores from it and asserts value-identity column by column.
--   * RACE-SAFE: ACCESS EXCLUSIVE on eva_scheduler_queue AND eva_ventures for the whole transaction,
--     so the snapshot set == the deleted set and no venture can be un-killed mid-purge.
--   * LIVE PREDICATE: the set is computed in-transaction from eva_ventures.status='killed'. No id is
--     ever hardcoded as a delete predicate.
--   * DOUBLE-BOUND DELETE: bound to the snapshot by id (proves deleted ⊆ quarantined) AND
--     re-verifying the kill status against eva_ventures AT DELETE TIME (belt + braces on the lock —
--     correct even if the ACCESS EXCLUSIVE lock were ever relaxed to something weaker).
--   * IN-FLIGHT TRIPWIRE: aborts if any row in the set is status='dispatching' — that is work a
--     dispatcher may be holding right now, and stranding it is not this migration's call to make.
--   * FRESH SNAPSHOT: aborts if the quarantine table already exists (prior run).
--   * NO COUNT PIN: unlike the parity purge, the authoring-time count is NOT asserted. Ventures get
--     killed over time, so pinning 45 would make this file abort on legitimate drift. The plausibility
--     CEILING below is the tripwire instead; the 45 is recorded here as an observation only.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtext('eva_scheduler_queue_killed_venture_purge'));

-- 0a) One-shot guard: clean slate or abort. DDL is transactional, so a failed apply rolls the
--     CREATE below back and a legitimate retry still finds no table.
DO $esq_guard$
BEGIN
  IF to_regclass('public.eva_scheduler_queue_qkilled20260821') IS NOT NULL THEN
    RAISE EXCEPTION 'purge aborted: eva_scheduler_queue_qkilled20260821 already exists — prior run detected, investigate before re-running';
  END IF;
END
$esq_guard$;

-- 0b) Freeze both tables the predicate spans, for the whole transaction.
LOCK TABLE eva_scheduler_queue IN ACCESS EXCLUSIVE MODE;
LOCK TABLE eva_ventures        IN ACCESS EXCLUSIVE MODE;

-- 1) Quarantine snapshot — the DOWN migration's ONLY data source.
--    `SELECT q.*` (CTAS) copies every live column in live order, whatever the shape is at apply time.
--    A GENERATED STORED column would materialize here as a plain column; that is exactly why the DOWN
--    computes its INSERT column list from the catalog instead of hardcoding one (see _DOWN.sql).
CREATE TABLE eva_scheduler_queue_qkilled20260821 AS
SELECT q.*
FROM eva_scheduler_queue q
WHERE EXISTS (
  SELECT 1 FROM eva_ventures v
  WHERE v.id = q.venture_id
    AND v.status = 'killed'
);

-- 2) Pre-delete counts the post-asserts consume (temp, dies with the transaction).
CREATE TEMP TABLE _esq_precount ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM eva_scheduler_queue) AS total_before,
  (SELECT count(*) FROM eva_scheduler_queue q
    WHERE NOT EXISTS (SELECT 1 FROM eva_ventures v WHERE v.id = q.venture_id AND v.status = 'killed')
  ) AS keep_before;

-- 3) Pre-assert tripwires.
DO $esq_pre$
DECLARE
  v_quar     bigint;
  v_bad      bigint;
  v_inflight bigint;
  v_breakdown text;
BEGIN
  SELECT count(*) INTO v_quar FROM eva_scheduler_queue_qkilled20260821;

  IF v_quar = 0 THEN
    RAISE EXCEPTION 'purge aborted: no queue rows resolve to a killed venture — nothing to purge. Chairman expected a non-empty backlog (45 observed 2026-08-21); verify state before applying.';
  END IF;

  -- Plausibility ceiling. 45 observed at authoring out of 113 total rows; 200 leaves generous room
  -- for legitimate growth while still catching a predicate that has gone wrong (e.g. an accidental
  -- mass status flip on eva_ventures).
  IF v_quar > 200 THEN
    RAISE EXCEPTION 'purge aborted: % row(s) matched (> ceiling 200) — implausibly large, investigate before applying.', v_quar;
  END IF;

  -- Belt + braces on the predicate: not one snapshot member may belong to a live non-killed venture.
  SELECT count(*) INTO v_bad
  FROM eva_scheduler_queue_qkilled20260821 s
  WHERE NOT EXISTS (
    SELECT 1 FROM eva_ventures v WHERE v.id = s.venture_id AND v.status = 'killed'
  );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'purge aborted: % snapshot member(s) do not resolve to a killed venture — keep-predicate violated.', v_bad;
  END IF;

  -- IN-FLIGHT TRIPWIRE. 'dispatching' means a dispatcher may be holding this row right now.
  -- 'blocked' / 'paused' / 'completed' for a dead venture are inert and safe to archive.
  SELECT count(*) INTO v_inflight
  FROM eva_scheduler_queue_qkilled20260821 WHERE status = 'dispatching';
  IF v_inflight > 0 THEN
    RAISE EXCEPTION 'purge aborted: % row(s) in the set are status=dispatching (in-flight work) — resolve the dispatch before purging.', v_inflight;
  END IF;

  SELECT string_agg(status || '=' || n, ', ' ORDER BY status)
    INTO v_breakdown
  FROM (SELECT status, count(*)::text AS n FROM eva_scheduler_queue_qkilled20260821 GROUP BY status) t;

  RAISE NOTICE 'esq purge pre-assert OK: % row(s) quarantined (by queue status: %)', v_quar, v_breakdown;
END
$esq_pre$;

-- 4) Backup-bound DELETE, with a LIVE re-verify of the kill status at delete time.
--    Two independent bindings on purpose:
--      * `q.id = s.id`  — deleted set can never exceed the quarantined (restorable) set.
--      * EXISTS(...killed) — the venture is STILL killed at the moment of deletion, so a venture
--        un-killed between snapshot and delete keeps its queue row even though it was snapshotted.
DELETE FROM eva_scheduler_queue q
USING eva_scheduler_queue_qkilled20260821 s
WHERE q.id = s.id
  AND EXISTS (
    SELECT 1 FROM eva_ventures v
    WHERE v.id = q.venture_id
      AND v.status = 'killed'
  );

-- 5) Post-asserts: hazard cleared, keep-set untouched, quarantine intact.
DO $esq_post$
DECLARE
  v_left        bigint;
  v_quar        bigint;
  v_total_after bigint;
  v_keep_after  bigint;
  v_total_pre   bigint;
  v_keep_pre    bigint;
  v_sched_dead  bigint;
BEGIN
  SELECT total_before, keep_before INTO v_total_pre, v_keep_pre FROM _esq_precount;
  SELECT count(*) INTO v_quar FROM eva_scheduler_queue_qkilled20260821;

  -- 5a) The hazard is gone: no queue row survives for a killed venture.
  SELECT count(*) INTO v_left
  FROM eva_scheduler_queue q
  JOIN eva_ventures v ON v.id = q.venture_id
  WHERE v.status = 'killed';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'post-assert failed: % queue row(s) still resolve to a killed venture', v_left;
  END IF;

  -- 5b) Exactly the quarantined rows left, no more and no fewer.
  SELECT count(*) INTO v_total_after FROM eva_scheduler_queue;
  IF v_total_after <> v_total_pre - v_quar THEN
    RAISE EXCEPTION 'post-assert failed: live count % <> % - % (delete removed the wrong number of rows)',
      v_total_after, v_total_pre, v_quar;
  END IF;

  -- 5c) The keep-set is byte-for-byte still there (count parity is the cheap proof).
  SELECT count(*) INTO v_keep_after
  FROM eva_scheduler_queue q
  WHERE NOT EXISTS (SELECT 1 FROM eva_ventures v WHERE v.id = q.venture_id AND v.status = 'killed');
  IF v_keep_after <> v_keep_pre THEN
    RAISE EXCEPTION 'post-assert failed: non-killed queue count changed (% -> %) — keep-predicate violated, ABORT',
      v_keep_pre, v_keep_after;
  END IF;

  -- 5d) END-TO-END: the dispatch selector itself must no longer offer a dead venture. This asserts
  --     the OUTCOME (what the scheduler sees), not merely the table state that should produce it.
  SELECT count(*) INTO v_sched_dead
  FROM select_schedulable_ventures(1000) s
  JOIN eva_ventures v ON v.id = s.venture_id
  WHERE v.status = 'killed';
  IF v_sched_dead <> 0 THEN
    RAISE EXCEPTION 'post-assert failed: select_schedulable_ventures still returns % killed venture(s)', v_sched_dead;
  END IF;

  -- 5e) The DOWN's only data source must still be complete.
  IF v_quar = 0 THEN
    RAISE EXCEPTION 'post-assert failed: quarantine is empty — the purge is NOT reversible, ABORT';
  END IF;

  RAISE NOTICE 'esq purge complete: % row(s) archived + deleted; live queue % -> %; keep-set stable at %; scheduler offers 0 killed ventures',
    v_quar, v_total_pre, v_total_after, v_keep_after;
END
$esq_post$;

-- 6) The quarantine table is deliberately KEPT after apply — it is the DOWN migration's only data
--    source and the audit trail for the purge. Drop it manually (chairman-gated, separate migration)
--    only once the restore path is no longer wanted.
--
-- VERIFY (run after apply; a migration file is a lead, never proof a live object changed):
--
--   -- 1. hazard cleared (must be 0)
--   SELECT count(*) FROM eva_scheduler_queue q JOIN eva_ventures v ON v.id = q.venture_id
--    WHERE v.status = 'killed';
--
--   -- 2. the archive exists and is non-empty (must equal the rows removed)
--   SELECT count(*) FROM eva_scheduler_queue_qkilled20260821;
--
--   -- 3. the scheduler no longer offers a dead venture (must be 0)
--   SELECT count(*) FROM select_schedulable_ventures(1000) s
--     JOIN eva_ventures v ON v.id = s.venture_id WHERE v.status = 'killed';
