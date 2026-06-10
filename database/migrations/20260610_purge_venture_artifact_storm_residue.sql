-- @approved-by: codestreetlabs@gmail.com
-- Migration: Reversible purge of arrested write-storm residue from venture_artifacts
-- SD-LEO-FIX-REMEDIATE-ARRESTED-VENTURE-001
--
-- ⚠ DO NOT run with apply-migration.js --split-statements (named dollar-quoted DO blocks).
--
-- WHAT: Arrested write storms (worker re-running stages every ~30s while a precondition stayed
--       unmet; root cause FIXED by SD-LEO-FIX-FIX-STAGE-SKIP-001 d624465baf on 2026-06-07 — the
--       day all storms stopped) left ~2,684 stale rows across 3 artifact types:
--       launch_test_plan (1,229 stale / stage-22), blueprint_sprint_plan (1,044 stale / stage-19),
--       build_security_audit (411 stale / stage-21) — 91.3% of the 2,940-row table. The batch
--       writer's mark-stale+INSERT semantics preserved exactly the current rows (is_current=true),
--       which this purge NEVER touches.
--
-- SAFETY (recipe: management_reviews purge, PR #4518, same day):
--   * REVERSIBLE: venture_artifacts_storm_quarantine_20260610 holds every deleted row; DOWN restores.
--   * TYPE-SCOPED + CURRENT-ROW TRIPWIRE: predicate is is_current=false AND artifact_type IN the
--     3 storm types; a pre-assert RAISES if ANY is_current=true row lands in quarantine —
--     deleting a live current artifact is structurally impossible.
--   * FK-SAFE (live-verified): venture_capability_scores.artifact_id is ON DELETE SET NULL with
--     0 non-null refs; venture_artifact_summaries.artifact_id is RESTRICT but 0 of its rows
--     reference any stale storm row.
--   * Backup-bound DELETE (quarantine ids) + bounded lock/statement timeouts; counts computed live.
--   * NO new constraints: stale versions are legitimate versioning semantics; the storm was a rate
--     problem (root-cause fixed) and detection now belongs to the row-growth gauge (venture_artifacts
--     added to GOVERNANCE_TABLES in this same SD).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtext('venture_artifacts_storm_purge'));

-- 0) One-shot guard: abort if a prior run's quarantine exists.
DO $storm_guard$
BEGIN
  IF to_regclass('public.venture_artifacts_storm_quarantine_20260610') IS NOT NULL THEN
    RAISE EXCEPTION 'purge aborted: quarantine table already exists — prior run detected, investigate before re-running';
  END IF;
END
$storm_guard$;

-- 1) Quarantine snapshot: exactly the stale rows of the 3 storm types.
CREATE TABLE venture_artifacts_storm_quarantine_20260610 AS
SELECT * FROM venture_artifacts
WHERE is_current = false
  AND artifact_type IN ('launch_test_plan', 'blueprint_sprint_plan', 'build_security_audit');

-- 2) Pre-asserts: quarantine non-empty, count parity with the live predicate, and the
--    CURRENT-ROW TRIPWIRE (zero is_current=true rows quarantined).
DO $storm_pre$
DECLARE
  v_quar bigint;
  v_live bigint;
  v_current bigint;
BEGIN
  SELECT count(*) INTO v_quar FROM venture_artifacts_storm_quarantine_20260610;
  SELECT count(*) INTO v_live FROM venture_artifacts
    WHERE is_current = false
      AND artifact_type IN ('launch_test_plan', 'blueprint_sprint_plan', 'build_security_audit');
  SELECT count(*) INTO v_current FROM venture_artifacts_storm_quarantine_20260610 WHERE is_current = true;

  IF v_quar = 0 THEN
    RAISE EXCEPTION 'purge aborted: quarantine is empty (nothing matches the storm predicate)';
  END IF;
  IF v_quar <> v_live THEN
    RAISE EXCEPTION 'purge aborted: quarantine % <> live predicate count % (snapshot incomplete)', v_quar, v_live;
  END IF;
  IF v_current <> 0 THEN
    RAISE EXCEPTION 'purge aborted: % is_current=true row(s) in quarantine — predicate breached, NEVER delete current artifacts', v_current;
  END IF;

  RAISE NOTICE 'storm purge: quarantined % stale rows (0 current rows — tripwire clean)', v_quar;
END
$storm_pre$;

-- 3) Backup-bound DELETE: exactly the quarantined rows, by id.
DELETE FROM venture_artifacts va
USING venture_artifacts_storm_quarantine_20260610 q
WHERE va.id = q.id;

-- 4) Post-assert: no rows matching the storm predicate remain.
DO $storm_post$
DECLARE
  v_remaining bigint;
BEGIN
  SELECT count(*) INTO v_remaining FROM venture_artifacts
    WHERE is_current = false
      AND artifact_type IN ('launch_test_plan', 'blueprint_sprint_plan', 'build_security_audit');
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'purge failed: % predicate-matching row(s) still present after delete', v_remaining;
  END IF;
  RAISE NOTICE 'storm purge: complete — stale storm residue removed; current rows untouched';
END
$storm_post$;
