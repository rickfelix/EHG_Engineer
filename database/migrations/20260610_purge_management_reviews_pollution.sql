-- @approved-by: codestreetlabs@gmail.com
-- Migration: Reversible purge of ALL test-pollution rows from management_reviews + durable UNIQUE guard
-- SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 — FR-1 (child of SD-LEO-INFRA-REVIVE-EVA-MASTER-001)
--
-- ⚠ DO NOT run this file with apply-migration.js --split-statements. The named dollar-quoted DO
--   blocks ($purge_pre$ / $purge_post$) are only safe on the DEFAULT single-query path;
--   splitPostgreSQLStatements recognizes bare $$ but not named $tag$ and would shred the DO blocks.
--
-- WHAT: management_reviews held ~44,964 rows (live-verified 2026-06-10), ALL of them test pollution:
--       every row review_type='weekly', and ZERO rows carry any human-decision signal (chairman_notes,
--       chairman_approved_proposals, overall_score, eva_proposals, decisions, actions — all empty).
--       Two bare .insert writers (scripts/eva/management-review-round.mjs:199 and
--       scripts/pipeline/management-review-generator.js:343) let any test/fleet invocation append a row,
--       drowning the chairman Reviews surface that the EVA Master Scheduler revival is about to make live.
--       Chairman keep-predicate (confirmed 2026-06-09): DELETE ALL rows, quarantine-first. No keep rows.
--
-- DEPLOY ORDERING (operational, enforced outside this file): the paired writer change converts both
--   writers to .upsert(onConflict 'review_date,review_type'), which REQUIRES this UNIQUE constraint to
--   exist or it throws 42P10. Therefore APPLY THIS MIGRATION FIRST, verify the constraint exists, THEN
--   merge/deploy the writer code. Migration and writer code ship on ONE branch; only the apply-order
--   matters. (Adversarial verification wf_5071dc05 — the only true blocker was this ordering.)
--
-- SAFETY (recipe: SD-LEO-INFRA-BULK-PURGE-LIVE-001 / PR #4497; hardened per wf_5071dc05):
--   * REVERSIBLE: management_reviews_quarantine_20260610 holds EVERY deleted row; the DOWN migration
--     drops the new constraint and re-inserts them (with a post-restore completeness assertion).
--   * RACE-SAFE: LOCK TABLE ... ACCESS EXCLUSIVE blocks all concurrent management_reviews writers for
--     the whole transaction, so the snapshot == the deleted set and no same-day duplicate can sneak in
--     between the DELETE and the ADD CONSTRAINT. lock_timeout/statement_timeout bound the wait so a
--     contended apply aborts cleanly instead of stalling the live table.
--   * FRESH SNAPSHOT: aborts if the quarantine table already exists (a prior run) rather than reusing a
--     stale snapshot or clobbering an existing backup.
--   * SAFE-BY-CONSTRUCTION KEEP-PREDICATE: the pre-assert aborts if ANY human-decision column is
--     populated (not just the 2 chairman columns), so a future genuine review can never be silently
--     deleted. Verified live: this broadened predicate currently matches 0 rows.
--   * GUARDED: pre-assert (quarantine count == live count) and post-assert (live count == 0) RAISE
--     EXCEPTION on mismatch — aborting the whole transaction. Counts are computed LIVE; nothing hardcoded.
--   * apply-migration.js wraps this in BEGIN/COMMIT with path + global advisory locks and runs prior
--     setup queries in the same tx (SET TRANSACTION ISOLATION LEVEL unavailable — the ACCESS EXCLUSIVE
--     lock is the isolation mechanism here).
--
-- BOUNDARIES: management_reviews only. Adds UNIQUE(review_date, review_type). Does NOT touch any other
--   table and does NOT modify the writer code (that is the paired code change in the same SD/branch).

-- Bound the lock acquisition and total statement time so a contended apply fails clean rather than
-- stalling the live table indefinitely (no global timeout is set by apply-migration.js).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtext('management_reviews_pollution_purge'));

-- 0a) One-shot guard: this purge must start from a clean slate. If the quarantine table already exists,
--     a prior run happened — abort rather than risk a stale snapshot or clobbering an existing backup.
--     (On a transactional rollback of a failed apply the CREATE below rolls back too, so a legit retry
--     still finds no table.)
DO $purge_guard$
BEGIN
  IF to_regclass('public.management_reviews_quarantine_20260610') IS NOT NULL THEN
    RAISE EXCEPTION 'purge aborted: quarantine table management_reviews_quarantine_20260610 already exists — prior run detected, investigate before re-running';
  END IF;
END
$purge_guard$;

-- 0b) Hard lock: block ALL concurrent management_reviews writers for the duration of this transaction.
LOCK TABLE management_reviews IN ACCESS EXCLUSIVE MODE;

-- 1) Full quarantine snapshot (reversibility source for the DOWN migration). Plain CREATE TABLE (not
--    IF NOT EXISTS) — the 0a guard already proved the table is absent, and DDL is transactional so a
--    failed apply rolls this back.
CREATE TABLE management_reviews_quarantine_20260610 AS
SELECT * FROM management_reviews;

-- 2) Pre-assertions: quarantine non-empty, holds EVERY live row (count parity proves a full snapshot),
--    and the keep-predicate STILL holds — abort if ANY human-decision signal exists in any column.
--    The human-signal check is a live tripwire: if the cadence was revived early and a genuine review
--    landed (chairman notes, an overall_score, recorded decisions/actions, or EVA proposals), abort and
--    escalate rather than delete a real review.
DO $purge_pre$
DECLARE
  v_live  bigint;
  v_quar  bigint;
  v_human bigint;
BEGIN
  SELECT count(*) INTO v_live FROM management_reviews;
  SELECT count(*) INTO v_quar FROM management_reviews_quarantine_20260610;
  SELECT count(*) INTO v_human FROM management_reviews
    WHERE chairman_notes IS NOT NULL
       OR chairman_approved_proposals IS NOT NULL
       OR overall_score IS NOT NULL
       OR (jsonb_typeof(eva_proposals) = 'array'  AND jsonb_array_length(eva_proposals) > 0)
       OR (jsonb_typeof(eva_proposals) = 'object' AND eva_proposals <> '{}'::jsonb)
       OR (jsonb_typeof(decisions) = 'array' AND jsonb_array_length(decisions) > 0)
       OR (jsonb_typeof(actions)   = 'array' AND jsonb_array_length(actions)   > 0);

  IF v_quar = 0 THEN
    RAISE EXCEPTION 'purge aborted: quarantine is empty (nothing to purge)';
  END IF;
  IF v_quar <> v_live THEN
    RAISE EXCEPTION 'purge aborted: quarantine % <> live % (snapshot is not a full copy)', v_quar, v_live;
  END IF;
  IF v_human <> 0 THEN
    RAISE EXCEPTION 'purge aborted: % row(s) carry a human-decision signal — keep-predicate (DELETE ALL) no longer valid, escalate to chairman', v_human;
  END IF;

  RAISE NOTICE 'purge: quarantined % rows (all pollution, 0 human-decision rows)', v_quar;
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
