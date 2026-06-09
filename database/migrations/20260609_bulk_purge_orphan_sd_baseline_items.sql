-- @approved-by: codestreetlabs@gmail.com
-- Migration: Reversible bulk purge of dead-orphan sd_baseline_items
-- SD-LEO-INFRA-BULK-PURGE-LIVE-001 — FR-1
--
-- WHAT: Delete sd_baseline_items rows whose sd_id joins to NO real strategic_directives_v2,
--       using the DUAL-column predicate (sd.sd_key = bi.sd_id OR sd.id::text = bi.sd_id).
--       ~86% of the table is dead orphans (test-fixture leak: no FK / ON DELETE CASCADE),
--       which degrades the v_sd_next_candidates self-claim queue fleet-wide.
--
-- SAFETY (DATABASE + prospective evidence ee1d3194 / 6fb46651):
--   * DUAL-column predicate is MANDATORY. A sd_key-only predicate would false-orphan ~1,134
--     LIVE legacy rows keyed off id (historical NEW.id trigger) = irreversible data loss +
--     would re-break v_sd_next_candidates. orphan-set ∩ live-set = 0 was proven.
--   * REVERSIBLE: a full backup table holds every purged row; the DOWN migration re-inserts.
--   * CONCURRENCY-SAFE under READ COMMITTED (apply-migration.js runs prior queries in the tx,
--     so SET TRANSACTION ISOLATION LEVEL is unavailable): the DELETE is bound to the backup
--     snapshot AND re-checks orphan-hood at delete time — an orphan "rescued" by a concurrent
--     SD insert is skipped, never lost. apply-migration.js wraps this in BEGIN/COMMIT with
--     path + global advisory locks; the named lock below is additional defense.
--   * Counts are computed LIVE; nothing is hardcoded.
--
-- BOUNDARIES: sd_baseline_items only. Does NOT touch strategic_directives_v2 SD rows and does
--   NOT modify fn_sync_sd_to_baseline (it is already correct; the id-keyed rows are legacy data
--   the dual-join predicate handles).

SELECT pg_advisory_xact_lock(hashtext('sd_baseline_items_bulk_purge'));

-- 1) Full backup of the dual-join orphans (reversibility source for the DOWN migration).
--    DDL is transactional in Postgres: if any assertion below fails, this CREATE rolls back too.
CREATE TABLE IF NOT EXISTS sd_baseline_items_purge_backup_20260609 AS
SELECT bi.*
FROM sd_baseline_items bi
WHERE NOT EXISTS (
  SELECT 1 FROM strategic_directives_v2 sd
  WHERE sd.sd_key = bi.sd_id OR sd.id::text = bi.sd_id
);

-- 2) Pre-assertions: backup non-empty, within the 95% ceiling, and every backed-up row is
--    genuinely an orphan (guards a mis-scoped or runaway predicate before any delete).
DO $purge_pre$
DECLARE
  v_total  int;
  v_backup int;
BEGIN
  SELECT count(*) INTO v_total  FROM sd_baseline_items;
  SELECT count(*) INTO v_backup FROM sd_baseline_items_purge_backup_20260609;

  IF v_backup = 0 THEN
    RAISE EXCEPTION 'purge aborted: backup is empty (no orphans to purge)';
  END IF;
  IF v_backup > v_total * 0.95 THEN
    RAISE EXCEPTION 'purge aborted: backup % exceeds 95%% ceiling of total %', v_backup, v_total;
  END IF;
  IF EXISTS (
    SELECT 1 FROM sd_baseline_items_purge_backup_20260609 b
    WHERE EXISTS (
      SELECT 1 FROM strategic_directives_v2 sd
      WHERE sd.sd_key = b.sd_id OR sd.id::text = b.sd_id
    )
  ) THEN
    RAISE EXCEPTION 'purge aborted: backup contains a row joined to a live SD (predicate mis-scoped)';
  END IF;

  RAISE NOTICE 'purge: backing up % orphans of % total rows', v_backup, v_total;
END
$purge_pre$;

-- 3) Delete ONLY backup rows that are STILL orphans at delete time (snapshot-precise +
--    concurrency-safe — a row rescued by a concurrent SD insert is left untouched).
DELETE FROM sd_baseline_items bi
USING sd_baseline_items_purge_backup_20260609 b
WHERE bi.id = b.id
  AND NOT EXISTS (
    SELECT 1 FROM strategic_directives_v2 sd
    WHERE sd.sd_key = bi.sd_id OR sd.id::text = bi.sd_id
  );

-- 4) Post-assertion: no backed-up row that is still an orphan remains in the live table.
DO $purge_post$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM sd_baseline_items bi
  JOIN sd_baseline_items_purge_backup_20260609 b ON b.id = bi.id
  WHERE NOT EXISTS (
    SELECT 1 FROM strategic_directives_v2 sd
    WHERE sd.sd_key = bi.sd_id OR sd.id::text = bi.sd_id
  );
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'purge failed: % backed-up orphans still present after delete', v_remaining;
  END IF;
  RAISE NOTICE 'purge: complete — all still-orphan backed-up rows removed';
END
$purge_post$;
