-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for SD-LEO-INFRA-BULK-PURGE-LIVE-001 — FR-1
--
-- Rolls back the bulk purge by re-inserting every purged row from the backup table.
-- ON CONFLICT (id) DO NOTHING makes it idempotent and safe if some rows were already
-- restored or re-created. Apply ONLY to undo the purge, via:
--   node scripts/apply-migration.js database/migrations/20260609_bulk_purge_orphan_sd_baseline_items_DOWN.sql --prod-deploy
-- (issue a fresh single-use token first). The backup table is retained until a
-- verification window passes, then may be dropped manually.

INSERT INTO sd_baseline_items
SELECT * FROM sd_baseline_items_purge_backup_20260609
ON CONFLICT (id) DO NOTHING;
