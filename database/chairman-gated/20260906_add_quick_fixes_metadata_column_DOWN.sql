-- SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E) FR-5 — rollback for
-- 20260906_add_quick_fixes_metadata_column.sql.
--
-- @approved-by: <PENDING -- rollback carries the same ceremony as the UP migration>
--
-- Safe: the column is additive-only, and every reader/writer (lib/fleet/qf-metadata-merge.mjs,
-- claim-stamp.cjs's QF-shaped auto-route) degrades fail-soft on its absence by construction — no
-- other migration or code path depends on this column existing.

ALTER TABLE quick_fixes DROP COLUMN IF EXISTS metadata;
