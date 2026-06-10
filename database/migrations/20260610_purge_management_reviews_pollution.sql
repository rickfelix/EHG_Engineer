-- @approved-by: codestreetlabs@gmail.com
-- Migration: Reversible purge of ALL test-pollution rows from management_reviews + durable UNIQUE guard
-- SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 — FR-1 (child of SD-LEO-INFRA-REVIVE-EVA-MASTER-001)
--
-- WHAT: management_reviews held ~44,883 rows (live-verified 2026-06-10, growing per-second), ALL of
--       them test pollution: every row review_type='weekly', ZERO chairman_notes, ZERO
--       chairman_approved_proposals. Two bare .insert writers
--       (scripts/eva/management-review-round.mjs:199 and scripts/pipeline/management-review-generator.js:343)
--       let any test/fleet invocation append a row, drowning the chairman Reviews surface that the
--       EVA Master Scheduler revival is about to make live again.
--       Chairman keep-predicate (confirmed 2026-06-09): DELETE ALL rows, quarantine-first. No keep rows exist.
--
-- SAFETY (recipe: SD-LEO-INFRA-BULK-PURGE-LIVE-001 / PR #4497):
--   * REVERSIBLE: management_reviews_quarantine_20260610 holds EVERY deleted row; the DOWN migration
--     drops the new constraint and re-inserts them.
--   * RACE-SAFE: pollution arrives per-second. LOCK TABLE ... ACCESS EXCLUSIVE blocks all concurrent
--     management_reviews writers for the whole transaction, so (a) the quarantine snapshot == the
--     deleted set, and (b) no same-day duplicate (review_date, review_type) can sneak in between the
--     DELETE and the ADD CONSTRAINT (which would otherwise abort the constraint add).
--   * GUARDED: pre-assert (quarantine count == live count AND zero chairman-touched rows) and
--     post-assert (live count == 0) RAISE EXCEPTION on mismatch — aborting the whole transaction
--     before/after the irreversible DELETE. Counts are computed LIVE; nothing is hardcoded.
--   * apply-migration.js wraps this in BEGIN/COMMIT with path + global advisory locks and runs prior
--     setup queries in the same tx (so SET TRANSACTION ISOLATION LEVEL is unavailable — the
--     ACCESS EXCLUSIVE lock is the isolation mechanism here).
--
-- BOUNDARIES: management_reviews only. Adds UNIQUE(review_date, review_type). Does NOT touch any other
--   table and does NOT modify the writer code (that is a separate code change in the same SD).

SELECT pg_advisory_xact_lock(hashtext('management_reviews_pollution_purge'));

-- 0) Hard lock: block ALL concurrent management_reviews writers for the duration of this transaction.
--    Mandatory — rows arrive per-second; without this the snapshot/delete/constraint sequence races
--    and a late same-day insert would abort the UNIQUE add after the DELETE already ran.
LOCK TABLE management_reviews IN ACCESS EXCLUSIVE MODE;

-- 1) Full quarantine snapshot (reversibility source for the DOWN migration).
--    DDL is transactional in Postgres: if any assertion below fails, this CREATE rolls back too.
CREATE TABLE IF NOT EXISTS management_reviews_quarantine_20260610 AS
SELECT * FROM management_reviews;

-- 2) Pre-assertions: quarantine non-empty, holds EVERY live row (count parity proves a full snapshot),
--    and the chairman keep-predicate STILL holds (zero chairman-touched rows). The chairman check is a
--    live tripwire: if the cadence was revived early and a genuine review landed, abort and escalate
--    rather than delete a real review.
DO $purge_pre$
DECLARE
  v_live     bigint;
  v_quar     bigint;
  v_chairman bigint;
BEGIN
  SELECT count(*) INTO v_live FROM management_reviews;
  SELECT count(*) INTO v_quar FROM management_reviews_quarantine_20260610;
  SELECT count(*) INTO v_chairman FROM management_reviews
    WHERE chairman_notes IS NOT NULL OR chairman_approved_proposals IS NOT NULL;

  IF v_quar = 0 THEN
    RAISE EXCEPTION 'purge aborted: quarantine is empty (nothing to purge)';
  END IF;
  IF v_quar <> v_live THEN
    RAISE EXCEPTION 'purge aborted: quarantine % <> live % (snapshot is not a full copy)', v_quar, v_live;
  END IF;
  IF v_chairman <> 0 THEN
    RAISE EXCEPTION 'purge aborted: % chairman-touched row(s) present — keep-predicate (DELETE ALL) no longer valid, escalate to chairman', v_chairman;
  END IF;

  RAISE NOTICE 'purge: quarantined % rows (all pollution, 0 chairman-touched)', v_quar;
END
$purge_pre$;

-- 3) Backup-bound DELETE: remove exactly the quarantined rows, by id. Equivalent to a full delete here
--    (all rows are pollution) but the bound form proves deleted-set == quarantined-set, making the DOWN
--    migration a perfect inverse.
DELETE FROM management_reviews mr
USING management_reviews_quarantine_20260610 q
WHERE mr.id = q.id;

-- 4) Post-assertion: the table is empty (every row was pollution and every row is now gone).
DO $purge_post$
DECLARE
  v_remaining bigint;
BEGIN
  SELECT count(*) INTO v_remaining FROM management_reviews;
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'purge failed: % row(s) still present after delete', v_remaining;
  END IF;
  RAISE NOTICE 'purge: complete — management_reviews emptied';
END
$purge_post$;

-- 5) Durable anti-recurrence guard: at most ONE row per (review_date, review_type) forever after.
--    Safe to add now — the table is empty, so no existing duplicate can block it. Paired with the
--    upsert(onConflict 'review_date,review_type') code change so legitimate same-day re-runs update
--    in place instead of throwing 23505.
ALTER TABLE management_reviews
  ADD CONSTRAINT management_reviews_review_date_type_key UNIQUE (review_date, review_type);
