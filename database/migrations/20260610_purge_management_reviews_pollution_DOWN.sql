-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 — FR-1
--
-- ⚠ DO NOT run with apply-migration.js --split-statements (named $restore_post$ DO block).
--
-- Rolls back the purge by restoring management_reviews to its pre-purge state.
--
-- ORDER MATTERS: the UNIQUE(review_date, review_type) guard MUST be dropped FIRST. The quarantine
-- table contains ~44,964 rows that all share review_type='weekly' with many duplicate review_date
-- values, so re-inserting them while the constraint exists would violate it (23505) and fail the
-- rollback. Dropping the constraint first returns the table to exactly its original (unconstrained)
-- shape, then the rows are restored.
--
-- COLUMN-EXPLICIT insert (not SELECT *) so that if a column was ADDED to management_reviews during the
-- verification window before this DOWN runs, the restore fails LOUDLY (column count mismatch) instead
-- of silently misaligning positional values.
--
-- ON CONFLICT (id) DO NOTHING makes the re-insert idempotent if some rows were already restored or
-- re-created by the (now upserting) writers; a post-restore assertion then RAISES if any quarantined id
-- failed to land, turning a silent drop into a loud, transactional abort.
--
-- Apply ONLY to undo the purge, via:
--   node scripts/apply-migration.js database/migrations/20260610_purge_management_reviews_pollution_DOWN.sql --prod-deploy
-- (issue a fresh single-use token first). The quarantine table is retained until a verification window
-- passes, then may be dropped manually.

ALTER TABLE management_reviews
  DROP CONSTRAINT IF EXISTS management_reviews_review_date_type_key;

INSERT INTO management_reviews (
  id, review_date, review_type, baseline_version_from, baseline_version_to,
  planned_capabilities, actual_capabilities, planned_ventures, actual_ventures,
  planned_sds, actual_sds, okr_snapshot, risk_snapshot, strategy_health,
  decisions, actions, pipeline_snapshot, eva_narrative, eva_proposals,
  chairman_notes, chairman_approved_proposals, overall_score, created_at
)
SELECT
  id, review_date, review_type, baseline_version_from, baseline_version_to,
  planned_capabilities, actual_capabilities, planned_ventures, actual_ventures,
  planned_sds, actual_sds, okr_snapshot, risk_snapshot, strategy_health,
  decisions, actions, pipeline_snapshot, eva_narrative, eva_proposals,
  chairman_notes, chairman_approved_proposals, overall_score, created_at
FROM management_reviews_quarantine_20260610
ON CONFLICT (id) DO NOTHING;

-- Post-restore assertion: every quarantined id must now be present in the live table. If a writer
-- re-created an id-colliding row during the verification window, ON CONFLICT (id) DO NOTHING would have
-- silently kept the live row and dropped the quarantine copy — fail loudly so that is investigated
-- rather than silently losing the original.
DO $restore_post$
DECLARE
  v_missing bigint;
BEGIN
  SELECT count(*) INTO v_missing
  FROM management_reviews_quarantine_20260610 q
  WHERE NOT EXISTS (SELECT 1 FROM management_reviews mr WHERE mr.id = q.id);
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'rollback incomplete: % quarantined row(s) are not present after restore (id collision drop) — investigate', v_missing;
  END IF;
  RAISE NOTICE 'rollback: complete — all quarantined rows restored';
END
$restore_post$;
