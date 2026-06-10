-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 — FR-1
--
-- Rolls back the purge by restoring management_reviews to its pre-purge state.
--
-- ORDER MATTERS: the UNIQUE(review_date, review_type) guard MUST be dropped FIRST. The quarantine
-- table contains ~44,883 rows that all share review_type='weekly' with many duplicate review_date
-- values, so re-inserting them while the constraint exists would violate it (23505) and fail the
-- rollback. Dropping the constraint first returns the table to exactly its original (unconstrained)
-- shape, then the rows are restored.
--
-- ON CONFLICT (id) DO NOTHING makes the re-insert idempotent and safe if some rows were already
-- restored or re-created by the (now upserting) writers. Apply ONLY to undo the purge, via:
--   node scripts/apply-migration.js database/migrations/20260610_purge_management_reviews_pollution_DOWN.sql --prod-deploy
-- (issue a fresh single-use token first). The quarantine table is retained until a verification
-- window passes, then may be dropped manually.

ALTER TABLE management_reviews
  DROP CONSTRAINT IF EXISTS management_reviews_review_date_type_key;

INSERT INTO management_reviews
SELECT * FROM management_reviews_quarantine_20260610
ON CONFLICT (id) DO NOTHING;
